import { RNG, pick, clamp } from "./rng";
import { EventImportance } from "./minigameLibrary";
import { NBA_TEAMS, NCAA_TEAMS, Team } from "./teams";

// ============================================================
// TOURNAMENTS
//
// The governing rule of this module:
//   "SIMULATION CREATES THE SITUATION. THE PLAYER CONTROLS THE MOMENT."
//
// The simulation decides WHO you face, the seeding, the score context and how
// much is at stake. It NEVER decides whether you advance. Every elimination
// round is a playable gauntlet: survive it and you move on, fail and your
// season ends there. Nothing is resolved behind the player's back.
// ============================================================

export type TournamentKind = "NCAA" | "NBA_PLAYOFFS" | "OLYMPICS";

export type TourneyRound = {
  id: string;
  label: string;          // "Sweet 16", "Conference Finals", "Gold Medal Game"
  opponent: string;
  opponentId: string | null;
  importance: EventImportance;
  /** 0-1, drives round count and difficulty of the gauntlet. */
  stakes: number;
  /** Extra framing for the biggest rounds. */
  subtitle?: string;
  isFinal: boolean;
  /**
   * Non-interactive stages are simulated for context and ALWAYS advance the
   * player — they exist so a tournament still reads as six rounds without
   * demanding six separate challenges. Elimination only ever happens on an
   * interactive stage, which the player plays.
   */
  interactive: boolean;
};

export type Tournament = {
  kind: TournamentKind;
  title: string;
  rounds: TourneyRound[];
  /** Index of the round currently being played. */
  current: number;
  /** Rounds cleared so far. */
  cleared: number;
  seedLine?: string;
};

// Round of 64 is the entry context. The five real stages are each a LEVEL of
// the one continuous tournament minigame.
const NCAA_ROUNDS = [
  { label: "Round of 64", importance: "REGULAR" as EventImportance, stakes: 0.2, interactive: false },
  { label: "Round of 32", importance: "PLAYOFF" as EventImportance, stakes: 0.4, interactive: true },
  { label: "Sweet 16", importance: "PLAYOFF" as EventImportance, stakes: 0.55, interactive: true },
  { label: "Elite Eight", importance: "CONF_FINALS" as EventImportance, stakes: 0.7, interactive: true },
  { label: "Final Four", importance: "FINALS" as EventImportance, stakes: 0.85, interactive: true },
  { label: "National Championship", importance: "GAME_7" as EventImportance, stakes: 1, interactive: true },
];

const NBA_ROUNDS = [
  { label: "First Round", importance: "PLAYOFF" as EventImportance, stakes: 0.35, sub: "Best of seven", interactive: true },
  { label: "Conference Semifinals", importance: "PLAYOFF" as EventImportance, stakes: 0.5, sub: "Series tied 2–2", interactive: true },
  { label: "Conference Finals", importance: "CONF_FINALS" as EventImportance, stakes: 0.72, sub: "Series tied 3–3", interactive: true },
  { label: "NBA Finals", importance: "FINALS" as EventImportance, stakes: 0.9, sub: "Game 7 · win or go home", interactive: true },
];

// The whole Olympic run is ONE challenge whose levels are the stages.
const OLYMPIC_ROUNDS = [
  { label: "Group Stage", importance: "PLAYOFF" as EventImportance, stakes: 0.3, interactive: true },
  { label: "Quarterfinal", importance: "PLAYOFF" as EventImportance, stakes: 0.5, interactive: true },
  { label: "Semifinal", importance: "CONF_FINALS" as EventImportance, stakes: 0.72, interactive: true },
  { label: "Gold Medal Game", importance: "OLYMPIC" as EventImportance, stakes: 1, interactive: true },
];

const NATIONS = ["United States", "Spain", "France", "Serbia", "Australia", "Canada", "Germany", "Argentina", "Greece", "Lithuania"];

/**
 * Team quality decides how DEEP a run the simulation grants you access to —
 * a weak team may only reach the first round — but never whether you win it.
 */
export function buildTournament(
  rng: RNG,
  kind: TournamentKind,
  teamQuality: number,
  playerTeam: Team | null,
  country: string,
  rival?: { name: string; id: string | null }
): Tournament | null {
  if (kind === "NCAA") {
    // Entry to the tournament itself is earned by the team's season.
    const madeIt = teamQuality > 0.34 || rng.next() < teamQuality * 0.7;
    if (!madeIt) return null;
    // Seeding decides where you enter: strong teams skip early rounds.
    const startIdx = teamQuality > 0.78 ? 1 : 0;
    const defs = NCAA_ROUNDS.slice(startIdx);
    const rivalOk = !!rival && rival.id !== playerTeam?.id;
    const opponents = makeOpponentPool(rng, NCAA_TEAMS, playerTeam, defs.length, rival?.id);
    let rivalLeft = rivalOk;
    const rounds = defs.map((r, i, arr) => {
      const round = makeRound(rng, r.label, r.importance, r.stakes, i === arr.length - 1, opponents[i], undefined, rival, r.interactive, rivalLeft);
      if (rivalLeft && round.opponentId === rival?.id) rivalLeft = false;
      return round;
    });
    return { kind, title: "MARCH MADNESS", rounds, current: 0, cleared: 0, seedLine: `${seedFor(rng, teamQuality)} seed` };
  }

  if (kind === "NBA_PLAYOFFS") {
    const madeIt = teamQuality > 0.42 || rng.next() < teamQuality * 0.55;
    if (!madeIt) return null;
    const rivalOk = !!rival && rival.id !== playerTeam?.id;
    const opponents = makeOpponentPool(rng, NBA_TEAMS, playerTeam, NBA_ROUNDS.length, rival?.id);
    let rivalLeft = rivalOk;
    const rounds = NBA_ROUNDS.map((r, i, arr) => {
      const round = makeRound(rng, r.label, r.importance, r.stakes, i === arr.length - 1, opponents[i], r.sub, rival, r.interactive, rivalLeft);
      if (rivalLeft && round.opponentId === rival?.id) rivalLeft = false;
      return round;
    });
    return { kind, title: "NBA PLAYOFFS", rounds, current: 0, cleared: 0, seedLine: `${seedFor(rng, teamQuality)} seed` };
  }

  const nationPool = NATIONS.filter((n) => n.toLowerCase() !== country.trim().toLowerCase());
  for (let i = nationPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [nationPool[i], nationPool[j]] = [nationPool[j], nationPool[i]];
  }
  const rounds = OLYMPIC_ROUNDS.map((r, i, arr) => {
    const opponent = nationPool[i % nationPool.length];
    return {
      id: `oly_${i}`,
      label: r.label,
      opponent,
      opponentId: null,
      importance: r.importance,
      stakes: r.stakes,
      subtitle: i === arr.length - 1 ? "Gold or nothing" : undefined,
      isFinal: i === arr.length - 1,
      interactive: r.interactive,
    };
  });
  return { kind: "OLYMPICS", title: "OLYMPIC GAMES", rounds, current: 0, cleared: 0 };
}

/**
 * ROOT CAUSE FIX: each round used to draw its opponent independently, with
 * replacement, so the same franchise could legitimately turn up twice in one
 * bracket (facing the Knicks in two different series). An opponent pool is now
 * drawn ONCE per tournament and consumed without replacement — a team you have
 * already beaten cannot reappear, and the player's own team is never in it.
 */
function makeOpponentPool(rng: RNG, pool: Team[], playerTeam: Team | null, count: number, excludeId?: string | null): Team[] {
  // The rival's club is excluded too: he substitutes into a round later, and
  // if he were also in the drawn pool he could face you twice in one bracket.
  const available = pool.filter((t) => t.id !== playerTeam?.id && t.id !== excludeId);
  // Seeded shuffle so replays are identical.
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function makeRound(
  rng: RNG,
  label: string,
  importance: EventImportance,
  stakes: number,
  isFinal: boolean,
  assigned: Team,
  sub?: string,
  rival?: { name: string; id: string | null },
  interactive = true,
  allowRival = false
): TourneyRound {
  // The rival showing up in a late round is what turns a game into a story.
  // He replaces the drawn opponent rather than being an extra entry, and only
  // once per bracket (allowRival is false after he has been placed).
  const useRival = allowRival && !!rival && stakes >= 0.7 && rng.next() < 0.45;
  const opp = useRival ? { name: rival!.name, id: rival!.id } : { name: assigned.name, id: assigned.id as string | null };

  return {
    id: `${label.replace(/\s+/g, "_").toLowerCase()}_${Math.floor(rng.next() * 1e6)}`,
    label,
    opponent: opp.name,
    opponentId: opp.id,
    importance,
    stakes,
    subtitle: sub,
    isFinal,
    interactive,
  };
}

/** The stages the player actually plays — these become the challenge levels. */
export function interactiveRounds(t: Tournament): TourneyRound[] {
  return t.rounds.filter((r) => r.interactive);
}

/**
 * Maps "levels survived in the single long challenge" back onto bracket
 * stages: every simulated stage before a cleared interactive stage is also
 * cleared, because simulated stages never eliminate.
 */
export function stagesClearedFrom(t: Tournament, levelsSurvived: number): number {
  let interactiveSeen = 0;
  let cleared = 0;
  for (const r of t.rounds) {
    if (r.interactive) {
      if (interactiveSeen < levelsSurvived) { interactiveSeen++; cleared++; }
      else break;
    } else {
      cleared++;
    }
  }
  return cleared;
}

function seedFor(rng: RNG, teamQuality: number): string {
  const n = clamp(Math.round(13 - teamQuality * 11 + (rng.next() * 2 - 1)), 1, 16);
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** How far the run got, phrased for the timeline and career log. */
export function tournamentOutcome(t: Tournament, clearedAll: boolean): string {
  if (t.kind === "OLYMPICS") {
    if (clearedAll) return "Olympic Gold";
    if (t.cleared === t.rounds.length - 1) return "Olympic Silver";
    if (t.cleared === t.rounds.length - 2) return "Olympic Semifinalist";
    return "Olympics — group stage";
  }
  if (clearedAll) return t.kind === "NCAA" ? "National Champion" : "NBA Champion";
  const lastCleared = t.rounds[t.cleared - 1];
  const failedAt = t.rounds[t.cleared];
  if (!failedAt) return "Eliminated";
  return `Lost in the ${failedAt.label}`;
}

/** Round count for the gauntlet, scaled by stakes and how much you must carry. */
export function roundCountFor(stakes: number, carryLoad: number): number {
  return Math.round(clamp(3 + stakes * 3 + carryLoad * 2.5, 3, 9));
}


// ============================================================
// BRACKET VALIDATION
// Run on every generated tournament. These are the exact classes of bug that
// shipped before: a duplicated franchise, an unregistered team with no crest,
// the player facing themselves, or a final with a missing side.
// ============================================================

export type BracketProblem = { kind: string; detail: string };

export function validateTournament(t: Tournament, playerTeamId: string | null, knownIds: Set<string>): BracketProblem[] {
  const problems: BracketProblem[] = [];
  const seen = new Map<string, string>();

  for (const r of t.rounds) {
    if (!r.opponent || r.opponent.trim() === "") {
      problems.push({ kind: "EMPTY_OPPONENT", detail: r.label });
      continue;
    }
    // Duplicate opponent anywhere in the same bracket.
    const key = r.opponentId ?? r.opponent.toLowerCase();
    if (seen.has(key)) {
      problems.push({ kind: "DUPLICATE_OPPONENT", detail: `${r.opponent} in both ${seen.get(key)} and ${r.label}` });
    }
    seen.set(key, r.label);

    // Playing yourself.
    if (r.opponentId && playerTeamId && r.opponentId === playerTeamId) {
      problems.push({ kind: "SELF_MATCHUP", detail: r.label });
    }
    // Club opponents must exist in the registry (nations legitimately don't).
    if (t.kind !== "OLYMPICS" && r.opponentId && !knownIds.has(r.opponentId)) {
      problems.push({ kind: "UNREGISTERED_TEAM", detail: `${r.opponent} (${r.opponentId})` });
    }
  }

  const final = t.rounds[t.rounds.length - 1];
  if (!final || !final.isFinal) problems.push({ kind: "NO_FINAL", detail: t.title });
  return problems;
}
