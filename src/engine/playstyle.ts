import { Attributes, Playstyle } from "./types";

// ============================================================
// PLAYSTYLE PROFILES
// Single source of truth for what a playstyle can develop, how often each
// active attribute is offered as a development option, how much it
// contributes to OVR/performanceScore, and how it shapes box-score output.
// Attributes NOT listed in `active` never appear as a development option,
// are never touched by aging, and are excluded entirely (not down-weighted
// — excluded) from OVR/performanceScore math for that playstyle.
// `clutch` is deliberately absent from every profile: it stays a normal
// Person attribute, moved only by decisions/events/threads and read
// directly by the championship challenge and late-round minigame code,
// outside this system entirely.
// ============================================================

const VERY_HIGH = 5;
const HIGH = 4;
const MEDIUM = 3;
const SUPPORT = 2;

export type RoleWeights = {
  scoring: number;
  playmaking: number;
  rebounding: number;
  defenseImpact: number;
};

export type PlaystyleProfile = {
  id: Playstyle;
  label: string;
  tagline: string;
  coreLabel: string;
  identityLine: string;
  /** Attributes this playstyle can ever develop. Order = display order. */
  active: (keyof Attributes)[];
  /** Weight per active attribute: dev-option odds AND OVR/performanceScore share. */
  weights: Partial<Record<keyof Attributes, number>>;
  /** Box-score emphasis multipliers, read by simulation.ts. */
  roleWeights: RoleWeights;
};

export const PLAYSTYLE_PROFILES: Record<Playstyle, PlaystyleProfile> = {
  SHARPSHOOTER: {
    id: "SHARPSHOOTER",
    label: "Sharpshooter",
    tagline: "Become an elite perimeter scorer.",
    coreLabel: "Shooting, Ball Handling, IQ, Passing",
    identityLine: "Elite scoring, shooting efficiency, offensive gravity.",
    active: ["shooting", "ballHandling", "basketballIQ", "passing"],
    weights: { shooting: VERY_HIGH, ballHandling: HIGH, basketballIQ: HIGH, passing: MEDIUM },
    roleWeights: { scoring: 1.18, playmaking: 0.85, rebounding: 0.42, defenseImpact: 0.48 },
  },
  PLAYMAKER: {
    id: "PLAYMAKER",
    label: "Playmaker",
    tagline: "Become the best offensive creator in the league.",
    coreLabel: "Passing, Ball Handling, IQ, Shooting",
    identityLine: "Elite playmaking, assists, offensive creation.",
    active: ["passing", "ballHandling", "basketballIQ", "shooting"],
    weights: { passing: VERY_HIGH, ballHandling: VERY_HIGH, basketballIQ: HIGH, shooting: MEDIUM },
    roleWeights: { scoring: 0.82, playmaking: 1.35, rebounding: 0.45, defenseImpact: 0.62 },
  },
  SUPERSTAR: {
    id: "SUPERSTAR",
    label: "Superstar",
    tagline: "Become an unstoppable all-around franchise player.",
    coreLabel: "Finishing, Athleticism, Passing, IQ, Strength, Shooting, Ball Handling",
    identityLine: "All-around impact across scoring, playmaking and physicality.",
    active: ["finishing", "athleticism", "passing", "basketballIQ", "strength", "shooting", "ballHandling"],
    weights: {
      finishing: VERY_HIGH, athleticism: VERY_HIGH, passing: HIGH, basketballIQ: HIGH,
      strength: HIGH, shooting: MEDIUM, ballHandling: MEDIUM,
    },
    roleWeights: { scoring: 1.08, playmaking: 0.98, rebounding: 0.78, defenseImpact: 0.6 },
  },
  SLASHER: {
    id: "SLASHER",
    label: "Slasher",
    tagline: "Get to the rim. Nobody is stopping you.",
    coreLabel: "Finishing, Athleticism, Strength, Ball Handling",
    identityLine: "Rim scoring, athletic finishing, physical dominance.",
    active: ["finishing", "athleticism", "strength", "ballHandling"],
    weights: { finishing: VERY_HIGH, athleticism: VERY_HIGH, strength: HIGH, ballHandling: MEDIUM },
    roleWeights: { scoring: 1.12, playmaking: 0.55, rebounding: 0.62, defenseImpact: 0.55 },
  },
  TWO_WAY: {
    id: "TWO_WAY",
    label: "Two-Way",
    tagline: "Elite on both ends of the court.",
    coreLabel: "Defense, IQ, Athleticism, Strength, Finishing",
    identityLine: "Lockdown defense paired with efficient two-way scoring.",
    active: ["defense", "basketballIQ", "athleticism", "strength", "finishing"],
    weights: { defense: VERY_HIGH, basketballIQ: VERY_HIGH, athleticism: HIGH, strength: HIGH, finishing: MEDIUM },
    roleWeights: { scoring: 0.8, playmaking: 0.7, rebounding: 0.72, defenseImpact: 1.32 },
  },
  INTERIOR: {
    id: "INTERIOR",
    label: "Interior",
    tagline: "Dominate the paint.",
    coreLabel: "Finishing, Strength, Defense, IQ, Athleticism",
    identityLine: "Interior scoring, rebounding, and rim protection.",
    active: ["finishing", "strength", "defense", "basketballIQ", "athleticism"],
    weights: { finishing: VERY_HIGH, strength: VERY_HIGH, defense: HIGH, basketballIQ: MEDIUM, athleticism: MEDIUM },
    roleWeights: { scoring: 0.88, playmaking: 0.45, rebounding: 1.38, defenseImpact: 1.12 },
  },
};

const CREATION_BIAS_SCALE = 2.4;

/** Starting-attribute bonuses at character creation — active attributes only. */
export function startingBias(profile: PlaystyleProfile): Partial<Record<keyof Attributes, number>> {
  const bias: Partial<Record<keyof Attributes, number>> = {};
  for (const attr of profile.active) {
    const w = profile.weights[attr] ?? 1;
    bias[attr] = Math.round(w * CREATION_BIAS_SCALE);
  }
  return bias;
}

export function isActive(playstyle: Playstyle, attribute: keyof Attributes): boolean {
  return PLAYSTYLE_PROFILES[playstyle].active.includes(attribute);
}
