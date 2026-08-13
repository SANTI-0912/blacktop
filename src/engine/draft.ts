import { RNG, clamp, pick, randInt } from "./rng";
import { NBA_TEAMS, Team } from "./teams";

// ============================================================
// NBA DRAFT
//
// The game creates the OPPORTUNITIES; the player chooses the destination
// (or takes a random one for a genuinely different run). Draft order is
// procedural, so no two careers see the same board, and a team picking #24
// never behaves like it holds #1.
// ============================================================

export type DraftSlot = {
  pick: number;
  team: Team;
  /** Only teams whose pick is realistic for this player are selectable. */
  interested: boolean;
  expectedRole: string;
  championshipWindow: number; // 0-3 flames
  competition: "Low" | "Medium" | "High";
  market: "Small" | "Medium" | "Elite";
};

export type DraftBoard = {
  year: number;
  slots: DraftSlot[];
  /** Where the player is projected to go. */
  projectedPick: number;
};

/**
 * Weak teams pick early. The order is shuffled within tiers each run so the
 * same franchise doesn't always hold the same slot.
 */
export function buildDraftBoard(rng: RNG, playerOvr: number, year: number): DraftBoard {
  const pool = [...NBA_TEAMS];
  // Lottery odds: the worse the team, the earlier it picks — with noise.
  const ordered = pool
    .map((t) => ({ t, key: t.ovr + randInt(rng, -8, 8) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.t);

  // Projection must fit the actual board size — clamping to 30 while only 16
  // teams hold picks left high projections with zero interested teams, which
  // dead-ended the draft screen entirely.
  const projectedPick = clamp(Math.round(ordered.length + 4 - playerOvr * 0.20 + randInt(rng, -2, 2)), 1, ordered.length);

  const slots: DraftSlot[] = ordered.map((team, i) => {
    const pick = i + 1;
    // A team only realistically drafts you within a window of your projection.
    // Always leave a viable set: teams near the projection, plus anyone later.
    const interested = Math.abs(pick - projectedPick) <= 5 || pick >= projectedPick;
    const gap = playerOvr - team.ovr;

    return {
      pick,
      team,
      interested,
      expectedRole:
        gap >= 3 ? "Franchise Player" :
        gap >= -4 ? "Starter" :
        gap >= -11 ? "Rotation" : "Bench",
      championshipWindow: team.ovr >= 88 ? 3 : team.ovr >= 82 ? 2 : team.ovr >= 76 ? 1 : 0,
      competition: team.ovr >= 87 ? "High" : team.ovr >= 79 ? "Medium" : "Low",
      market: team.market === "LARGE" ? "Elite" : team.market === "MID" ? "Medium" : "Small",
    };
  });

  return { year, slots, projectedPick };
}

/**
 * This is a career FANTASY simulator, so every franchise is a valid
 * destination — a Warriors fan should be able to build that career. Teams near
 * the projection are surfaced first, but nothing is filtered out.
 */
export function selectableSlots(board: DraftBoard): DraftSlot[] {
  return [...board.slots].sort((a, b) => {
    if (a.interested !== b.interested) return a.interested ? -1 : 1;
    return a.pick - b.pick;
  });
}

/** Just the realistic ones, for the random path. */
export function realisticSlots(board: DraftBoard): DraftSlot[] {
  const fit = board.slots.filter((s) => s.interested);
  return fit.length ? fit : board.slots;
}

export function randomSlot(rng: RNG, board: DraftBoard): DraftSlot {
  const options = realisticSlots(board);
  return options.length ? pick(rng, options) : board.slots[board.slots.length - 1];
}

/** Rookie scale money follows the pick, so going #1 actually pays. */
export function rookieSalary(pick: number): number {
  return clamp(Math.round(13 - pick * 0.34), 2, 13);
}
