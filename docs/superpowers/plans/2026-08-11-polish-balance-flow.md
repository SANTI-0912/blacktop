# Polish + Balance + Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix development's oversized displayed deltas (a stacking problem, not a bad tier table), make Season Complete/Career Hub show the honest TOTAL attribute change per season (development + aging + minigames combined, not just one slice), fix the Olympics result screen's event-scoping leak that makes it repeat the Big Decision's already-shown consequence, and apply a small, disciplined icon-based visual-polish pass reusing the game's existing design system.

**Architecture:** No changes to Fan Love, the event-pacing system, `NarrativeEffects`, the playstyle system, or the locked-development-reward pick-and-lock contract (a card's shown number is still exactly what gets applied — only the numbers themselves, and the diminishing-returns math behind them, change). This plan: (a) rescales `TIER_BUDGET` and narrows `developmentRate`'s multiplier range; (b) adds a diminishing-returns scale applied uniformly wherever a positive delta is finalized; (c) redirects the workout bonus off the season's primary/focus attribute onto a different active one; (d) tracks minigame development (previously untracked, silently mutating attributes) into new `CareerState` fields so it can be merged into one honest total; (e) fixes `finishOlympics` to return its own scoped events instead of `App.tsx` guessing via a blind log-tail-slice; (f) adds one icon per section identity across the screens named in the spec, reusing `Divider`/`Eyebrow`'s existing `label`/`children` props — no new components.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- The locked-development-reward contract (a development card's shown `to`/`delta` is exactly what gets applied, never re-rolled) is never broken — every formula change in this plan must be applied identically in `getDevelopmentOptions` (the preview) and `rollDevelopment`/`finish()` (the application).
- `Role`, `playerStatus`, Fan Love (`fanlove.ts`, `FanLove.tsx`'s band logic), the event-pacing cap, `NarrativeEffects`, and the playstyle system (`playstyle.ts`) are never touched.
- Icons are added ONLY at a section's existing `Eyebrow`/`Divider` label — never per data row, never a new component, never more than one icon per section identity.
- `ATTR_FLAVOR` (`development.ts`) is reused verbatim where the plan calls for it — its sentences are not rewritten.
- `tsc --noEmit`, `npm test`, `npx vite build`, and `npm run simulate` must all be clean at the end of this plan (the one known, already-reported exception: `simulation.test.ts`'s OVR-spread statistical test, unrelated to and not to be "fixed" by this plan).

---

## File Structure

**Modified:** `src/engine/development.ts`, `src/engine/development.test.ts`, `src/engine/career.ts`, `src/engine/career.test.ts`, `src/App.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/ui/screens/CareerHub.tsx`, `src/ui/components/FanLove.tsx`, `src/ui/screens/SeasonFlow.tsx`.

**Not touched:** `src/engine/focus.ts`, `src/engine/fanlove.ts`, `src/engine/status.ts`, `src/engine/overall.ts`, `src/engine/playstyle.ts`, `src/engine/awards.ts`, `src/engine/events.ts`/`decisions.ts`/`bigdecision.ts` content, `src/engine/rival.ts`, `src/ui/components/Shell.tsx`, `src/ui/components/TeamLogo.tsx`, `src/ui/components/CareerHeader.tsx`, `src/ui/components/PlayerStatusPanel.tsx`, `styles.css`.

---

### Task 1: Rescale development budgets, narrow the rate multiplier, add diminishing returns

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/development.test.ts`

**Interfaces:**
- Produces: a new internal `diminishingScale(current: number): number` (not exported — used only within `development.ts`, by both `finish()` and `getDevelopmentOptions`).
- `TIER_BUDGET`'s values change; its shape/type is unchanged.

- [ ] **Step 1: Rescale `TIER_BUDGET`**

Find:

```ts
export const TIER_BUDGET: Record<DevTier, [number, number]> = {
  REGRESSION: [-4, -1],
  POOR: [0, 1],
  NORMAL: [2, 4],
  GOOD: [5, 6],
  BREAKOUT: [7, 7],
  RARE_BREAKOUT: [8, 9],
  LEGENDARY: [10, 13],
};
```

Replace with:

```ts
export const TIER_BUDGET: Record<DevTier, [number, number]> = {
  REGRESSION: [-4, -1],
  POOR: [0, 1],
  NORMAL: [1, 3],
  GOOD: [3, 5],
  BREAKOUT: [5, 6],
  RARE_BREAKOUT: [6, 8],
  LEGENDARY: [8, 11],
};
```

- [ ] **Step 2: Narrow `developmentRate`'s clamp range in both call sites**

In `rollDevelopment`, find:

```ts
  const { confidence, developmentRate } = person.hidden;
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const rate = clamp(developmentRate, 0.75, 1.3);
```

Replace with:

```ts
  const { confidence, developmentRate } = person.hidden;
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const rate = clamp(developmentRate, 0.85, 1.15);
```

In `getDevelopmentOptions`, find:

```ts
  const { confidence, developmentRate } = player.hidden;
  const rate = clamp(developmentRate, 0.75, 1.3);
```

Replace with:

```ts
  const { confidence, developmentRate } = player.hidden;
  const rate = clamp(developmentRate, 0.85, 1.15);
```

- [ ] **Step 3: Add `diminishingScale`**

Add this function right above `finish()` (search for `function finish(tier: DevTier, changes: DevChange[], person: Person): DevelopmentResult {`, insert immediately before it):

```ts
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
```

- [ ] **Step 4: Apply the scale inside `finish()`**

Find:

```ts
function finish(tier: DevTier, changes: DevChange[], person: Person): DevelopmentResult {
  // Drop no-ops and clamp against the real attribute ceiling.
  const cleaned = changes
    .map((c) => {
      const current = person.attributes[c.attribute];
      const capped = clamp(current + c.delta, 30, 99) - current;
      return { attribute: c.attribute, delta: Math.round(capped) };
    })
    .filter((c) => c.delta !== 0);
```

Replace with:

```ts
function finish(tier: DevTier, changes: DevChange[], person: Person): DevelopmentResult {
  // Drop no-ops and clamp against the real attribute ceiling. Positive
  // deltas are additionally scaled down the closer the attribute already is
  // to 99 (diminishingScale) — never fully blocked, just slower.
  const cleaned = changes
    .map((c) => {
      const current = person.attributes[c.attribute];
      const scaled = c.delta > 0 ? Math.max(1, Math.round(c.delta * diminishingScale(current))) : c.delta;
      const capped = clamp(current + scaled, 30, 99) - current;
      return { attribute: c.attribute, delta: Math.round(capped) };
    })
    .filter((c) => c.delta !== 0);
```

(Only the added `scaled` line and its use in the `capped` computation change — everything else in `finish()`, including the `TIER_COPY`/`special` logic below this block, is unchanged.)

- [ ] **Step 5: Apply the identical scale inside `getDevelopmentOptions`'s preview**

Find:

```ts
  return picked.map((attribute) => {
    const tier = rollPositiveTier(rng, age, lastPerformance, confidence);
    const [lo, hi] = TIER_BUDGET[tier];
    const current = player.attributes[attribute];
    const rawDelta = Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
    const to = clamp(Math.round(current) + rawDelta, 30, 99);
    const from = Math.round(current);
    return { attribute, label: ATTR_LABEL[attribute], from, to, delta: to - from, tier };
  });
```

Replace with:

```ts
  return picked.map((attribute) => {
    const tier = rollPositiveTier(rng, age, lastPerformance, confidence);
    const [lo, hi] = TIER_BUDGET[tier];
    const current = player.attributes[attribute];
    const rawDelta = Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
    const scaledDelta = Math.max(1, Math.round(rawDelta * diminishingScale(current)));
    const to = clamp(Math.round(current) + scaledDelta, 30, 99);
    const from = Math.round(current);
    return { attribute, label: ATTR_LABEL[attribute], from, to, delta: to - from, tier };
  });
```

This keeps the "what you see is what you get" contract intact: the card's `delta` now already reflects diminishing returns, matching what `rollDevelopment`/`finish()` will produce when that same locked reward is applied at season end (both use the identical `diminishingScale` function).

- [ ] **Step 6: Update the existing `TIER_BUDGET` exact-match test**

In `src/engine/development.test.ts`, find:

```ts
describe("development tier budgets", () => {
  it("matches the approved ranges", () => {
    expect(TIER_BUDGET.REGRESSION).toEqual([-4, -1]);
    expect(TIER_BUDGET.POOR).toEqual([0, 1]);
    expect(TIER_BUDGET.NORMAL).toEqual([2, 4]);
    expect(TIER_BUDGET.GOOD).toEqual([5, 6]);
    expect(TIER_BUDGET.BREAKOUT).toEqual([7, 7]);
    expect(TIER_BUDGET.RARE_BREAKOUT).toEqual([8, 9]);
    expect(TIER_BUDGET.LEGENDARY).toEqual([10, 13]);
  });
```

Replace with:

```ts
describe("development tier budgets", () => {
  it("matches the approved ranges", () => {
    expect(TIER_BUDGET.REGRESSION).toEqual([-4, -1]);
    expect(TIER_BUDGET.POOR).toEqual([0, 1]);
    expect(TIER_BUDGET.NORMAL).toEqual([1, 3]);
    expect(TIER_BUDGET.GOOD).toEqual([3, 5]);
    expect(TIER_BUDGET.BREAKOUT).toEqual([5, 6]);
    expect(TIER_BUDGET.RARE_BREAKOUT).toEqual([6, 8]);
    expect(TIER_BUDGET.LEGENDARY).toEqual([8, 11]);
  });
```

(Only the 5 changed literal arrays — `NORMAL` through `LEGENDARY` — are replaced; `REGRESSION`/`POOR` stay the same on both sides, matching Step 1.)

- [ ] **Step 7: Update the NORMAL-tier delta-band test**

Find:

```ts
  it("the majority of NORMAL-tier option deltas land in [2, 4]", () => {
    let normalCount = 0, inBand = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const rng = createRNG(seed * 7);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "PLAYMAKER",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.72);
      for (const o of options) {
        if (o.tier !== "NORMAL") continue;
        normalCount++;
        if (o.delta >= 2 && o.delta <= 4) inBand++;
      }
    }
    expect(normalCount).toBeGreaterThan(0);
    expect(inBand / normalCount).toBeGreaterThan(0.85);
  });
```

Replace with:

```ts
  it("the majority of NORMAL-tier option deltas land in [1, 3]", () => {
    let normalCount = 0, inBand = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const rng = createRNG(seed * 7);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "PLAYMAKER",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.72);
      for (const o of options) {
        if (o.tier !== "NORMAL") continue;
        normalCount++;
        if (o.delta >= 1 && o.delta <= 3) inBand++;
      }
    }
    expect(normalCount).toBeGreaterThan(0);
    expect(inBand / normalCount).toBeGreaterThan(0.85);
  });
```

(`createPlayer`'s starting attributes sit well below 70, so `diminishingScale` is a no-op at this test's attribute levels — the band assertion is about the tier-budget rescale alone, not diminishing returns.)

- [ ] **Step 8: Add new tests for `diminishingScale`'s effect and the preview/application parity**

Add this new `describe` block at the end of `development.test.ts` (the file does not export `diminishingScale` directly — since it's intentionally private, test it through its observable effect on `rollDevelopment`'s output, using a synthetic `Person` with a manually elevated attribute):

```ts
describe("diminishing returns near the attribute ceiling", () => {
  it("an identical roll produces a smaller displayed delta at a high current value than at a low one", () => {
    const base = primeAveragePlayer(1);
    const lowPlayer = { ...base, attributes: { ...base.attributes, shooting: 55 } };
    const highPlayer = { ...base, attributes: { ...base.attributes, shooting: 92 } };
    const locked = { attribute: "shooting" as const, delta: 4, tier: "GOOD" as const };

    const lowResult = rollDevelopment({ rng: createRNG(1), person: lowPlayer, focus: "shooting", age: 26, performance: 0.72, locked });
    const highResult = rollDevelopment({ rng: createRNG(1), person: highPlayer, focus: "shooting", age: 26, performance: 0.72, locked });

    const lowDelta = lowResult.changes.find((c) => c.attribute === "shooting")!.delta;
    const highDelta = highResult.changes.find((c) => c.attribute === "shooting")!.delta;
    expect(lowDelta).toBe(4); // below 70 — full delta, no scaling
    expect(highDelta).toBeLessThan(lowDelta); // 85-94 band — scaled down
    expect(highDelta).toBeGreaterThan(0); // never fully blocked
  });

  it("getDevelopmentOptions's previewed delta already reflects diminishing returns, matching what rollDevelopment would apply for the same locked reward", () => {
    const base = primeAveragePlayer(2);
    const highPlayer = { ...base, attributes: { ...base.attributes, shooting: 92 } };
    const options = getDevelopmentOptions(createRNG(5), highPlayer, [], 26, 0.72);
    const shootingOption = options.find((o) => o.attribute === "shooting");
    if (!shootingOption) return; // shooting wasn't one of the 3 drawn cards this seed — not this test's concern
    const locked = { attribute: shootingOption.attribute, delta: shootingOption.delta, tier: shootingOption.tier };
    const applied = rollDevelopment({ rng: createRNG(5), person: highPlayer, focus: shootingOption.attribute, age: 26, performance: 0.72, locked });
    const appliedDelta = applied.changes.find((c) => c.attribute === shootingOption.attribute)!.delta;
    expect(appliedDelta).toBe(shootingOption.delta);
  });
});
```

- [ ] **Step 9: Run, confirm tests pass**

Run: `npm test -- development.test.ts` — expect all tests passing.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 11: Commit**

```bash
git add src/engine/development.ts src/engine/development.test.ts
git commit -m "fix: rescale development budgets, narrow the rate multiplier, add diminishing returns near the ceiling

TIER_BUDGET's positive tiers move down a notch (NORMAL 1-3, GOOD 3-5,
BREAKOUT 5-6, RARE_BREAKOUT 6-8, LEGENDARY 8-11) and developmentRate's
multiplier range narrows from 0.75-1.3 to 0.85-1.15, so +1/+2/+3 becomes
the common season instead of +9/+11. A new diminishingScale function
(applied identically in the pre-season card preview and at season-end
application, preserving the locked-reward contract) makes a positive
roll land smaller the closer an attribute already is to 99 — never
blocking growth, just slowing it near the top."
```

---

### Task 2: Redirect the workout bonus off the primary attribute

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/career.ts`
- Modify: `src/engine/development.test.ts`

**Interfaces:**
- `applyWorkout`'s signature changes: gains a required `person: Person` 5th parameter.
- Consumes: `Task 1`'s `diminishingScale` (same file, no new import needed) and the existing `pickFromActive` (already defined earlier in `development.ts`).

- [ ] **Step 1: Rewrite `applyWorkout`**

Find:

```ts
/** Applies the workout to an already-rolled development result. */
export function applyWorkout(
  rng: RNG,
  base: DevelopmentResult,
  outcome: WorkoutResult,
  focus: FocusKey | null
): { result: DevelopmentResult; bonus: number } {
  if (outcome !== "WON" || !focus) return { result: base, bonus: 0 };

  // A won workout adds to the FOCUS attribute only, and can occasionally
  // push an ordinary year into something better.
  const bonus = randInt(rng, 2, 4);
  const changes = [...base.changes];
  const idx = changes.findIndex((c) => c.attribute === focus);
  if (idx >= 0) changes[idx] = { ...changes[idx], delta: changes[idx].delta + bonus };
  else changes.unshift({ attribute: focus, delta: bonus });

  return {
    result: { ...base, changes, flavor: `${base.flavor} The work in the gym showed up.` },
    bonus,
  };
}
```

Replace with:

```ts
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
```

- [ ] **Step 2: Update the call site in `career.ts`**

Find (search for `applyWorkout(rng, baseDevelopment, state.workout, state.focus)`):

```ts
  // A won workout ADDS to the focus attribute. A lost one changes nothing —
  // it can never subtract or trigger a regression.
  const workoutApplied = applyWorkout(rng, baseDevelopment, state.workout, state.focus);
```

Replace with:

```ts
  // A won workout rewards a different active attribute than the season's
  // primary. A lost one changes nothing — it can never subtract or trigger
  // a regression.
  const workoutApplied = applyWorkout(rng, baseDevelopment, state.workout, state.focus, player);
```

- [ ] **Step 3: Add tests for the redirect**

In `development.test.ts`, add `applyWorkout` to the existing import line — find:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions } from "./development";
```

Replace with:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout } from "./development";
```

Add this new `describe` block at the end of the file:

```ts
describe("applyWorkout redirects the bonus off the primary attribute", () => {
  it("lands the bonus on a different active attribute than focus, when one is available", () => {
    const player = primeAveragePlayer(3);
    const base = rollDevelopment({
      rng: createRNG(3), person: player, focus: "shooting", age: 26, performance: 0.72,
      locked: { attribute: "shooting", delta: 3, tier: "NORMAL" },
    });
    const { result, bonus } = applyWorkout(createRNG(9), base, "WON", "shooting", player);
    expect(bonus).toBeGreaterThan(0);
    const shootingChange = result.changes.find((c) => c.attribute === "shooting");
    // The primary's own delta (3, from the lock) must be unchanged — the
    // bonus went to a different attribute, not stacked here.
    expect(shootingChange?.delta).toBe(3);
    const otherChanges = result.changes.filter((c) => c.attribute !== "shooting");
    expect(otherChanges.some((c) => c.delta === bonus)).toBe(true);
  });

  it("a lost or skipped workout changes nothing", () => {
    const player = primeAveragePlayer(4);
    const base = rollDevelopment({
      rng: createRNG(4), person: player, focus: "shooting", age: 26, performance: 0.72,
      locked: { attribute: "shooting", delta: 3, tier: "NORMAL" },
    });
    const lost = applyWorkout(createRNG(9), base, "LOST", "shooting", player);
    expect(lost.bonus).toBe(0);
    expect(lost.result).toEqual(base);
    const skipped = applyWorkout(createRNG(9), base, "SKIPPED", "shooting", player);
    expect(skipped.bonus).toBe(0);
  });
});
```

- [ ] **Step 4: Run, confirm tests pass**

Run: `npm test -- development.test.ts` — expect all tests passing. Run: `npm test -- career.test.ts` — expect no new failures (this call site is exercised indirectly by existing `finishSeason`-driving tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` — must be clean (confirms the new `person` parameter is threaded correctly).

- [ ] **Step 6: Commit**

```bash
git add src/engine/development.ts src/engine/career.ts src/engine/development.test.ts
git commit -m "fix: redirect the won-workout bonus off the season's primary attribute

The bonus (+2 to +4) now lands on a different active attribute than the
one the season's primary development roll already targeted, instead of
stacking on top of it — the single largest concrete contributor to the
reported +11/+13 single-attribute deltas. Diversifies growth instead of
piling onto one number; still ceiling-aware and diminishing-returns-scaled
like every other positive delta."
```

---

### Task 3: Track minigame development, add the total-season-delta merge

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/career.ts`
- Modify: `src/engine/development.test.ts`

**Interfaces:**
- Produces: `totalSeasonDelta(development: DevChange[], ageReport: AgeReport, minigameDev: DevChange[]): DevChange[]`, exported from `development.ts`.
- `CareerState` gains `seasonMinigameDev: DevChange[]` (accumulates during the season, cleared each season) and `lastMinigameDev: DevChange[]` (snapshot at season end, survives into the Hub — mirrors `lastDevelopment`'s existing relationship to the season's live roll).

- [ ] **Step 1: Add `totalSeasonDelta` to `development.ts`**

Add the import for `AgeReport` — find the top of the file:

```ts
import { Attributes, Person, Playstyle } from "./types";
import { RNG, clamp, randInt, randRange, weighted } from "./rng";
import { FocusKey } from "./focus";
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

Replace with:

```ts
import { Attributes, Person, Playstyle } from "./types";
import { RNG, clamp, randInt, randRange, weighted } from "./rng";
import { FocusKey, AgeReport } from "./focus";
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

Add this new function at the very end of `development.ts` (after `getDevelopmentOptions`):

```ts
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
```

- [ ] **Step 2: Add the two new `CareerState` fields**

In `src/engine/career.ts`, find:

```ts
  /** This season's development result, kept around (not just transient
   * finishSeason output) so screens reached after Season Complete — like
   * the Career Hub's Stats tab — can still show "what changed this season." */
  lastDevelopment: DevelopmentResult | null;
};
```

Replace with:

```ts
  /** This season's development result, kept around (not just transient
   * finishSeason output) so screens reached after Season Complete — like
   * the Career Hub's Stats tab — can still show "what changed this season." */
  lastDevelopment: DevelopmentResult | null;
  /** Attribute deltas from minigame performance THIS season (interactive
   * tournament rounds + the finals-decider), accumulated across
   * resolveTournamentRound calls and finishSeason's own minigame roll —
   * cleared each season. */
  seasonMinigameDev: DevChange[];
  /** Snapshot of seasonMinigameDev at the moment the season ended, for
   * display even after seasonMinigameDev resets for the next season —
   * same relationship lastDevelopment has to the live development roll. */
  lastMinigameDev: DevChange[];
};
```

Update the `development.ts` import line at the top of `career.ts` — find:

```ts
import {
  DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult,
  getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment,
} from "./development";
```

Replace with:

```ts
import {
  DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult,
  getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment, DevChange, totalSeasonDelta,
} from "./development";
```

- [ ] **Step 3: Initialize both fields in `initCareer`**

Find:

```ts
    lastAgeReport: [],
    lastDevNote: null,
    lastDevelopment: null,
    tournament: null,
```

Replace with:

```ts
    lastAgeReport: [],
    lastDevNote: null,
    lastDevelopment: null,
    seasonMinigameDev: [],
    lastMinigameDev: [],
    tournament: null,
```

- [ ] **Step 4: Accumulate in `resolveTournamentRound`**

Find:

```ts
  let player = state.player;
  const dev = developmentFromRun(outcome);
  if (dev) {
    const attributes = { ...player.attributes };
    attributes[dev.attribute] = clamp(attributes[dev.attribute] + dev.amount, 30, 99);
    player = { ...player, attributes };
  }
```

Replace with:

```ts
  let player = state.player;
  const dev = developmentFromRun(outcome);
  let seasonMinigameDev = state.seasonMinigameDev;
  if (dev) {
    const attributes = { ...player.attributes };
    attributes[dev.attribute] = clamp(attributes[dev.attribute] + dev.amount, 30, 99);
    player = { ...player, attributes };
    seasonMinigameDev = [...seasonMinigameDev, { attribute: dev.attribute, delta: dev.amount }];
  }
```

Then find this function's return statement (search for `return {\n    state: {\n      ...state,\n      player,\n      tournament: { ...t, current: cleared, cleared },`):

```ts
  return {
    state: {
      ...state,
      player,
      tournament: { ...t, current: cleared, cleared },
      recentMinigames: [challenge.gauntlet.headlineKind, ...state.recentMinigames].slice(0, 5),
      log: [...state.log, ...events],
      moments: [...state.moments, ...events.filter((e) => e.type === "signature_moment")],
    },
    advanced: wonTournament,
    tournamentOver: true, // the whole bracket resolves in one session now
    wonTournament,
    events,
  };
```

Replace with:

```ts
  return {
    state: {
      ...state,
      player,
      tournament: { ...t, current: cleared, cleared },
      recentMinigames: [challenge.gauntlet.headlineKind, ...state.recentMinigames].slice(0, 5),
      log: [...state.log, ...events],
      moments: [...state.moments, ...events.filter((e) => e.type === "signature_moment")],
      seasonMinigameDev,
    },
    advanced: wonTournament,
    tournamentOver: true, // the whole bracket resolves in one session now
    wonTournament,
    events,
  };
```

- [ ] **Step 5: Accumulate and finalize in `finishSeason`**

Find (this is the finals-decider minigame block, inside `finishSeason`):

```ts
  // Minigames are a SECONDARY development source, capped so they can't
  // outrun the deliberate season focus.
  if (outcome) {
    const dev = developmentFromRun(outcome);
    if (dev) {
      const attributes = { ...player.attributes };
      attributes[dev.attribute] = clamp(attributes[dev.attribute] + dev.amount, 30, 99);
      player = { ...player, attributes };
      events.push({
        id: `mgdev_${state.season}`, season: state.season, type: "development",
        narrative: `That run sharpened your game (+${dev.amount} ${String(dev.attribute)}).`,
        flags: ["minigame_development"],
      });
    }
  }
```

Replace with:

```ts
  // Minigames are a SECONDARY development source, capped so they can't
  // outrun the deliberate season focus. Accumulates on top of whatever
  // resolveTournamentRound already tracked earlier this same season.
  let seasonMinigameDev = state.seasonMinigameDev;
  if (outcome) {
    const dev = developmentFromRun(outcome);
    if (dev) {
      const attributes = { ...player.attributes };
      attributes[dev.attribute] = clamp(attributes[dev.attribute] + dev.amount, 30, 99);
      player = { ...player, attributes };
      seasonMinigameDev = [...seasonMinigameDev, { attribute: dev.attribute, delta: dev.amount }];
      events.push({
        id: `mgdev_${state.season}`, season: state.season, type: "development",
        narrative: `That run sharpened your game (+${dev.amount} ${String(dev.attribute)}).`,
        flags: ["minigame_development"],
      });
    }
  }
```

Then find the `next: CareerState` object built later in the same function:

```ts
  const next: CareerState = {
    ...state, player, rival, threads,
    timeline: [...state.timeline, entry],
    pendingChallenge: null,
    tournament: null,
    workout: "SKIPPED",
    lockedDevelopment: null,
    seasonEventCategories: [],
    seasonDecisions: [],
    log: [...state.log, ...events],
    moments: [...state.moments, ...events.filter((e) => e.type === "signature_moment")],
    lastDevelopment: development,
  };
```

Replace with:

```ts
  const next: CareerState = {
    ...state, player, rival, threads,
    timeline: [...state.timeline, entry],
    pendingChallenge: null,
    tournament: null,
    workout: "SKIPPED",
    lockedDevelopment: null,
    seasonEventCategories: [],
    seasonDecisions: [],
    log: [...state.log, ...events],
    moments: [...state.moments, ...events.filter((e) => e.type === "signature_moment")],
    lastDevelopment: development,
    lastMinigameDev: seasonMinigameDev,
    seasonMinigameDev: [],
  };
```

**Placement note:** the `let seasonMinigameDev = state.seasonMinigameDev;` declaration in this step must be read fresh against the live file — confirm it doesn't collide with any other local named `seasonMinigameDev` already in scope in this function (it shouldn't; this is a new local). This local is then read again later when `next` is built, so its declaration must stay in scope between the minigame block and the `next` object — both are already within the same `finishSeason` function body, just confirm no early `return` sits between them by reading the function in full first.

- [ ] **Step 6: Write tests for `totalSeasonDelta`**

In `development.test.ts`, add `totalSeasonDelta` to the import line — find (after Task 2's edit):

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout } from "./development";
```

Replace with:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta } from "./development";
```

Add this new `describe` block at the end of the file:

```ts
describe("totalSeasonDelta", () => {
  it("merges development, aging, and minigame sources for the same attribute into one rounded total", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "shooting", delta: 1.6 }],
      [{ attribute: "shooting", delta: 2 }]
    );
    expect(result).toEqual([{ attribute: "shooting", delta: 7 }]); // 3 + 1.6 + 2 = 6.6 -> rounds to 7
  });

  it("keeps non-overlapping attributes separate", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "athleticism", delta: 1.2 }],
      [{ attribute: "ballHandling", delta: 2 }]
    );
    const byAttr = new Map(result.map((c) => [c.attribute, c.delta]));
    expect(byAttr.get("shooting")).toBe(3);
    expect(byAttr.get("athleticism")).toBe(1);
    expect(byAttr.get("ballHandling")).toBe(2);
  });

  it("drops an attribute whose combined total nets to zero", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "shooting", delta: -3 }],
      []
    );
    expect(result).toEqual([]);
  });

  it("handles all-empty inputs", () => {
    expect(totalSeasonDelta([], [], [])).toEqual([]);
  });
});
```

- [ ] **Step 7: Write a `career.ts` test confirming minigame accumulation survives to `finishSeason`'s output**

In `src/engine/career.test.ts`, add `getDevelopmentOptions`... actually just confirm `chooseFocus`, `runSeason`, `finishSeason` are already imported (they are, per the existing import line) — no new import needed for this specific test since it only exercises existing exports. Add this new `describe` block at the end of the file:

```ts
describe("lastMinigameDev persists on CareerState, seasonMinigameDev resets each season", () => {
  it("finishSeason clears seasonMinigameDev for the next season regardless of whether any minigame fired", () => {
    let state = initCareer(20, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    state = chooseFocus(state, "shooting");
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.state.seasonMinigameDev).toEqual([]);
    // lastMinigameDev may be empty too (no interactive minigame run in this
    // headless test path) — the field must exist and be an array either way.
    expect(Array.isArray(end.state.lastMinigameDev)).toBe(true);
  });
});
```

- [ ] **Step 8: Run, confirm tests pass**

Run: `npm test -- development.test.ts` and `npm test -- career.test.ts` — expect all passing.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 10: Commit**

```bash
git add src/engine/development.ts src/engine/career.ts src/engine/development.test.ts src/engine/career.test.ts
git commit -m "feat: track minigame development, add totalSeasonDelta to merge every attribute source honestly

CareerState gains seasonMinigameDev (accumulated across the season's
interactive tournament rounds and the finals-decider) and lastMinigameDev
(a snapshot for display after the season ends) — previously minigame
development silently mutated attributes with zero record anywhere.
totalSeasonDelta merges development + offseason aging + minigame
performance into one honest per-attribute number, rounded once."
```

---

### Task 4: Wire the total delta into Season Complete and the Career Hub

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx`
- Modify: `src/ui/screens/CareerHub.tsx`

**Interfaces:**
- Consumes: `totalSeasonDelta` (Task 3, `../../engine/development`).
- No prop-shape changes to either screen's exported component.

- [ ] **Step 1: `SeasonComplete.tsx` — compute and use the merged total**

Read the file fresh first (Task 6 of this plan will add icons/Awards/flavor-text to this same file afterward — this step only wires the data). Find:

```tsx
import { CareerState, SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL } from "../../engine/development";
import { playerStatus } from "../../engine/status";
```

Replace with:

```tsx
import { CareerState, SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL, totalSeasonDelta } from "../../engine/development";
import { playerStatus } from "../../engine/status";
```

Find:

```tsx
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);
```

Replace with:

```tsx
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);
  const totalDeltas = totalSeasonDelta(development?.changes ?? [], state.lastAgeReport, state.lastMinigameDev);
```

Find:

```tsx
        {development && development.changes.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {development.changes.map((c) => (
              <div key={String(c.attribute)} className="flex items-center justify-between py-1">
                <span className="text-[13px] text-mute">{ATTR_LABEL[c.attribute]}</span>
                <span className="stat-num text-sm">
                  {Math.round(state.player.attributes[c.attribute])}
                  <span className="ml-1.5" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
                    {c.delta > 0 ? "+" : ""}{c.delta}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
```

Replace with:

```tsx
        {totalDeltas.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {totalDeltas.map((c) => (
              <div key={String(c.attribute)} className="flex items-center justify-between py-1">
                <span className="text-[13px] text-mute">{ATTR_LABEL[c.attribute]}</span>
                <span className="stat-num text-sm">
                  {Math.round(state.player.attributes[c.attribute])}
                  <span className="ml-1.5" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
                    {c.delta > 0 ? "+" : ""}{c.delta}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
```

(This step only swaps the data source from `development.changes` to `totalDeltas` and the gate from `development && development.changes.length > 0` to `totalDeltas.length > 0` — the row markup itself is unchanged here; Task 6 adds the flavor-text line inside this same map in a later, separate edit.)

- [ ] **Step 2: `CareerHub.tsx` — same merge in `StatsTab`**

Find:

```tsx
function StatsTab({ state }: { state: CareerState }) {
  const a = state.player.attributes;
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const deltas = new Map((state.lastDevelopment?.changes ?? []).map((c) => [c.attribute, c.delta]));
  const rows = profile.active.map((key) => ({ label: ATTR_DISPLAY_LABEL[key], value: a[key], delta: deltas.get(key) }));
```

Replace with:

```tsx
function StatsTab({ state }: { state: CareerState }) {
  const a = state.player.attributes;
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const totalDeltas = totalSeasonDelta(state.lastDevelopment?.changes ?? [], state.lastAgeReport, state.lastMinigameDev);
  const deltas = new Map(totalDeltas.map((c) => [c.attribute, c.delta]));
  const rows = profile.active.map((key) => ({ label: ATTR_DISPLAY_LABEL[key], value: a[key], delta: deltas.get(key) }));
```

Add the import — find:

```tsx
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
```

Replace with:

```tsx
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { totalSeasonDelta } from "../../engine/development";
```

(Check first whether `../../engine/development` is already imported in this file for any other reason — it is not, per the current import list, so this is a new import line, not a merge into an existing one.)

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx src/ui/screens/CareerHub.tsx
git commit -m "feat: Season Complete and the Career Hub show the honest total attribute delta

Both screens now read totalSeasonDelta (development + aging + minigame
combined) instead of development's slice alone, so the two screens can
never show inconsistent numbers for the same season and the player sees
everything that actually moved, not just one source of it."
```

---

### Task 5: Fix Olympics' event-scoping leak

**Files:**
- Modify: `src/engine/career.ts`
- Modify: `src/engine/career.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- `finishOlympics`'s return type changes from `CareerState` to `{ state: CareerState; events: CareerEvent[] }`.

- [ ] **Step 1: Change `finishOlympics`'s return shape**

Find:

```ts
export function finishOlympics(state: CareerState): CareerState {
  const t = state.tournament;
  const cleared = t ? t.cleared : 0;
  const totalRounds = t ? t.rounds.length : 4;
  const won = cleared >= totalRounds;
  const medal = won ? "Olympic Gold" : cleared === totalRounds - 1 ? "Olympic Silver" : cleared === totalRounds - 2 ? "Olympic Semifinalist" : "Olympics — group stage";
  const events: CareerEvent[] = [
    makeMilestone({
      season: state.season, type: "signature_moment",
      narrative: won
        ? `OLYMPIC GOLD — You win it for ${state.country}.`
        : `${medal}. ${state.country}'s run ends.`,
      flags: won ? ["olympic_gold", MILESTONE_FLAGS.CHAMPIONSHIP] : ["olympic_medal"],
    }),
  ];
  const entry: TimelineEntry = {
    age: state.age - 1,
    season: state.season - 1,
    teamName: state.country,
    teamAbbr: state.country.slice(0, 3).toUpperCase(),
    role: "National Team",
    ovr: playerOvr(state),
    ppg: 0, rpg: 0, apg: 0, record: "—",
    outcome: medal,
    highlight: won ? "Olympic Gold" : undefined,
  };
  return {
    ...state,
    phase: "NBA",
    pendingChallenge: null,
    tournament: null,
    timeline: [...state.timeline, entry],
    log: [...state.log, ...events],
    moments: [...state.moments, ...events],
    player: {
      ...state.player,
      hidden: {
        ...state.player.hidden,
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: clamp(state.player.hidden.fanLove + (won ? 25 : 8), 0, 100),
      },
    },
  };
}
```

Replace with:

```ts
export function finishOlympics(state: CareerState): { state: CareerState; events: CareerEvent[] } {
  const t = state.tournament;
  const cleared = t ? t.cleared : 0;
  const totalRounds = t ? t.rounds.length : 4;
  const won = cleared >= totalRounds;
  const medal = won ? "Olympic Gold" : cleared === totalRounds - 1 ? "Olympic Silver" : cleared === totalRounds - 2 ? "Olympic Semifinalist" : "Olympics — group stage";
  const events: CareerEvent[] = [
    makeMilestone({
      season: state.season, type: "signature_moment",
      narrative: won
        ? `OLYMPIC GOLD — You win it for ${state.country}.`
        : `${medal}. ${state.country}'s run ends.`,
      flags: won ? ["olympic_gold", MILESTONE_FLAGS.CHAMPIONSHIP] : ["olympic_medal"],
    }),
  ];
  const entry: TimelineEntry = {
    age: state.age - 1,
    season: state.season - 1,
    teamName: state.country,
    teamAbbr: state.country.slice(0, 3).toUpperCase(),
    role: "National Team",
    ovr: playerOvr(state),
    ppg: 0, rpg: 0, apg: 0, record: "—",
    outcome: medal,
    highlight: won ? "Olympic Gold" : undefined,
  };
  const next: CareerState = {
    ...state,
    phase: "NBA",
    pendingChallenge: null,
    tournament: null,
    timeline: [...state.timeline, entry],
    log: [...state.log, ...events],
    moments: [...state.moments, ...events],
    player: {
      ...state.player,
      hidden: {
        ...state.player.hidden,
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: clamp(state.player.hidden.fanLove + (won ? 25 : 8), 0, 100),
      },
    },
  };
  return { state: next, events };
}
```

(Every field/computation is byte-identical — only the final `return` statement changes shape, from the bare state object to `{ state: next, events }`, with the state object renamed `next` so it can be referenced in the new return line.)

- [ ] **Step 2: Update `App.tsx`'s call site**

Find:

```ts
      if (res.state.phase === "OLYMPICS") {
        const done = finishOlympics(res.state);
        setState(done);
        setResultEvents(done.log.slice(-3));
        setStage("result");
```

Replace with:

```ts
      if (res.state.phase === "OLYMPICS") {
        const { state: done, events: olympicsEvents } = finishOlympics(res.state);
        setState(done);
        setResultEvents(olympicsEvents);
        setStage("result");
```

- [ ] **Step 3: Write a regression test**

In `src/engine/career.test.ts`, add `finishOlympics` to the existing import line — find:

```ts
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, hasWorkoutOpportunity,
  runSeason, finishSeason, applySeasonEvent, buildEventContext,
  signDraftPick, applyBigDecision,
} from "./career";
```

Replace with:

```ts
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, hasWorkoutOpportunity,
  runSeason, finishSeason, applySeasonEvent, buildEventContext,
  signDraftPick, applyBigDecision, finishOlympics,
} from "./career";
```

Add this new `describe` block at the end of the file:

```ts
describe("finishOlympics returns its own scoped events, never leaking an unrelated prior log entry", () => {
  it("does not include a career_move event from an earlier Big Decision in its returned events", () => {
    let state = initCareer(30, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    // Simulate exactly what the real flow leaves behind: a Big Decision's
    // consequence event sitting in the log right before Olympics resolves.
    state = {
      ...state,
      phase: "OLYMPICS",
      tournament: null,
      log: [
        ...state.log,
        { id: "move_1", season: state.season, type: "career_move", narrative: "You signed with Test Team.", flags: ["stayed_loyal"] },
      ],
    };
    const { events } = finishOlympics(state);
    expect(events.some((e) => e.type === "career_move")).toBe(false);
    expect(events.some((e) => e.type === "signature_moment")).toBe(true);
    expect(events.length).toBe(1); // exactly the one Olympics medal event, nothing else
  });
});
```

- [ ] **Step 4: Run, confirm tests pass**

Run: `npm test -- career.test.ts` — expect all tests passing.

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean (the `tsc` check specifically confirms `App.tsx`'s destructured call site compiles against the new return shape).

- [ ] **Step 6: Commit**

```bash
git add src/engine/career.ts src/engine/career.test.ts src/App.tsx
git commit -m "fix: finishOlympics returns its own scoped events instead of a blind log-tail-slice

App.tsx previously built the Olympics result screen's events via
done.log.slice(-3) — the last 3 entries of the ENTIRE career log, which
at that point almost always still included the just-shown Big Decision's
career_move event, making the Olympics result screen appear to repeat a
consequence the player already saw. finishOlympics now returns the exact
events it generates, mirroring finishSeason's existing SeasonEnd.events
shape, so the Olympics screen only ever shows what happened in Olympics."
```

---

### Task 6: Icons, Awards badges, and Development flavor text — Season Complete, Career Hub, Fan Love

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx`
- Modify: `src/ui/screens/CareerHub.tsx`
- Modify: `src/ui/components/FanLove.tsx`

**Interfaces:**
- Consumes: `ATTR_FLAVOR` (`../../engine/development`, already exported, currently unused).
- No prop-shape changes to any component.

- [ ] **Step 1: `FanLove.tsx` — one icon**

Find:

```tsx
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Fan Love</span>
        <span className="stat-num text-sm text-amber">{v} / 100</span>
      </div>
```

Replace with:

```tsx
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">❤️ Fan Love</span>
        <span className="stat-num text-sm text-amber">{v} / 100</span>
      </div>
```

- [ ] **Step 2: `SeasonComplete.tsx` — Stats/Around the League icons, Awards badges, Development flavor line**

Read the file fresh first (Task 4 already touched it in this same plan). Add the `ATTR_FLAVOR` import — find:

```tsx
import { DevelopmentResult, ATTR_LABEL, totalSeasonDelta } from "../../engine/development";
```

Replace with:

```tsx
import { DevelopmentResult, ATTR_LABEL, ATTR_FLAVOR, totalSeasonDelta } from "../../engine/development";
```

Add the `AWARD_ICON` lookup right above the `SeasonComplete` function (search for `export function SeasonComplete({`, insert immediately before it):

```tsx
const AWARD_ICON: Record<string, string> = {
  "MVP": "👑",
  "CHAMPION": "🏆",
  "ALL STAR": "⭐",
  "ALL NBA": "🎖️",
  "DPOY": "🛡️",
  "ROOKIE OF YEAR": "🌟",
  "FINALS MVP": "🥇",
  "ALL TOURNAMENT": "🏅",
};
```

(These keys match exactly what `conclusion.awards: string[]` contains — confirmed from `career.ts`'s `buildConclusion` call site, which builds this array via `awards.map((a) => a.type.replace(/_/g, " "))`, e.g. `"ALL_STAR"` becomes `"ALL STAR"`.)

Find:

```tsx
      <div className="mt-6 rise rise-2">
        <Eyebrow>Stats</Eyebrow>
```

Replace with:

```tsx
      <div className="mt-6 rise rise-2">
        <Eyebrow>💪 Stats</Eyebrow>
```

Find (this is the Step 1-of-Task-4 block, now being extended with flavor text — read the live file to confirm this exact block, already updated by Task 4, is what you're editing):

```tsx
        {totalDeltas.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {totalDeltas.map((c) => (
              <div key={String(c.attribute)} className="flex items-center justify-between py-1">
                <span className="text-[13px] text-mute">{ATTR_LABEL[c.attribute]}</span>
                <span className="stat-num text-sm">
                  {Math.round(state.player.attributes[c.attribute])}
                  <span className="ml-1.5" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
                    {c.delta > 0 ? "+" : ""}{c.delta}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
```

Replace with:

```tsx
        {totalDeltas.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {totalDeltas.map((c) => (
              <div key={String(c.attribute)} className="py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-mute">{ATTR_LABEL[c.attribute]}</span>
                  <span className="stat-num text-sm">
                    {Math.round(state.player.attributes[c.attribute])}
                    <span className="ml-1.5" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
                      {c.delta > 0 ? "+" : ""}{c.delta}
                    </span>
                  </span>
                </div>
                {c.delta >= 3 && (
                  <p className="text-[11px] text-mute mt-0.5 leading-snug">{ATTR_FLAVOR[c.attribute]}</p>
                )}
              </div>
            ))}
          </div>
        )}
```

(A total delta of at least 3 — the new GOOD tier's lower bound — gets the one-line flavor sentence; smaller routine deltas stay numbers-only, per the explicit "no llenar de texto" constraint. `ATTR_FLAVOR`'s existing sentences are used verbatim, not rewritten, and never touch a stat — purely a lookup by which attribute moved.)

Find:

```tsx
        {conclusion.awards.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {conclusion.awards.map((a) => (
              <span key={a} className="px-2.5 py-1 border border-amber/60 text-amber rounded-sm eyebrow">
                {a}
              </span>
            ))}
          </div>
        )}
```

Replace with:

```tsx
        {conclusion.awards.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {conclusion.awards.map((a) => (
              <span key={a} className="px-2.5 py-1 border border-amber/60 text-amber rounded-sm eyebrow">
                {AWARD_ICON[a] ?? ""} {a}
              </span>
            ))}
          </div>
        )}
```

Find:

```tsx
      {leagueNews.length > 0 && (
        <div className="mt-6 rise rise-3">
          <Divider label="Around the League" />
```

Replace with:

```tsx
      {leagueNews.length > 0 && (
        <div className="mt-6 rise rise-3">
          <Divider label="🗞️ Around the League" />
```

- [ ] **Step 3: `SeasonComplete.tsx`'s `DevelopmentScreen` — tier-varying icon**

In the same file, find `DevelopmentScreen` (the rare-tier full-screen reveal — a separate exported function in this file, above `SeasonComplete`):

```tsx
export function DevelopmentScreen({
  result, onNext,
}: { result: DevelopmentResult; onNext: () => void }) {
  const good = result.tier !== "REGRESSION" && result.tier !== "POOR";
  const tone = result.tier === "REGRESSION" ? "#FF4D3D" : good ? "#E8A33D" : "#8A99B8";

  return (
    <Screen>
      <div className="rise mt-12">
        <Eyebrow>Development</Eyebrow>
        <h1 className="mt-2 font-display uppercase text-[46px] leading-[0.9]" style={{ color: tone }}>
          {result.title}
        </h1>
```

Replace with:

```tsx
export function DevelopmentScreen({
  result, onNext,
}: { result: DevelopmentResult; onNext: () => void }) {
  const good = result.tier !== "REGRESSION" && result.tier !== "POOR";
  const tone = result.tier === "REGRESSION" ? "#FF4D3D" : good ? "#E8A33D" : "#8A99B8";
  const tierIcon =
    result.tier === "LEGENDARY" ? "🌟"
    : result.tier === "BREAKOUT" || result.tier === "RARE_BREAKOUT" ? "🔥"
    : result.tier === "NORMAL" || result.tier === "GOOD" ? "💪"
    : ""; // POOR/REGRESSION — no icon, the muted/red tone already carries it

  return (
    <Screen>
      <div className="rise mt-12">
        <Eyebrow>{tierIcon ? `${tierIcon} ` : ""}Development</Eyebrow>
        <h1 className="mt-2 font-display uppercase text-[46px] leading-[0.9]" style={{ color: tone }}>
          {result.title}
        </h1>
```

- [ ] **Step 4: `CareerHub.tsx` — STATS tab icon**

Find:

```tsx
      <Eyebrow>{profile.label} attributes — these set your windows in the championship challenge</Eyebrow>
```

Replace with:

```tsx
      <Eyebrow>💪 {profile.label} attributes — these set your windows in the championship challenge</Eyebrow>
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx src/ui/screens/CareerHub.tsx src/ui/components/FanLove.tsx
git commit -m "feat: icons, Awards badges, and a short Development flavor line — Season Complete, Career Hub, Fan Love

One icon per section identity at the existing Eyebrow/Divider label
(Stats, Around the League, Fan Love, the rare-tier Development reveal),
reusing the game's existing symbolic-icon idiom (previously only 🔥/★).
Awards gain a per-type icon badge. A one-line flavor sentence (reused
verbatim from the existing, previously-unused ATTR_FLAVOR table) now
appears under any attribute whose total season delta is 3 or more —
routine +1/+2 deltas stay numbers-only. Purely presentational; no stat
is affected by any of this."
```

---

### Task 7: Icons — SeasonFlow.tsx (season simulation, Olympics, Olympics result)

**Files:**
- Modify: `src/ui/screens/SeasonFlow.tsx`

**Interfaces:**
- No prop-shape changes to any component in this file.

- [ ] **Step 1: `SeasonSimScreen`'s three labels**

Find:

```tsx
      <div className="mt-5 rise rise-2">
        <div className="flex items-baseline justify-between eyebrow mb-1.5">
          <span>Season progress</span>
          <span>{shown} / {weeks.length} weeks</span>
        </div>
```

Replace with:

```tsx
      <div className="mt-5 rise rise-2">
        <div className="flex items-baseline justify-between eyebrow mb-1.5">
          <span>📈 Season progress</span>
          <span>{shown} / {weeks.length} weeks</span>
        </div>
```

Find:

```tsx
          {bracket.length > 0 && (
            <div className="mt-6 rise rise-1">
              <Divider label="Postseason" />
```

Replace with:

```tsx
          {bracket.length > 0 && (
            <div className="mt-6 rise rise-1">
              <Divider label="🏀 Postseason" />
```

Find:

```tsx
          {rivalEvents.length > 0 && (
            <div className="mt-6 rise rise-2">
              <Divider label="Around the league" />
```

Replace with:

```tsx
          {rivalEvents.length > 0 && (
            <div className="mt-6 rise rise-2">
              <Divider label="🗞️ Around the League" />
```

(Casing aligned to match `SeasonComplete.tsx`'s "Around the League" — same concept, same icon, same title case, now consistent across both screens.)

- [ ] **Step 2: `OlympicsScreen`'s eyebrow**

Find:

```tsx
      <div className="rise">
        <Eyebrow>International</Eyebrow>
        <Title size="xl">Olympic<br />Games</Title>
```

Replace with:

```tsx
      <div className="rise">
        <Eyebrow>✈️ International</Eyebrow>
        <Title size="xl">Olympic<br />Games</Title>
```

- [ ] **Step 3: `SeasonResultScreen`'s eyebrow**

Find:

```tsx
      {headline && (
        <div className="rise mt-4">
          <Eyebrow>Result</Eyebrow>
          <p className="mt-2 font-display uppercase text-[30px] leading-[0.98]">{headline.narrative}</p>
        </div>
      )}
```

Replace with:

```tsx
      {headline && (
        <div className="rise mt-4">
          <Eyebrow>✈️ Olympics Result</Eyebrow>
          <p className="mt-2 font-display uppercase text-[30px] leading-[0.98]">{headline.narrative}</p>
        </div>
      )}
```

(`SeasonResultScreen` is confirmed, per the prior plan's Global Constraint — still true, unchanged by this plan — to be used exclusively by the Olympics-finish path, so hardcoding an Olympics-specific label here is correct, not a special case bolted onto a generic screen.)

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SeasonFlow.tsx
git commit -m "feat: icons for season simulation, Olympics, and the Olympics result screen

Season progress, Postseason, and Around the League (season-sim screen)
gain their section icons, matching Season Complete's existing wording/
icon for the same concepts. Olympics' own screens (OlympicsScreen,
SeasonResultScreen — confirmed still exclusive to the Olympics-finish
path) gain a distinct ✈️ identity instead of reading as a generic
leftover screen next to the now-richer Season Complete."
```

---

### Task 8: Final verification

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread failure is expected and unrelated to this plan — confirm it's the ONLY failure). Compare `npm run simulate`'s tier-distribution and average-final-OVR output against this plan's own investigation baseline (recorded in the design spec, §2.2's table and the investigation's real numbers) — confirm BREAKOUT-or-better stays similarly rare in *frequency* (the tier weights in `rollTier` are unchanged by this plan) while the simulator doesn't crash and average final OVRs shift down somewhat (expected, given every positive tier's budget shrank) without collapsing to unreasonably low values.

- [ ] **Step 2: Real browser smoke test**

Start the dev server and play through a real career via `claude-in-chrome`. Specifically confirm:

1. **Development pacing**: play several consecutive seasons. Confirm +1/+2/+3 reads as the common single-attribute delta; a +6-or-more single-attribute delta is rare and, when it happens, is tied to a visibly special moment (the `DevelopmentScreen` full-screen reveal, tier-appropriate icon and title). Confirm no ordinary season produces a +9-to-+13 single-attribute number outside that rare special-tier path.
2. **Total delta transparency**: on a Season Complete screen, cross-check that the shown per-attribute number for at least one attribute reflects more than just `development.changes` alone when the player is young enough for aging to be actively adding points (age ≤ 25) — i.e., confirm the number is the sum, not just development's slice.
3. **Diminishing returns**: if reachable within the smoke-test session (may require simulating forward with a very high seed or accepting this is better covered by the unit tests from Task 1), otherwise rely on Task 1's unit tests as the primary evidence for this item — note in the report which was used.
4. **Development flavor text**: confirm a short one-line sentence appears under an attribute's row only when that attribute's total delta is 3 or more, and confirm it never appears for a +1/+2 routine delta.
5. **Awards icons**: reach a season with at least one award and confirm the pill shows an icon + the award text.
6. **Icons overall**: confirm every section named in this plan (Stats, Around the League, Fan Love, Development reveal, Career Hub's Stats tab, Season progress, Postseason, Olympics' two screens) shows exactly one icon at its header/label — never one per data row, never more than one per section.
7. **Olympics flow**: play (or fast-forward via seed selection, if the app supports skipping to an Olympics-eligible season) until an Olympics season triggers. Confirm the Olympics result screen (`✈️ Olympics Result`) does NOT repeat the Big Decision's own consequence text that was already shown moments earlier on its own screen.

Report exactly what was visually verified, and which items (if any) were covered by unit tests instead of live observation, with the reason why.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify Step 1, and commit. If clean, no further commit needed.

---

## Self-review notes (already applied above)

- **Spec coverage:** §2 (development rebalance, diminishing returns, workout redirect, total-delta transparency) maps to Tasks 1-4; §4 (Olympics fix) maps to Task 5; §3 (visual polish) maps to Tasks 6-7; §6's testing plan items are folded into each task's own Step (unit tests) and Task 8 (simulate/browser smoke).
- **Placeholder scan:** every code block above is final, verbatim content — no "TBD," no "similar to Task N."
- **Type consistency:** `diminishingScale` (Task 1) is defined once, private to `development.ts`, consumed identically by `finish()` and `getDevelopmentOptions` in the same task, then reused by `applyWorkout` in Task 2 (same file, no new import needed). `totalSeasonDelta` (Task 3) is defined once and consumed with matching signatures in Task 4's two UI call sites. `CareerState.seasonMinigameDev`/`lastMinigameDev` (Task 3) are produced by `resolveTournamentRound` and `finishSeason` and consumed only in Task 4's UI wiring — no other producer/consumer exists. `finishOlympics`'s new `{ state, events }` return shape (Task 5) is destructured identically at its one call site in `App.tsx`.
- **Cross-task ordering:** Task 2 depends on Task 1's `diminishingScale` (same file, sequential). Task 3 depends on Task 1/2 only in the sense that it touches the same files again (`development.ts`, `career.ts`) — re-read fresh, don't assume line numbers survived Tasks 1-2's edits. Task 4 depends on Task 3's `totalSeasonDelta`/new `CareerState` fields existing. Task 6 depends on Task 4's `totalDeltas` variable already existing in `SeasonComplete.tsx` (Task 6's Step 2 extends that exact block). Task 5 (Olympics) and Task 7 (SeasonFlow icons) are both independent of Tasks 1-4/6 and could in principle run in parallel with them, but this plan sequences everything to keep the subagent-driven-development loop simple (never dispatch two implementers on overlapping files at once) — Task 5 touches `career.ts`/`App.tsx` (last touched by Task 3/1 respectively) and Task 7 touches `SeasonFlow.tsx` (untouched by any earlier task in this plan), so ordering is for process simplicity, not a true dependency for Task 7.
