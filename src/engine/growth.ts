import { Attributes, Hidden, Person } from "./types";
import { RNG, clamp, randRange } from "./rng";

// ============================================================
// DEVELOPMENT / GROWTH SYSTEM
//
// Fixes the "hidden potential ceiling" problem: developmentRate no longer
// represents a fixed max career quality rolled once at creation. It now
// starts neutral (~0.9-1.1) for EVERY player and rival, and moves up or
// down each season based on confidence, recent performance, and how
// decisions/minigames have gone. It's an efficiency multiplier on growth,
// not a cap — a player who starts with a low roll can still climb into
// elite territory with good seasons, and a "gifted" start can stagnate
// with poor decisions and low confidence.
//
// Attribute growth itself has diminishing returns as it nears 99, so
// nobody maxes out trivially, but the ceiling (99) is the same for everyone.
// ============================================================

const ATTR_KEYS: (keyof Attributes)[] = [
  "shooting", "finishing", "passing", "ballHandling",
  "defense", "athleticism", "strength", "basketballIQ", "clutch",
];

export function initialDevelopmentRate(rng: RNG): number {
  return randRange(rng, 0.9, 1.1); // neutral starting efficiency, not a ceiling
}

// growthBias lets an archetype (e.g. rival arc) shape WHEN growth happens
// (early burst vs late surge) without changing what's ultimately reachable.
const PHYSICAL_KEYS: (keyof Attributes)[] = ["athleticism", "strength", "finishing"];

export function applyDevelopmentGrowth(
  rng: RNG, person: Person, overallSeason: number, growthBias: number = 1, age?: number
): Person {
  const hidden: Hidden = { ...person.hidden };
  const attrs: Attributes = { ...person.attributes };

  const lastStats = person.seasonStats[person.seasonStats.length - 1];
  const perfHint = lastStats ? lastStats.performanceScore : 0.6;

  // developmentRate itself evolves — confidence and recent performance nudge
  // it up or down. This is what makes it "efficiency," not a fixed roll.
  const devDelta =
    (hidden.confidence - 50) / 900 +
    (perfHint - 0.55) / 14 +
    randRange(rng, -0.015, 0.015);
  hidden.developmentRate = clamp(hidden.developmentRate + devDelta * growthBias, 0.6, 1.6);

  // Age curve: early-career seasons grow fastest, then it tapers.
  const ageFactor = overallSeason <= 6 ? 1.15 : overallSeason <= 10 ? 0.7 : 0.35;

  // GROWTH_SCALE is what actually lets a prospect become a superstar.
  // Calibrated so a full career moves average attributes roughly 48 -> 80+,
  // with playstyle-relevant attributes climbing highest. An earlier pass used
  // an unscaled share and produced ~1 total attribute point across 10 seasons,
  // which made elite outcomes (and therefore MVPs) impossible — the exact
  // "hidden ceiling" problem this system is meant to remove.
  const GROWTH_SCALE = 26;
  const growthPoints = hidden.developmentRate * ageFactor * randRange(rng, 0.85, 1.25);

  // Playstyle-relevant attributes develop faster, but every attribute grows.
  const focus = person.playstyle;
  for (const key of ATTR_KEYS) {
    // Past the physical peak, training no longer ADDS athleticism/strength —
    // it only slows the loss. Without this the growth system silently cancelled
    // the age curve and athleticism plateaued instead of declining.
    if (age !== undefined && age >= 27 && PHYSICAL_KEYS.includes(key)) continue;
    const room = clamp((99 - attrs[key]) / 55, 0, 1); // diminishing returns near the cap
    const share = growthPoints * room * randRange(rng, 0.05, 0.22) * GROWTH_SCALE;
    attrs[key] = clamp(attrs[key] + share, 30, 99);
  }

  return { ...person, attributes: attrs, hidden };
}
