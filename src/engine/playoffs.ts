import { MinigameOutcome, MinigameResult, PlayoffResult, Round } from "./types";
import { RNG, clamp, weighted } from "./rng";

// ============================================================
// PLAYOFF SYSTEM
//
// Fixes the core problem from the previous version: the engine used to
// roll the ENTIRE playoff outcome (including "CHAMPION") via dice before
// any minigame happened, making the clutch moment cosmetic.
//
// Now: team quality only determines how far a team's run WOULD plausibly
// go and which round becomes "decisive" — the one genuinely in doubt.
// That round is left PENDING. The player's minigame result then shifts
// the win probability of that specific round. Rounds before the decisive
// one are treated as already won (the team's regular postseason grind);
// rounds after it are simply not reached if the decisive round is lost.
//
// The rival has no minigame, so simulateFullPlayoffRun() resolves their
// entire run automatically using the same round-by-round probability
// curve, just without a skill-factor injection.
// ============================================================

export const ROUND_ORDER: Round[] = ["FIRST_ROUND", "CONF_SEMIS", "CONF_FINALS", "FINALS"];

export type PlayoffPath = {
  madePlayoffs: boolean;
  decisiveRound: Round | null;
};

export function determinePlayoffPath(rng: RNG, teamQuality: number): PlayoffPath {
  const madePlayoffs = teamQuality > 0.4 || rng.next() < teamQuality * 0.55;
  if (!madePlayoffs) return { madePlayoffs: false, decisiveRound: null };

  let decisiveRound: Round;
  if (teamQuality > 0.72) {
    decisiveRound = weighted(rng, [
      { item: "FINALS" as Round, weight: 0.5 },
      { item: "CONF_FINALS" as Round, weight: 0.3 },
      { item: "CONF_SEMIS" as Round, weight: 0.2 },
    ]);
  } else if (teamQuality > 0.55) {
    decisiveRound = weighted(rng, [
      { item: "CONF_FINALS" as Round, weight: 0.4 },
      { item: "CONF_SEMIS" as Round, weight: 0.4 },
      { item: "FIRST_ROUND" as Round, weight: 0.2 },
    ]);
  } else if (teamQuality > 0.4) {
    decisiveRound = weighted(rng, [
      { item: "CONF_SEMIS" as Round, weight: 0.4 },
      { item: "FIRST_ROUND" as Round, weight: 0.6 },
    ]);
  } else {
    decisiveRound = "FIRST_ROUND";
  }
  return { madePlayoffs: true, decisiveRound };
}

const SKILL_FACTOR: Record<MinigameOutcome, number> = {
  PERFECT: 0.32,
  GOOD: 0.12,
  MISS: -0.12,
  FAIL: -0.32,
};

// This is the function that makes the clutch moment actually matter:
// the minigame outcome directly shifts win probability of the decisive round.
//
// If the player LOSES the decisive round, the run ends there.
// If the player WINS it, the remaining rounds are auto-simulated with a
// confidence bonus carried over from the clutch performance — so a great
// minigame can genuinely carry a team from "in doubt" all the way to a title.
export function resolveDecisivePlayoffRound(
  rng: RNG,
  decisiveRound: Round,
  teamQuality: number,
  minigame: MinigameResult
): { won: boolean; playoffResult: PlayoffResult; roundsAdvanced: number } {
  const skillFactor = SKILL_FACTOR[minigame.outcome];
  const winProb = clamp(0.38 + teamQuality * 0.32 + skillFactor, 0.05, 0.95);
  const won = rng.next() < winProb;

  const startIdx = ROUND_ORDER.indexOf(decisiveRound);

  if (!won) {
    // Eliminated at the decisive round.
    return { won: false, playoffResult: eliminatedAt(startIdx), roundsAdvanced: 0 };
  }

  // Won the decisive round — carry momentum through the rest of the bracket.
  const momentum = skillFactor * 0.5;
  let idx = startIdx + 1;
  let roundsAdvanced = 1;
  while (idx < ROUND_ORDER.length) {
    const p = clamp(0.4 + teamQuality * 0.3 + momentum, 0.08, 0.92);
    if (rng.next() >= p) {
      return { won: true, playoffResult: eliminatedAt(idx), roundsAdvanced };
    }
    idx++;
    roundsAdvanced++;
  }
  return { won: true, playoffResult: "CHAMPION", roundsAdvanced };
}

// Losing at round index i maps to the PlayoffResult naming that round.
export function eliminatedAt(idx: number): PlayoffResult {
  switch (idx) {
    case 0: return "FIRST_ROUND";
    case 1: return "CONF_SEMIS";
    case 2: return "CONF_FINALS";
    default: return "FINALS_LOSS";
  }
}

// Continues a bracket from a given round index. Used when a rivalry encounter
// defers the rival's outcome: if the rival beats the player head-to-head, the
// rest of THEIR run is simulated from the next round onward.
export function simulateRemainingRounds(rng: RNG, teamQuality: number, startIdx: number): PlayoffResult {
  let idx = startIdx;
  while (idx < ROUND_ORDER.length) {
    const p = clamp(0.4 + teamQuality * 0.3, 0.08, 0.92);
    if (rng.next() >= p) return eliminatedAt(idx);
    idx++;
  }
  return "CHAMPION";
}

// Fully-automatic resolution for the rival — same probability curve, no
// skill factor, because there's no player-controlled minigame for them.
export function simulateFullPlayoffRun(rng: RNG, teamQuality: number): PlayoffResult {
  const path = determinePlayoffPath(rng, teamQuality);
  if (!path.madePlayoffs) return "MISSED_PLAYOFFS";

  let idx = 0;
  while (idx < ROUND_ORDER.length) {
    const winProb = clamp(0.38 + teamQuality * 0.32, 0.05, 0.9);
    const win = rng.next() < winProb;
    if (!win) {
      return idx === 0 ? "FIRST_ROUND" : idx === 1 ? "CONF_SEMIS" : idx === 2 ? "CONF_FINALS" : "FINALS_LOSS";
    }
    idx++;
  }
  return "CHAMPION";
}

export function playoffResultToRoundIndex(r: PlayoffResult): number {
  switch (r) {
    case "MISSED_PLAYOFFS":
    case "PENDING":
      return -1;
    case "FIRST_ROUND":
      return 0;
    case "CONF_SEMIS":
      return 1;
    case "CONF_FINALS":
      return 2;
    case "FINALS_LOSS":
    case "CHAMPION":
      return 3;
  }
}

// Rivalry encounter check: deeper rounds = more plausible marquee matchup.
// Only fires if the rival's run reached at least as far as the player's
// decisive round — you can't run into someone who's already gone home.
export function checkRivalryEncounter(rng: RNG, playerDecisiveRound: Round | null, rivalPlayoffResult: PlayoffResult): boolean {
  if (!playerDecisiveRound) return false;
  const rivalRoundIndex = playoffResultToRoundIndex(rivalPlayoffResult);
  const playerRoundIndex = ROUND_ORDER.indexOf(playerDecisiveRound);
  if (rivalRoundIndex < playerRoundIndex) return false;
  const baseChance = playerRoundIndex >= 2 ? 0.4 : 0.18;
  return rng.next() < baseChance;
}

export function roundLabel(round: Round, phase: "NCAA" | "NBA"): string {
  if (phase === "NBA") {
    return {
      FIRST_ROUND: "First Round",
      CONF_SEMIS: "Conference Semifinals",
      CONF_FINALS: "Conference Finals",
      FINALS: "NBA Finals",
    }[round];
  }
  return {
    FIRST_ROUND: "Round of 32",
    CONF_SEMIS: "Sweet 16",
    CONF_FINALS: "Final Four",
    FINALS: "National Championship",
  }[round];
}

export function formatPlayoffResult(result: PlayoffResult, phase: "NCAA" | "NBA"): string {
  if (phase === "NBA") {
    const map: Record<PlayoffResult, string> = {
      PENDING: "season still in progress",
      MISSED_PLAYOFFS: "missed the playoffs",
      FIRST_ROUND: "lost in the first round",
      CONF_SEMIS: "lost in the conference semifinals",
      CONF_FINALS: "lost in the conference finals",
      FINALS_LOSS: "lost in the NBA Finals",
      CHAMPION: "won the NBA championship",
    };
    return map[result];
  }
  const map: Record<PlayoffResult, string> = {
    PENDING: "season still in progress",
    MISSED_PLAYOFFS: "missed the NCAA tournament",
    FIRST_ROUND: "lost in the Round of 32",
    CONF_SEMIS: "lost in the Sweet 16",
    CONF_FINALS: "lost in the Final Four",
    FINALS_LOSS: "lost the National Championship game",
    CHAMPION: "won the National Championship",
  };
  return map[result];
}
