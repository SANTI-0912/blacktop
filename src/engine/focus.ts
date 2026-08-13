import { Attributes, Person } from "./types";
import { RNG, clamp, randRange } from "./rng";
import { PLAYSTYLE_PROFILES } from "./playstyle";

// ============================================================
// SEASON FOCUS + AGING
//
// Focus is the PRIMARY development lever and it is the player's choice every
// single season. It sets DIRECTION, never ceiling — everyone keeps an elite
// ceiling regardless of what they pick.
// ============================================================

export type FocusKey = keyof Attributes;

/** Base gain from a deliberate season of work on one facet. */
export function applyFocus(person: Person, focus: FocusKey): Person {
  const attributes: Attributes = { ...person.attributes };
  attributes[focus] = clamp(attributes[focus] + 3, 30, 99);
  return { ...person, attributes };
}

// ============================================================
// AGE CURVE
//
// Age doesn't kill the player — it forces a change of style. Physical
// attributes peak earliest and decline soonest and steepest. Technical and
// mental ones keep climbing through the late 20s and age noticeably better
// — but they aren't exempt: they too turn to a mild decline in the early
// 30s, and a real one from the mid-30s on. A dunker at 22 can end as a
// shooter/passer at 34, still productive but past his own peak either way.
// ============================================================

const PHYSICAL_DECLINE_POOL: (keyof Attributes)[] = ["athleticism", "strength", "finishing", "defense"];
const SKILL_GROWTH_POOL: (keyof Attributes)[] = ["basketballIQ", "passing", "shooting", "ballHandling"];

export type AgeReport = { attribute: keyof Attributes; delta: number }[];

export function applyAging(rng: RNG, person: Person, age: number): { person: Person; report: AgeReport } {
  const attributes: Attributes = { ...person.attributes };
  const report: AgeReport = [];
  const active = new Set(PLAYSTYLE_PROFILES[person.playstyle].active);

  let physDelta = 0;
  if (age <= 24) physDelta = randRange(rng, 0.8, 2.0);
  else if (age <= 27) physDelta = randRange(rng, -0.2, 0.6);
  else if (age <= 30) physDelta = randRange(rng, -1.8, -0.6);
  else if (age <= 33) physDelta = randRange(rng, -3.2, -1.6);
  else physDelta = randRange(rng, -4.5, -2.5);

  let mentDelta = 0;
  if (age <= 25) mentDelta = randRange(rng, 0.6, 1.6);
  else if (age <= 29) mentDelta = randRange(rng, 0.3, 1.1);
  else if (age <= 32) mentDelta = randRange(rng, -1.0, 0.0);
  else mentDelta = randRange(rng, -2.2, -0.6);

  for (const k of PHYSICAL_DECLINE_POOL) {
    if (!active.has(k)) continue;
    const before = attributes[k];
    attributes[k] = clamp(before + physDelta * randRange(rng, 0.7, 1.3), 30, 99);
    const d = Math.round((attributes[k] - before) * 10) / 10;
    if (Math.abs(d) >= 0.5) report.push({ attribute: k, delta: d });
  }
  for (const k of SKILL_GROWTH_POOL) {
    if (!active.has(k)) continue;
    const before = attributes[k];
    attributes[k] = clamp(before + mentDelta * randRange(rng, 0.7, 1.3), 30, 99);
    const d = Math.round((attributes[k] - before) * 10) / 10;
    if (Math.abs(d) >= 0.5) report.push({ attribute: k, delta: d });
  }

  // Clutch stays outside the playstyle system entirely (spec §2.2) but keeps
  // its own small independent drift, same magnitude as before this change.
  const clutchBefore = attributes.clutch;
  attributes.clutch = clamp(clutchBefore + randRange(rng, -0.3, 0.5), 30, 99);
  const clutchDelta = Math.round((attributes.clutch - clutchBefore) * 10) / 10;
  if (Math.abs(clutchDelta) >= 0.5) report.push({ attribute: "clutch", delta: clutchDelta });

  return { person: { ...person, attributes }, report };
}

/** Retirement pressure rises once the physical decline is well underway. */
export function retirementChance(age: number, ovr: number): number {
  if (age < 32) return 0;
  const ageP = (age - 31) * 0.16;
  const declineP = ovr < 72 ? 0.35 : ovr < 80 ? 0.15 : 0;
  return clamp(ageP + declineP, 0, 1);
}
