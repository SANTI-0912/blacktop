import { CareerEvent, ClutchMoment, Hidden, MinigameResult, MinigameType, Person, Rival, Round } from "./types";
import { RNG, clamp, randInt, pick } from "./rng";
import { roundLabel } from "./playoffs";
import { buildCallback } from "./history";

// ============================================================
// MINIGAME <-> ENGINE CONTRACT
// UI-side minigame components know NOTHING about the simulation.
// They only ever emit a MinigameResult. This file is the single
// place that translates {outcome, score} into everything the game
// actually remembers.
//
// Clutch moments now come in three flavors:
//   1. PLAYOFF DECISIVE  — carries decisiveRound; the result genuinely
//                           determines whether the team advances.
//   2. RIVALRY ENCOUNTER — head-to-head vs the archrival at high stakes.
//   3. REGULAR           — a flavor moment when the team misses the
//                           postseason; affects confidence/reputation only.
// ============================================================

const REGULAR_SETUPS: { setup: string; minigame: MinigameType; stakes: ClutchMoment["stakes"] }[] = [
  { setup: "Late in a nationally televised game, your team needs a bucket to steal it.", minigame: "SHOOTING", stakes: "MEDIUM" },
  { setup: "Tie game, final possession. The coach draws up the last shot for you.", minigame: "CLUTCH_DECISION", stakes: "MEDIUM" },
  { setup: "You're fouled with the game on the line and the crowd on its feet.", minigame: "FREE_THROWS", stakes: "MEDIUM" },
  { setup: "The defense collapses on you and a teammate flashes open in the corner.", minigame: "PASSING", stakes: "LOW" },
  { setup: "Their best scorer has it isolated on you with the shot clock winding down.", minigame: "DEFENSE", stakes: "MEDIUM" },
  { setup: "A statement game in front of a hostile road crowd.", minigame: "FINISHING", stakes: "LOW" },
  { setup: "Your team needs a three to flip the momentum in the fourth.", minigame: "DEEP_THREE", stakes: "MEDIUM" },
];

const PLAYOFF_MINIGAMES: MinigameType[] = ["SHOOTING", "DEEP_THREE", "FREE_THROWS", "CLUTCH_DECISION", "DEFENSE", "FINISHING"];

export function generateRegularClutchMoment(rng: RNG, season: number): ClutchMoment {
  const t = pick(rng, REGULAR_SETUPS);
  return { id: `clutch_${season}`, season, setup: t.setup, minigame: t.minigame, stakes: t.stakes };
}

export function generatePlayoffClutchMoment(
  rng: RNG,
  season: number,
  round: Round,
  phase: "NCAA" | "NBA",
  history: CareerEvent[],
  rival: Rival | null // non-null when this is a head-to-head rivalry encounter
): ClutchMoment {
  const label = roundLabel(round, phase).toUpperCase();
  const seconds = (randInt(rng, 8, 62) / 10).toFixed(1);
  const margin = randInt(rng, 1, 2);
  const minigame = pick(rng, PLAYOFF_MINIGAMES);

  const stakes: ClutchMoment["stakes"] =
    round === "FINALS" || round === "CONF_FINALS" ? "CAREER_DEFINING" : "HIGH";

  // NCAA tournament is single elimination — no Game 7 framing there.
  const gameLabel = phase === "NBA" && (round === "FINALS" || round === "CONF_FINALS") ? "GAME 7 — " : "";
  let setup = `${gameLabel}${label}\n${seconds} seconds remaining. Down ${margin}.\nYou have the ball.`;

  if (rival) {
    setup = `${gameLabel}${label}\nYou vs ${rival.name}\n${seconds} seconds remaining. Down ${margin}.\nYou have the ball.`;
  }
  const callback = buildCallback(history, season, { vsRival: !!rival, round });
  if (callback) setup += `\n\n${callback}`;

  return {
    id: `clutch_${season}_${round.toLowerCase()}`,
    season,
    setup,
    minigame,
    stakes,
    decisiveRound: round,
    isRivalryEncounter: !!rival,
  };
}

const STAKES_MULTIPLIER: Record<ClutchMoment["stakes"], number> = {
  LOW: 0.5,
  MEDIUM: 1,
  HIGH: 1.6,
  CAREER_DEFINING: 2.4,
};

const OUTCOME_BASE: Record<MinigameResult["outcome"], number> = {
  PERFECT: 14,
  GOOD: 6,
  MISS: -6,
  FAIL: -14,
};

// Applies the psychological/reputational consequences of a clutch moment.
// The PLAYOFF consequence (does the team advance?) is handled separately in
// playoffs.ts — this function covers confidence, reputation, draft stock and
// the structured history entry.
export function applyMinigameResult(
  person: Person,
  moment: ClutchMoment,
  result: MinigameResult
): { person: Person; event: CareerEvent; succeeded: boolean } {
  const mult = STAKES_MULTIPLIER[moment.stakes];
  const magnitude = OUTCOME_BASE[result.outcome] * mult;

  const hidden: Hidden = { ...person.hidden };
  hidden.confidence = clamp(hidden.confidence + magnitude, 0, 100);
  hidden.reputation = clamp(hidden.reputation + magnitude * 0.6, 0, 100);

  const succeeded = result.outcome === "PERFECT" || result.outcome === "GOOD";
  const flags: string[] = [`${moment.minigame.toLowerCase()}_${result.outcome.toLowerCase()}`, "clutch_moment"];
  if (moment.stakes === "CAREER_DEFINING") {
    flags.push(succeeded ? "career_defining_clutch_success" : "career_defining_clutch_failure");
  }
  if (moment.isRivalryEncounter) flags.push("rival_involved");

  const draftStockDelta = magnitude * 0.4;

  const event: CareerEvent = {
    id: `${moment.id}_result`,
    season: moment.season,
    type: "clutch_moment",
    narrative: buildClutchNarrative(moment, succeeded),
    flags,
    impact: { confidence: magnitude, reputation: magnitude * 0.6, draftStockDelta },
  };

  const updatedPerson: Person = {
    ...person,
    hidden,
    draftStock: clamp(person.draftStock + draftStockDelta, 0, 100),
    events: [...person.events, event],
  };

  return { person: updatedPerson, event, succeeded };
}

function buildClutchNarrative(moment: ClutchMoment, succeeded: boolean): string {
  if (moment.decisiveRound) {
    return succeeded
      ? "You rise up and deliver with the season hanging on it."
      : "It doesn't fall. The building goes silent.";
  }
  if (moment.stakes === "CAREER_DEFINING") {
    return succeeded
      ? "You deliver. This moment will follow you for the rest of your career."
      : "It doesn't go your way. This moment will follow you for the rest of your career.";
  }
  return succeeded ? "You come through when it matters." : "It slips away this time.";
}
