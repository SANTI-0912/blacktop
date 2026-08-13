import { Attributes, Person, Playstyle } from "./types";
import { RNG, clamp, randInt, randRange, weighted } from "./rng";
import { FocusKey, AgeReport } from "./focus";
import { PLAYSTYLE_PROFILES } from "./playstyle";

// ============================================================
// SEASONAL DEVELOPMENT OUTCOMES
//
// Replaces the flat "you picked Shooting, here's +3 Shooting".
// Every season now rolls a TIER, then distributes 3-4 attribute changes
// weighted by focus, playstyle, age, performance and hidden development.
//
// The player should finish a season asking "what happened to my player this
// year?" rather than reading back the number they already chose.
// ============================================================

export type DevTier =
  | "REGRESSION"
  | "POOR"
  | "NORMAL"
  | "GOOD"
  | "BREAKOUT"
  | "RARE_BREAKOUT"
  | "LEGENDARY";

export type DevChange = { attribute: keyof Attributes; delta: number };

export type DevelopmentResult = {
  tier: DevTier;
  title: string;
  flavor: string;
  changes: DevChange[];
  /** True for the rare tiers that deserve their own screen. */
  special: boolean;
};

export const TIER_BUDGET: Record<DevTier, [number, number]> = {
  REGRESSION: [-4, -1],
  POOR: [0, 1],
  NORMAL: [1, 3],
  GOOD: [3, 5],
  BREAKOUT: [5, 6],
  RARE_BREAKOUT: [6, 8],
  LEGENDARY: [8, 11],
};

const TIER_COPY: Record<DevTier, { title: string; flavor: string }> = {
  REGRESSION: { title: "A step back", flavor: "The body didn't answer the way it used to." },
  POOR: { title: "A quiet year", flavor: "You worked. It just didn't show up on the floor." },
  NORMAL: { title: "Steady progress", flavor: "Nothing dramatic. Everything a little sharper." },
  GOOD: { title: "Real strides", flavor: "People noticed the difference this season." },
  BREAKOUT: { title: "Breakout season", flavor: "Something clicked this year." },
  RARE_BREAKOUT: { title: "A different player", flavor: "Nobody who watched you last year would recognise this." },
  LEGENDARY: { title: "The leap", flavor: "This is the season they'll point to forever." },
};

/** Age and context set which tiers are even on the table. */
function rollTier(rng: RNG, age: number, performance: number, confidence: number): DevTier {
  const young = age <= 23;
  const prime = age >= 24 && age <= 28;
  const old = age >= 31;

  const boost = (performance - 0.7) * 2 + (confidence - 50) / 90;

  const table: { item: DevTier; weight: number }[] = [
    { item: "REGRESSION", weight: old ? 3.2 : age >= 29 ? 1.4 : 0.25 },
    { item: "POOR", weight: 2.0 - boost * 0.5 },
    { item: "NORMAL", weight: 10 },
    { item: "GOOD", weight: (young ? 3.4 : prime ? 2.8 : 1.3) + boost * 0.9 },
    { item: "BREAKOUT", weight: (young ? 1.3 : prime ? 1.0 : 0.3) + boost * 0.5 },
    { item: "RARE_BREAKOUT", weight: (young ? 0.4 : prime ? 0.33 : 0.08) + Math.max(0, boost) * 0.15 },
    { item: "LEGENDARY", weight: young ? 0.07 : prime ? 0.05 : 0.01 },
  ].map((t) => ({ item: t.item as DevTier, weight: Math.max(0.02, t.weight) }));

  return weighted(rng, table);
}

/** Weighted pick among a pool of active attributes, biased by playstyle weight. */
function pickFromActive(rng: RNG, playstyle: Playstyle, pool: (keyof Attributes)[]): keyof Attributes {
  const profile = PLAYSTYLE_PROFILES[playstyle];
  const entries = pool.map((k) => ({ item: k, weight: profile.weights[k] ?? 1 }));
  return weighted(rng, entries);
}

/**
 * When a locked reward is present (the normal case — chooseFocus always locks
 * one), the whole season's roll skips the REGRESSION branch, so no active
 * attribute goes DOWN that season, not just the one being developed —
 * otherwise choosing a focus and then watching other attributes drop reads as
 * a punishment for playing the game the way it asks you to.
 */
export function rollDevelopment(params: {
  rng: RNG;
  person: Person;
  focus: FocusKey | null;
  age: number;
  performance: number;
  /** When set, the primary attribute/delta/tier are already decided — apply them as-is. */
  locked?: LockedDevelopment;
}): DevelopmentResult {
  const { rng, person, focus, age, performance, locked } = params;
  const { confidence, developmentRate } = person.hidden;
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const rate = clamp(developmentRate, 0.85, 1.15);

  const tier = locked ? locked.tier : rollTier(rng, age, performance, confidence);
  const [lo, hi] = TIER_BUDGET[tier];

  if (!locked && tier === "REGRESSION") {
    const PHYSICAL_DECLINE_POOL: (keyof Attributes)[] = ["athleticism", "strength", "finishing", "defense"];
    const declinePool = profile.active.filter((a) => PHYSICAL_DECLINE_POOL.includes(a) && a !== focus);
    const pool = declinePool.length > 0 ? declinePool : profile.active.filter((a) => a !== focus);

    const used = new Set<string>();
    const changes: DevChange[] = [];
    const nLoss = Math.min(randInt(rng, 1, 2), pool.length);
    for (let i = 0; i < nLoss; i++) {
      const avail = pool.filter((a) => !used.has(a));
      if (avail.length === 0) break;
      const k = pickFromActive(rng, person.playstyle, avail);
      used.add(k);
      changes.push({ attribute: k, delta: Math.round(randRange(rng, lo, hi) * rate) });
    }
    // Even in a regression year, the focus (if any) still earns something.
    const gainPool = profile.active.filter((a) => !used.has(a));
    const gainKey = focus && profile.active.includes(focus) && !used.has(focus) ? focus : gainPool.length ? pickFromActive(rng, person.playstyle, gainPool) : null;
    if (gainKey) {
      const rawGain = randInt(rng, 1, 3);
      const scaledGain = Math.max(1, Math.round(rawGain * diminishingScale(person.attributes[gainKey])));
      changes.push({ attribute: gainKey, delta: scaledGain });
    }
    return finish(tier, changes, person);
  }

  const changes: DevChange[] = [];
  const used = new Set<string>();

  // PRIMARY: the chosen focus attribute gets the FULL tier budget — what the
  // player sees on the development-option card is what they get.
  const primary = locked ? locked.attribute : (focus && profile.active.includes(focus) ? focus : pickFromActive(rng, person.playstyle, profile.active));
  const primaryDelta = locked
    ? locked.delta
    : Math.max(1, Math.round(randRange(rng, lo, hi) * rate * diminishingScale(person.attributes[primary])));
  used.add(primary);
  changes.push({ attribute: primary, delta: primaryDelta });

  // SECONDARY: 1-2 small extra nudges among the OTHER active attributes —
  // texture, never as large as the primary, never touching an inactive one.
  if (tier !== "POOR") {
    const secondaryCount = randInt(rng, 1, 2);
    const secondaryLo = Math.max(1, Math.round(lo * 0.4));
    const secondaryHi = Math.max(secondaryLo, Math.round(hi * 0.5));
    for (let i = 0; i < secondaryCount; i++) {
      const pool = profile.active.filter((a) => !used.has(a));
      if (pool.length === 0) break;
      const k = pickFromActive(rng, person.playstyle, pool);
      used.add(k);
      const rawDelta = Math.round(randRange(rng, secondaryLo, secondaryHi) * rate);
      const delta = Math.round(rawDelta * diminishingScale(person.attributes[k]));
      if (delta > 0) changes.push({ attribute: k, delta });
    }
  }

  return finish(tier, changes, person);
}

/** How much of a POSITIVE roll actually lands, based on how close the
 * attribute already is to the ceiling. Never fully blocks growth — a
 * sufficiently good career can still reach elite ratings, just more slowly
 * once it's already elite. Negative deltas (REGRESSION) are never scaled —
 * a decline shouldn't get gentler just because the player is a star. */
function diminishingScale(current: number): number {
  if (current >= 95) return 0.25;
  if (current >= 85) return 0.5;
  if (current >= 70) return 0.75;
  return 1;
}

/** The exact set of magnitudes a player can ever be OFFERED in "Choose Your
 * Focus": NORMAL (1-4) or RARE (8-9) — never 5/6/7, never 10+. This governs
 * GENERATION, not just display: applied once, at the point a development
 * option's final delta is computed, so the locked-reward contract means
 * whatever gets shown on the card is exactly what gets applied later,
 * unchanged. A raw scaled roll landing in the forbidden 5-7 gap snaps to
 * the nearer edge (5, 6 -> 4; 7 -> 8); anything above 9 clamps down to 9.
 * Near the 99 ceiling, the final clamp against the real attribute value
 * (in getDevelopmentOptions and finish()) can still shrink the applied
 * amount below what was snapped here — that's the ceiling doing its job,
 * not a violation of the band. */
function snapToSelectableBand(raw: number): number {
  if (raw <= 4) return raw;
  if (raw > 9) return 9;
  if (raw <= 6) return 4;
  if (raw === 7) return 8;
  return raw; // raw is 8 or 9
}

function finish(tier: DevTier, changes: DevChange[], person: Person): DevelopmentResult {
  // Drop no-ops and clamp against the real attribute ceiling.
  const cleaned = changes
    .map((c) => {
      const current = person.attributes[c.attribute];
      const capped = clamp(current + c.delta, 30, 99) - current;
      return { attribute: c.attribute, delta: Math.round(capped) };
    })
    .filter((c) => c.delta !== 0);

  const copy = TIER_COPY[tier];
  return {
    tier,
    title: copy.title,
    flavor: copy.flavor,
    changes: cleaned,
    special: tier === "BREAKOUT" || tier === "RARE_BREAKOUT" || tier === "LEGENDARY" || tier === "REGRESSION",
  };
}

// ============================================================
// DEVELOPMENT WORKOUT (minigame)
//
// A pure OPPORTUNITY. Winning improves the season's development; losing
// changes nothing at all. It can never take attributes away, never end a
// career, never cause a regression. That's the whole contract.
// ============================================================

export type WorkoutResult = "WON" | "LOST" | "SKIPPED";

/** Applies the workout to an already-rolled development result. */
export function applyWorkout(
  rng: RNG,
  base: DevelopmentResult,
  outcome: WorkoutResult,
  focus: FocusKey | null,
  person: Person
): { result: DevelopmentResult; bonus: number } {
  if (outcome !== "WON" || !focus) return { result: base, bonus: 0 };

  // A won workout rewards a DIFFERENT active attribute than the one the
  // season's primary roll already targeted — diversifying growth instead of
  // stacking a second bonus onto the same number (the old behavior was the
  // single largest contributor to oversized displayed deltas). Falls back
  // to the focus attribute only if every other active attribute already
  // has a change this season (rare).
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const used = new Set(base.changes.map((c) => c.attribute));
  const pool = profile.active.filter((a) => a !== focus && !used.has(a));
  // Every playstyle's active pool has >=4 attributes (see playstyle.ts) and at
  // most 3 are ever already touched (1 primary + up to 2 secondary), so pool
  // is never empty in practice — the focus fallback below is defensive only.
  const target = pool.length > 0 ? pickFromActive(rng, person.playstyle, pool) : focus;

  const rawBonus = randInt(rng, 2, 4);
  const current = person.attributes[target];
  const scaledBonus = Math.max(1, Math.round(rawBonus * diminishingScale(current)));
  const bonus = clamp(current + scaledBonus, 30, 99) - current; // ceiling-aware, matches finish()'s pattern

  if (bonus <= 0) return { result: base, bonus: 0 };

  const changes = [...base.changes];
  const idx = changes.findIndex((c) => c.attribute === target);
  if (idx >= 0) changes[idx] = { ...changes[idx], delta: changes[idx].delta + bonus };
  else changes.push({ attribute: target, delta: bonus });

  return {
    result: { ...base, changes, flavor: `${base.flavor} The work in the gym showed up.` },
    bonus,
  };
}

/** Which mechanic the workout uses, and what it's framed as. */
export function workoutLabel(focus: FocusKey | null): string {
  if (!focus) return "Offseason Workout";
  return `${ATTR_LABEL[focus]} Workout`;
}

export function applyDevelopment(person: Person, result: DevelopmentResult): Person {
  const attributes: Attributes = { ...person.attributes };
  for (const c of result.changes) {
    attributes[c.attribute] = clamp(attributes[c.attribute] + c.delta, 30, 99);
  }
  return { ...person, attributes };
}

export const ATTR_LABEL: Record<keyof Attributes, string> = {
  shooting: "Shooting", finishing: "Finishing", passing: "Passing",
  ballHandling: "Ball Handling", defense: "Defense", athleticism: "Athleticism",
  strength: "Strength", basketballIQ: "Basketball IQ", clutch: "Clutch",
};

/** Short, one-line microcopy pools for the attribute the player explicitly
 * picked in "Choose Your Focus" this season — shown under that one row in
 * Season Complete, alongside its rarity badge. Never a paragraph, never
 * shown for aging/minigame/workout deltas. pickAttrFlavor below rotates
 * through each pool deterministically by season, so the same attribute
 * doesn't always read the same way two seasons in a row. */
export const ATTR_FLAVOR: Record<keyof Attributes, string[]> = {
  shooting: [
    "More reps. More confidence.",
    "The rim starts looking a little bigger.",
    "You're not leaving the gym until it drops.",
  ],
  finishing: [
    "Contested looks start falling anyway.",
    "You're finishing through contact now.",
    "The rim isn't scaring you anymore.",
  ],
  passing: [
    "Every pass counts. The chemistry starts with you.",
    "You're reading the floor a beat early.",
    "Your teammates are starting to trust your reads.",
  ],
  ballHandling: [
    "More control. Fewer turnovers.",
    "The ball starts listening to you.",
    "You're not leaving the gym. Your handle is evolving.",
  ],
  defense: [
    "You're closing gaps. Every possession hurts a little more.",
    "Attackers are starting to look for another way.",
    "Your intensity is showing.",
  ],
  athleticism: [
    "You're a step quicker than you were last season.",
    "The explosiveness is different now.",
    "You're getting to spots nobody else can reach.",
  ],
  strength: [
    "You're not getting moved off your spot anymore.",
    "Contact doesn't slow you down the way it used to.",
    "You're winning the battles in the paint.",
  ],
  basketballIQ: [
    "You're seeing the game before everyone else.",
    "You're studying the game on another level.",
    "You're reading plays before they happen.",
  ],
  clutch: [
    "Late-game moments stopped feeling heavy.",
    "You want the ball when it matters most.",
    "Pressure looks different on you now.",
  ],
};

/** Deterministically rotates through an attribute's microcopy pool by
 * season, so re-rendering the same season always shows the same line (no
 * flicker), but different seasons vary. No RNG plumbing needed — the UI
 * layer has no access to the game's RNG stream, and doesn't need it here. */
export function pickAttrFlavor(attribute: keyof Attributes, season: number): string {
  const pool = ATTR_FLAVOR[attribute];
  return pool[((season % pool.length) + pool.length) % pool.length];
}

export type DevRarity = "NORMAL" | "RARE";

/** Classifies the PLAYER-SELECTED development delta only (never a merged
 * total, never an automatic-source delta) into exactly two rarity tiers.
 * 5/6/7 and anything >=10 intentionally return null — not because they
 * can't happen (LEGENDARY-tier locked rewards up to +11 are still fully
 * reachable in the engine, unchanged), but because this UI's rarity system
 * only ever claims NORMAL or RARE, never anything else, so an unclassified
 * value gets no badge at all rather than a wrong or invented one. */
export function classifyDevRarity(delta: number): DevRarity | null {
  if (delta >= 1 && delta <= 4) return "NORMAL";
  if (delta >= 8 && delta <= 9) return "RARE";
  return null;
}

// ============================================================
// SEASON DEVELOPMENT OPTIONS
//
// Exactly 3 cards per season, drawn without replacement from the playstyle's
// active pool, weighted by the profile's priority table.
// ============================================================

export type LockedDevelopment = { attribute: keyof Attributes; delta: number; tier: DevTier };

export type DevelopmentOptionView = {
  attribute: keyof Attributes;
  label: string;
  from: number;
  to: number;
  delta: number;
  tier: DevTier;
};

/** Re-rolls up to 5 times to avoid handing the player a card that reads as a downgrade. */
function rollPositiveTier(rng: RNG, age: number, performance: number, confidence: number): DevTier {
  for (let i = 0; i < 5; i++) {
    const t = rollTier(rng, age, performance, confidence);
    if (t !== "REGRESSION") return t;
  }
  return "POOR";
}

/**
 * Exactly 3 development options per season, each with its exact resulting
 * value already rolled and locked — the reward the player sees is the
 * reward they get, with no reroll after selection. Only the 3 candidate
 * attributes are drawn without replacement (as before); the magnitude is
 * now resolved immediately, using last season's performance as a form
 * proxy (this season hasn't been played yet, so its own performanceScore
 * can't be an input the way `rollTier` normally expects).
 */
export function getDevelopmentOptions(
  rng: RNG,
  player: Person,
  recentDevAttrs: (keyof Attributes)[],
  age: number,
  lastPerformance: number
): DevelopmentOptionView[] {
  const profile = PLAYSTYLE_PROFILES[player.playstyle];
  const remaining = new Set(profile.active);
  const picked: (keyof Attributes)[] = [];
  const slots = Math.min(3, profile.active.length);

  for (let i = 0; i < slots; i++) {
    const candidates = [...remaining];
    const entries = candidates.map((a) => {
      let w = profile.weights[a] ?? 1;
      const idx = recentDevAttrs.indexOf(a);
      if (idx === 0) w *= 0.35;
      else if (idx === 1) w *= 0.7;
      return { item: a, weight: Math.max(0.05, w) };
    });
    const chosen = weighted(rng, entries);
    picked.push(chosen);
    remaining.delete(chosen);
  }

  const { confidence, developmentRate } = player.hidden;
  const rate = clamp(developmentRate, 0.85, 1.15);

  return picked.map((attribute) => {
    const tier = rollPositiveTier(rng, age, lastPerformance, confidence);
    const [lo, hi] = TIER_BUDGET[tier];
    const current = player.attributes[attribute];
    const rawDelta = Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
    const scaledDelta = Math.max(1, Math.round(rawDelta * diminishingScale(current)));
    const snappedDelta = snapToSelectableBand(scaledDelta);
    const to = clamp(Math.round(current) + snappedDelta, 30, 99);
    const from = Math.round(current);
    return { attribute, label: ATTR_LABEL[attribute], from, to, delta: to - from, tier };
  });
}

/** Merges every source that actually moved an attribute this season into
 * one honest per-attribute total — development (primary+secondary+the
 * workout bonus), offseason aging, and minigame performance. Rounded once
 * at the end, not per-source, so the displayed number matches what
 * actually happened rather than compounding three separate roundings. */
export function totalSeasonDelta(
  development: DevChange[],
  ageReport: AgeReport,
  minigameDev: DevChange[]
): DevChange[] {
  const totals = new Map<keyof Attributes, number>();
  for (const c of development) totals.set(c.attribute, (totals.get(c.attribute) ?? 0) + c.delta);
  for (const a of ageReport) totals.set(a.attribute, (totals.get(a.attribute) ?? 0) + a.delta);
  for (const c of minigameDev) totals.set(c.attribute, (totals.get(c.attribute) ?? 0) + c.delta);
  return [...totals.entries()]
    .map(([attribute, delta]) => ({ attribute, delta: Math.round(delta) }))
    .filter((c) => c.delta !== 0);
}

/** How much of the season's AUTOMATIC growth (aging + minigame development +
 * workout bonus + development's own secondary nudges — everything EXCEPT
 * the player's own locked pick) is allowed to land on a single attribute,
 * once rounded. Enforced for real: both the source lists that feed
 * totalSeasonDelta's display AND the player's actual attribute value are
 * trimmed together below, so the number shown always matches what actually
 * happened — never a display-only clamp that leaves the truth different
 * from what's on screen. */
export const AUTOMATIC_ATTR_CAP = 3;

/**
 * Trims every attribute's AUTOMATIC contribution this season down to
 * AUTOMATIC_ATTR_CAP (once rounded) — EXCEPT the player's own locked pick's
 * attribute (primaryAttribute), which gets a cap of 0: the picked reward
 * (e.g. a RARE +8/+9) must render exactly as shown at selection time, never
 * inflated by incidental aging/minigame growth that happens to land on the
 * same attribute the same season. The locked pick's own devChanges entry is
 * the only thing this function never touches; every other automatic source
 * on that attribute — aging, minigame, dev's own secondary nudges — is
 * trimmed away entirely so the Season Complete row can't drift from the
 * number the player actually chose.
 *
 * For every other attribute, excess above the normal cap is removed from
 * aging first (the most incidental/passive automatic source), then from
 * development's secondary nudges, then from minigame development, until
 * each over-cap attribute's automatic total is back within its cap. The
 * same total reduction is applied to the player's real attributes, so the
 * ceiling is genuine, not cosmetic.
 *
 * Callers must pass a `player` whose attributes ALREADY reflect devChanges,
 * ageReport, and minigameDev applied (career.ts's finishSeason calls this
 * after applyDevelopment/applyMinigameDev/applyAging have all already run)
 * — this function only claws back the excess from an already-grown
 * attribute, it does not apply growth itself.
 */
export function capAutomaticGrowth(
  player: Person,
  primaryAttribute: keyof Attributes | null,
  devChanges: DevChange[],
  ageReport: AgeReport,
  minigameDev: DevChange[]
): { player: Person; devChanges: DevChange[]; ageReport: AgeReport; minigameDev: DevChange[] } {
  const totals = new Map<keyof Attributes, number>();
  // Only the locked pick's own devChanges entry is exempt — aging and
  // minigame contributions to that same attribute still count, so they can
  // be trimmed back to zero below rather than stacking on top of the pick.
  const add = (attribute: keyof Attributes, delta: number, isPrimaryPick: boolean) => {
    if (isPrimaryPick) return;
    totals.set(attribute, (totals.get(attribute) ?? 0) + delta);
  };
  for (const c of devChanges) add(c.attribute, c.delta, c.attribute === primaryAttribute);
  for (const a of ageReport) add(a.attribute, a.delta, false);
  for (const c of minigameDev) add(c.attribute, c.delta, false);

  const capFor = (attribute: keyof Attributes) => (attribute === primaryAttribute ? 0 : AUTOMATIC_ATTR_CAP);

  const excess = new Map<keyof Attributes, number>();
  for (const [attribute, total] of totals) {
    const over = Math.round(total) - capFor(attribute);
    if (over > 0) excess.set(attribute, over);
  }
  if (excess.size === 0) {
    return { player, devChanges, ageReport, minigameDev };
  }

  // Trim the raw source lists that feed totalSeasonDelta's display, in
  // order (aging first, then dev secondary nudges, then minigame), so the
  // number shown always matches what's actually applied below.
  const trimFrom = (attribute: keyof Attributes, delta: number): number => {
    const remaining = excess.get(attribute);
    if (!remaining || remaining <= 0 || delta <= 0) return delta;
    const take = Math.min(remaining, delta);
    excess.set(attribute, remaining - take);
    return delta - take;
  };
  const trimmedAgeReport = ageReport.map((a) => ({ ...a, delta: trimFrom(a.attribute, a.delta) }));
  const trimmedDevChanges = devChanges.map((c) =>
    c.attribute === primaryAttribute ? c : { ...c, delta: trimFrom(c.attribute, c.delta) }
  );
  const trimmedMinigameDev = minigameDev.map((c) => ({ ...c, delta: trimFrom(c.attribute, c.delta) }));

  const attributes = { ...player.attributes };
  for (const [attribute, total] of totals) {
    const over = Math.round(total) - capFor(attribute);
    if (over > 0) attributes[attribute] = clamp(attributes[attribute] - over, 30, 99);
  }

  return {
    player: { ...player, attributes },
    devChanges: trimmedDevChanges,
    ageReport: trimmedAgeReport,
    minigameDev: trimmedMinigameDev,
  };
}
