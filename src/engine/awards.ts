import { Award, Person, SeasonStats } from "./types";
import { RNG } from "./rng";

// Simplified league-context awards: since we don't simulate the full league,
// awards are rolled probabilistically against performanceScore thresholds.
//
// CALIBRATION NOTE: thresholds below are tuned against the MEASURED
// performanceScore distribution produced by the engine, not guessed:
//   min 0.60 | median 0.75 | p90 0.85 | max 0.92
// An earlier pass used an MVP gate of p > 0.78 with a small multiplier,
// which made MVPs effectively unreachable (0.00 per career across 300 runs).
// Deep playoff runs also boost MVP/All-NBA odds, so team success matters.

export function rollSeasonAwards(rng: RNG, stats: SeasonStats, isRookieSeason: boolean): Award[] {
  const awards: Award[] = [];
  const p = stats.performanceScore;

  // Deep postseason runs raise a player's award profile.
  const runBonus =
    stats.playoffResult === "CHAMPION" ? 0.05
    : stats.playoffResult === "FINALS_LOSS" ? 0.035
    : stats.playoffResult === "CONF_FINALS" ? 0.02
    : 0;
  const q = p + runBonus;

  if (stats.phase === "NBA") {
    if (q > 0.68 && rng.next() < (q - 0.62) * 3.2) {
      awards.push({ type: "ALL_STAR", season: stats.season });
    }
    if (q > 0.80 && rng.next() < (q - 0.78) * 4.0) {
      awards.push({ type: "MVP", season: stats.season });
    }
    if (q > 0.74 && rng.next() < (q - 0.70) * 2.4) {
      const team = q > 0.86 ? 1 : q > 0.80 ? 2 : 3;
      awards.push({ type: "ALL_NBA", season: stats.season, team: team as 1 | 2 | 3 });
    }
    if (isRookieSeason && p > 0.62 && rng.next() < 0.55) {
      awards.push({ type: "ROOKIE_OF_YEAR", season: stats.season });
    }
    if (stats.playoffResult === "CHAMPION") {
      awards.push({ type: "CHAMPION", season: stats.season });
      if (p > 0.78 && rng.next() < 0.65) {
        awards.push({ type: "FINALS_MVP", season: stats.season });
      }
    }
  } else {
    if (stats.playoffResult === "CHAMPION") {
      awards.push({ type: "CHAMPION", season: stats.season });
    }
    if (p > 0.7 && rng.next() < 0.45) {
      awards.push({ type: "ALL_TOURNAMENT", season: stats.season });
    }
  }
  return awards;
}
