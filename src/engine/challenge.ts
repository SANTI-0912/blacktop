import { Attributes, MinigameType } from "./types";
import { RNG, clamp, pick } from "./rng";
import { Role } from "./overall";

// ============================================================
// CHAMPIONSHIP CHALLENGE
//
// The one piece of real gameplay in a season. It represents the WHOLE event
// (a Finals series, a title game, a gold medal game), not a single possession.
//
// Difficulty is a function of how much the player has to carry:
//   - Weak supporting cast  -> more rounds, tighter clock (you must do more)
//   - Elite supporting cast -> fewer rounds, looser clock
//   - High player OVR       -> pulls difficulty back down
//
// A superstar on a bad team gets a LONG but winnable challenge. A role player
// on a superteam gets a SHORT, forgiving one. Neither is ever impossible —
// the required win ratio stays constant, only the workload changes.
// ============================================================

export type ChallengeDifficulty = "MANAGEABLE" | "DEMANDING" | "BRUTAL";

export type ChallengeRound = {
  index: number;
  minigame: MinigameType;
  /** Multiplier on the success window. >1 = more forgiving. Attribute-driven. */
  windowScale: number;
  /** Seconds allowed for decision-type rounds. */
  seconds: number;
};

export type ChallengeConfig = {
  eventTitle: string; // "NBA FINALS"
  homeTeam: string;
  awayTeam: string;
  seriesLine: string; // "Series 3-3"
  flavor: string;
  rounds: ChallengeRound[];
  roundsToWin: number;
  difficulty: ChallengeDifficulty;
  totalSeconds: number;
};

export type ChallengeInput = {
  rng: RNG;
  eventTitle: string;
  playerTeam: string;
  opponent: string;
  playerOvr: number;
  supportingOvr: number;
  attributes: Attributes;
  role: Role;
  seasonPerformance: number; // 0-1.3 performanceScore
  flavor: string;
  seriesLine: string;
};

// How much the player must personally carry, 0 (elite help) .. 1 (all alone).
function carryLoad(playerOvr: number, supportingOvr: number): number {
  return clamp((playerOvr - supportingOvr + 18) / 36, 0, 1);
}

const POOL: MinigameType[] = ["SHOOTING", "DEEP_THREE", "FREE_THROWS", "CLUTCH_DECISION", "DEFENSE", "FINISHING"];

export function buildChallenge(input: ChallengeInput): ChallengeConfig {
  const {
    rng, eventTitle, playerTeam, opponent, playerOvr, supportingOvr,
    attributes, role, seasonPerformance, flavor, seriesLine,
  } = input;

  const load = carryLoad(playerOvr, supportingOvr);

  // More carrying = more rounds. Range 4..9.
  const rounds = Math.round(clamp(4 + load * 5, 4, 9));

  // Player quality and form claw back time; a weak cast takes it away.
  const skillRelief = (playerOvr - 70) / 100 + (seasonPerformance - 0.7) * 0.25;
  const secondsPerRound = clamp(13 - load * 5 + skillRelief * 6, 6, 16);
  const totalSeconds = Math.round(rounds * secondsPerRound);

  const difficulty: ChallengeDifficulty =
    load > 0.66 ? "BRUTAL" : load > 0.38 ? "DEMANDING" : "MANAGEABLE";

  // Required win ratio is CONSTANT — a bad team never makes it unwinnable,
  // it only makes it longer and tighter.
  const roundsToWin = Math.ceil(rounds * 0.6);

  const built: ChallengeRound[] = [];
  // Opposition pressure: when you're carrying, every possession is contested
  // harder, not just more numerous. Without this, extra rounds actually made a
  // weak roster EASIER (more rounds = less variance at a >60% per-round rate),
  // which measured as an 80% title rate on a weak cast vs 71% on an elite one.
  const opposition = 0.88 + load * 0.34;
  for (let i = 0; i < rounds; i++) {
    const minigame = pick(rng, POOL);
    built.push({
      index: i,
      minigame,
      windowScale: clamp(windowScaleFor(minigame, attributes, i, rounds) / opposition, 0.55, 1.9),
      seconds: Math.round(secondsPerRound),
    });
  }

  return {
    eventTitle,
    homeTeam: playerTeam,
    awayTeam: opponent,
    seriesLine,
    flavor,
    rounds: built,
    roundsToWin,
    difficulty,
    totalSeconds,
  };
}

// Attributes translate directly into how forgiving each round is. This is what
// makes attribute progression matter to the part of the game you actually play.
function windowScaleFor(mg: MinigameType, a: Attributes, index: number, total: number): number {
  const norm = (v: number) => (v - 60) / 60; // ~-0.33 .. +0.65

  let base = 1;
  switch (mg) {
    case "SHOOTING":
    case "DEEP_THREE":
    case "FREE_THROWS":
      base += norm(a.shooting) * 0.5;
      break;
    case "DEFENSE":
      base += norm(a.defense) * 0.5;
      break;
    case "CLUTCH_DECISION":
      base += norm(a.basketballIQ) * 0.5;
      break;
    case "FINISHING":
      base += norm(a.finishing) * 0.35 + norm(a.strength) * 0.15;
      break;
    default:
      base += norm(a.basketballIQ) * 0.3;
  }

  // Clutch pays off specifically in the closing rounds, where it should.
  const lateness = total > 1 ? index / (total - 1) : 0;
  base += norm(a.clutch) * 0.45 * lateness;

  return clamp(base, 0.6, 1.85);
}

export const DIFFICULTY_COPY: Record<ChallengeDifficulty, string> = {
  MANAGEABLE: "You have help. Take what the game gives you.",
  DEMANDING: "This one is on your shoulders more than it should be.",
  BRUTAL: "Nobody else is going to win this. It has to be you.",
};
