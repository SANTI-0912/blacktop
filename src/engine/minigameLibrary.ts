import { Attributes } from "./types";
import { RNG, clamp, weighted } from "./rng";

// ============================================================
// MINIGAME LIBRARY
//
// Every minigame shares ONE structure: progressive rounds, each harder than
// the last, and failing a round ends the run. What differs is the mechanic.
// The engine only ever deals in `MinigameKind` + `RoundSpec`; the UI owns the
// actual mechanics. Adding a new minigame means adding a kind here and a
// component in ui/minigames — the career engine never changes.
//
// Governing rule: STATS INFLUENCE THE GAME. THEY NEVER PLAY IT FOR YOU.
// Attributes move windows/time/tolerance by a bounded amount only.
// ============================================================

export type MinigameKind =
  | "SIMON"
  | "REACTION"
  | "HOT_ZONE"
  | "PERFECT_TIMING"
  | "READ_THE_PLAY"
  | "CLUTCH_BOARD"
  | "CLUTCH_SHOT"
  | "HALF_COURT"
  | "MEMORY_MATCH";

export const MINIGAME_NAME: Record<MinigameKind, string> = {
  SIMON: "Simon Sequence",
  REACTION: "Reaction",
  HOT_ZONE: "Hot Zone",
  PERFECT_TIMING: "Perfect Timing",
  READ_THE_PLAY: "Read the Play",
  CLUTCH_BOARD: "Clutch Board",
  CLUTCH_SHOT: "Clutch Shot",
  HALF_COURT: "Half-Court Clutch",
  MEMORY_MATCH: "Memory Match",
};

// Which attribute each minigame leans on — used both for the (moderate)
// difficulty modifier and for what the run can develop.
export const MINIGAME_ATTRIBUTE: Record<MinigameKind, keyof Attributes> = {
  SIMON: "basketballIQ",
  REACTION: "athleticism",
  HOT_ZONE: "shooting",
  PERFECT_TIMING: "shooting",
  READ_THE_PLAY: "passing",
  CLUTCH_BOARD: "basketballIQ",
  CLUTCH_SHOT: "shooting",
  HALF_COURT: "clutch",
  MEMORY_MATCH: "basketballIQ",
};

/** MEMORY_MATCH's fixed 4x4 board normally gives 3 lives — a Basketball IQ
 * above this earns a 4th. A discrete, bounded nudge (not a continuous scale
 * like windowScale/timeScale below), since "lives" is a whole-number concept. */
export const MEMORY_MATCH_BONUS_LIFE_THRESHOLD = 85;

export type EventImportance = "REGULAR" | "PLAYOFF" | "CONF_FINALS" | "FINALS" | "GAME_7" | "OLYMPIC";

/** How forgiving this run is, derived from attributes. Bounded on purpose. */
export type RoundMods = {
  /** >1 = bigger targets / wider windows. Clamped to a modest band. */
  windowScale: number;
  /** >1 = more time to react or decide. */
  timeScale: number;
  /** Extra lives for a high-enough governing attribute — 0 for every
   * mechanic except MEMORY_MATCH, whose "lives" are a discrete count
   * rather than a continuous window/time scale. */
  livesBonus: number;
};

export type RoundSpec = {
  index: number;
  kind: MinigameKind;
  /** 0 = first round, 1 = hardest round. Drives every mechanic's ramp. */
  difficulty: number;
  mods: RoundMods;
};

export type Gauntlet = {
  rounds: RoundSpec[];
  /** Rounds that must be survived for the event to count as a win. */
  roundsToWin: number;
  /** Kind shown in the intro (for single-mechanic gauntlets). */
  headlineKind: MinigameKind;
  varied: boolean; // Olympics-style: a different mechanic each round
};

/* ---------------- Selection ---------------- */

// CLUTCH_BOARD (tic-tac-toe) and MEMORY_MATCH are deliberately ABSENT from
// every tournament table — neither can eliminate a career. Both live only in
// the development system below, where losing costs an opportunity rather
// than a season (MEMORY_MATCH in particular tests recall under a shrinking
// preview window, which reads as unfair pressure when a whole playoff run
// rides on it — it's a much better fit for a no-risk bonus round).
// Half-court is reserved for the biggest moments so a February game never
// feels like a Game 7.
const WEIGHTS: Record<EventImportance, Partial<Record<MinigameKind, number>>> = {
  REGULAR:     { SIMON: 3, REACTION: 3, HOT_ZONE: 3, PERFECT_TIMING: 3, READ_THE_PLAY: 3, CLUTCH_SHOT: 2 },
  PLAYOFF:     { SIMON: 3, REACTION: 3, HOT_ZONE: 3, PERFECT_TIMING: 3, READ_THE_PLAY: 3, CLUTCH_SHOT: 3 },
  CONF_FINALS: { SIMON: 3, REACTION: 3, HOT_ZONE: 3, PERFECT_TIMING: 3, READ_THE_PLAY: 3, CLUTCH_SHOT: 4, HALF_COURT: 2 },
  FINALS:      { SIMON: 3, REACTION: 3, HOT_ZONE: 3, PERFECT_TIMING: 3, READ_THE_PLAY: 3, CLUTCH_SHOT: 4, HALF_COURT: 4 },
  GAME_7:      { SIMON: 2, REACTION: 2, HOT_ZONE: 2, PERFECT_TIMING: 2, READ_THE_PLAY: 2, CLUTCH_SHOT: 4, HALF_COURT: 6 },
  OLYMPIC:     { SIMON: 3, REACTION: 3, HOT_ZONE: 3, PERFECT_TIMING: 3, READ_THE_PLAY: 3, CLUTCH_SHOT: 3, HALF_COURT: 2 },
};

/** Mechanics allowed in the development (offseason workout) system — no-risk,
 * so this is also where a mechanic that tests memory/recall under time
 * pressure belongs instead of in a tournament that can end a season. */
export const DEVELOPMENT_MINIGAMES: MinigameKind[] = ["CLUTCH_BOARD", "HOT_ZONE", "SIMON", "MEMORY_MATCH"];

/**
 * Picks a mechanic procedurally. `recent` is the player's last few minigames;
 * anything in it is heavily de-weighted so careers don't feel repetitive.
 */
export function pickMinigame(rng: RNG, importance: EventImportance, recent: MinigameKind[]): MinigameKind {
  const table = WEIGHTS[importance];
  const entries = (Object.keys(table) as MinigameKind[]).map((k) => {
    let w = table[k] ?? 0;
    const idx = recent.indexOf(k);
    if (idx >= 0) {
      // Most recent gets hit hardest; older ones recover.
      w *= idx === 0 ? 0.08 : idx === 1 ? 0.3 : 0.6;
    }
    return { item: k, weight: Math.max(w, 0.02) };
  });
  return weighted(rng, entries);
}

/* ---------------- Modifiers from attributes ---------------- */

// Deliberately narrow band: roughly ±18% window, ±15% time across the whole
// 40-99 attribute range. Enough to feel, never enough to auto-win.
export function modsFor(kind: MinigameKind, attrs: Attributes, roundDifficulty: number): RoundMods {
  const key = MINIGAME_ATTRIBUTE[kind];
  const norm = clamp((attrs[key] - 60) / 45, -0.5, 1); // ~-0.5 .. 1
  const clutchNorm = clamp((attrs.clutch - 60) / 45, -0.5, 1);

  // Clutch only helps in the later, harder rounds — where it should.
  const lateBonus = clutchNorm * 0.12 * roundDifficulty;

  const livesBonus =
    kind === "MEMORY_MATCH" && attrs.basketballIQ > MEMORY_MATCH_BONUS_LIFE_THRESHOLD ? 1 : 0;

  return {
    windowScale: clamp(1 + norm * 0.18 + lateBonus, 0.82, 1.3),
    timeScale: clamp(1 + norm * 0.15 + lateBonus, 0.85, 1.28),
    livesBonus,
  };
}

/* ---------------- Building a gauntlet ---------------- */

export function buildGauntlet(params: {
  rng: RNG;
  importance: EventImportance;
  attributes: Attributes;
  /** From the team-context scaling in challenge.ts. */
  roundCount: number;
  roundsToWin: number;
  recent: MinigameKind[];
  /** Olympics uses a different mechanic per round. */
  varied?: boolean;
}): Gauntlet {
  const { rng, importance, attributes, roundCount, roundsToWin, recent, varied } = params;

  const headlineKind = pickMinigame(rng, importance, recent);
  const used: MinigameKind[] = [headlineKind];

  const rounds: RoundSpec[] = [];
  for (let i = 0; i < roundCount; i++) {
    const kind = varied ? pickMinigame(rng, importance, [...used].reverse().slice(0, 3)) : headlineKind;
    if (varied) used.push(kind);
    // Difficulty ramps to 1 on the final level. Now that a whole tournament is
    // ONE session, the curve starts a little higher and finishes harder — the
    // last level should feel like a championship, not another round.
    const t = roundCount > 1 ? i / (roundCount - 1) : 0.5;
    const difficulty = clamp(0.12 + Math.pow(t, 0.85) * 0.92, 0, 1);
    rounds.push({ index: i, kind, difficulty, mods: modsFor(kind, attributes, difficulty) });
  }

  return { rounds, roundsToWin, headlineKind, varied: !!varied };
}

/* ---------------- Development from a run ---------------- */

export type GauntletOutcome = {
  roundsSurvived: number;
  roundsTotal: number;
  eliminated: boolean;
  kinds: MinigameKind[];
};

/**
 * Minigames are a SECONDARY development source — the season focus is primary.
 * Capped at +3 so a lucky run can never outpace deliberate development.
 */
export function developmentFromRun(outcome: GauntletOutcome): { attribute: keyof Attributes; amount: number } | null {
  const { roundsSurvived, roundsTotal, kinds } = outcome;
  if (roundsSurvived === 0 || kinds.length === 0) return null;
  const ratio = roundsSurvived / Math.max(1, roundsTotal);

  let amount = 0;
  if (ratio >= 1) amount = 3;        // perfect run
  else if (ratio >= 0.8) amount = 2;
  else if (ratio >= 0.5) amount = 1;
  else return null;

  // Credit the mechanic the player actually spent the most rounds on.
  const counts = new Map<MinigameKind, number>();
  for (const k of kinds.slice(0, roundsSurvived)) counts.set(k, (counts.get(k) ?? 0) + 1);
  let best: MinigameKind = kinds[0];
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }

  return { attribute: MINIGAME_ATTRIBUTE[best], amount };
}
