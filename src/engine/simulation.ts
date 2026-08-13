import { Attributes, Hidden, Playstyle, PlayoffResult, SeasonStats, Person } from "./types";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { RNG, clamp, randRange } from "./rng";

// ============================================================
// SIMULATION CORE
// This exact function is called for BOTH the player and the rival.
// Nothing here references "which one is the player" — that's what
// makes rule #1 (rival is never artificially balanced) structurally
// true rather than just a policy we promise to follow.
//
// IMPORTANT: this function simulates REGULAR SEASON output only.
// Postseason outcome (playoffResult) is intentionally left "PENDING"
// here — it's resolved afterward by playoffs.ts, which is where the
// player's clutch-moment minigame gets a real chance to change it.
// See playoffs.ts for why this split exists.
// ============================================================

function weightedAttributeScore(attrs: Attributes, playstyle: Playstyle): number {
  const profile = PLAYSTYLE_PROFILES[playstyle];
  let sum = 0;
  let weightTotal = 0;
  for (const key of profile.active) {
    const w = profile.weights[key] ?? 1;
    sum += attrs[key] * w;
    weightTotal += 99 * w;
  }
  return weightTotal > 0 ? sum / weightTotal : 0.5;
}

export function moraleModifier(hidden: Hidden): number {
  return clamp(
    0.85 +
      0.3 * (hidden.confidence / 100) +
      0.15 * (hidden.chemistry / 100) -
      0.2 * (hidden.fatigue / 100),
    0.6,
    1.35
  );
}

export function consistency(attrs: Attributes): number {
  return 0.5 + 0.5 * (attrs.basketballIQ / 99); // higher IQ = tighter variance band
}

export type SimSeasonInput = {
  person: Person;
  season: number;
  phase: "NCAA" | "NBA";
  teamStrength: number; // 0-1, from contract or NCAA program quality
  rng: RNG;
};

export function simulateSeasonStats({ person, season, phase, teamStrength, rng }: SimSeasonInput): SeasonStats {
  const roleWeights = PLAYSTYLE_PROFILES[person.playstyle].roleWeights;
  const basePerformance = weightedAttributeScore(person.attributes, person.playstyle);
  const morale = moraleModifier(person.hidden);
  const cons = consistency(person.attributes);

  const noise = randRange(rng, -1, 1) * (1 - cons) * 0.25;
  const devBoost = 1 + (person.hidden.developmentRate - 1) * 0.5; // dev rate nudges performance, doesn't dominate it

  const performanceScore = clamp(basePerformance * morale * devBoost * (1 + noise), 0.15, 1.3);

  const gamesPlayed = Math.round(clamp(82 - person.hidden.fatigue * 0.15 - person.hidden.injuryRisk * 0.2, 40, phase === "NCAA" ? 36 : 82));

  // Box score uses a CONVEX curve on performanceScore rather than a linear
  // one. A linear map made elite seasons extrapolate into parody (a validated
  // run produced 42 PPG / 9.6 APG for a SCORER). The exponent compresses the
  // low-to-mid range and keeps the top end near realistic superstar output:
  //   perf 0.60 -> ~18 PPG   (rotation starter)
  //   perf 0.75 -> ~23 PPG   (quality starter)
  //   perf 0.90 -> ~29 PPG   (superstar)
  //   perf 1.00 -> ~33 PPG   (all-time season)
  const eff = Math.pow(clamp(performanceScore, 0, 1.3), 1.3);
  const a = person.attributes;

  // Each box-score line responds to the attributes that actually produce it,
  // not just the blended performance score. Without this, developing Passing
  // +25 moved APG by 0.2 — the improvement was real in the ratings and
  // invisible on the floor, which made development feel decorative.
  const scoringSkill = 0.62 + 0.72 * ((a.shooting + a.finishing) / 2 / 99);
  const playSkill = 0.5 + 0.95 * (a.passing / 99);
  const reboundSkill = 0.6 + 0.75 * ((a.strength + a.athleticism) / 2 / 99);

  const ppg = clamp(3 + eff * 26 * roleWeights.scoring * scoringSkill, 2, 36);
  const apg = clamp(0.5 + eff * 9 * roleWeights.playmaking * playSkill, 0.5, 12);
  const rpg = clamp(1 + eff * 9 * roleWeights.rebounding * reboundSkill, 1, 14);

  const spg = clamp(0.2 + eff * 2.2 * (a.defense / 99) * roleWeights.defenseImpact, 0.1, 3.2);
  const bpg = clamp(0.1 + eff * 2.4 * (a.athleticism / 99) * (a.strength / 99) * roleWeights.defenseImpact, 0.05, 3.4);

  // Efficiency splits derive from the relevant attributes, with mild noise.
  const fgPct = clamp(38 + (a.finishing - 60) * 0.22 + (a.shooting - 60) * 0.12 + randRange(rng, -1.5, 1.5), 33, 62);
  const tpPct = clamp(27 + (a.shooting - 60) * 0.24 + randRange(rng, -2, 2), 18, 47);
  const ftPct = clamp(63 + (a.shooting - 60) * 0.3 + (a.clutch - 60) * 0.1 + randRange(rng, -3, 3), 45, 95);

  // Team outcome (regular season only) blends individual performance with
  // surrounding team quality. Postseason result is NOT decided here anymore.
  const teamQuality = clamp(teamStrength * 0.6 + performanceScore * 0.4, 0, 1);
  const totalGames = phase === "NCAA" ? 32 : 82;
  const teamWins = Math.round(totalGames * clamp(0.25 + teamQuality * 0.6, 0.1, 0.88));
  const teamLosses = totalGames - teamWins;

  return {
    season,
    phase,
    gamesPlayed,
    ppg: round1(ppg),
    rpg: round1(rpg),
    apg: round1(apg),
    spg: round1(spg),
    bpg: round1(bpg),
    fgPct: round1(fgPct),
    tpPct: round1(tpPct),
    ftPct: round1(ftPct),
    gamesStarted: Math.round(gamesPlayed * clamp(0.15 + teamStrength * 0.2 + performanceScore * 0.75, 0, 1)),
    teamWins,
    teamLosses,
    playoffResult: "PENDING",
    performanceScore,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Derives the 0-1 "team quality" used by playoffs.ts to determine the
// playoff path — kept in sync with the formula used for teamWins above.
export function computeTeamQuality(teamStrength: number, performanceScore: number): number {
  return clamp(teamStrength * 0.6 + performanceScore * 0.4, 0, 1);
}

// Offseason decay applied to hidden vars before the next season is generated.
// Keeps fatigue/injuryRisk from spiraling forever (design problem flagged earlier).
export function applyOffseasonDecay(hidden: Hidden): Hidden {
  return {
    ...hidden,
    fatigue: clamp(hidden.fatigue * 0.35, 0, 100),
    injuryRisk: clamp(hidden.injuryRisk * 0.7, 0, 100),
    confidence: clamp(hidden.confidence + (55 - hidden.confidence) * 0.3, 0, 100), // drifts toward baseline
  };
}
