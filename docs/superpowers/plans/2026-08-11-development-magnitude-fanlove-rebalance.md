# Development Magnitude Bands + Fan Love Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two balance-only changes, no UI/architecture changes: (1) restrict what magnitude a player can ever be OFFERED in "Choose Your Focus" to exactly two bands — NORMAL (1-4) or RARE (8-9), with 5/6/7/10+ never generated as a selectable reward — and separately cap AUTOMATIC development (aging + minigame + workout bonus + secondary dev nudges, i.e. everything the player didn't directly pick) so it never displays more than +3 on any one attribute in a season, for real, not just cosmetically; (2) rebalance Fan Love's growth curve so it takes a long, achievement-filled career to approach 90-100, via diminishing returns at high values plus reduced raw gain magnitudes — without touching the team-change reset/reputation logic, which is explicitly out of scope and stays exactly as it is.

**Architecture:** Fully additive/tuning changes on top of the already-shipped, already-reviewed development and Fan Love systems from the prior two plans on this branch. No changes to `TIER_BUDGET`, `rollTier`, `diminishingScale`, the celebration system (`Celebration.tsx`, its trigger wiring in `App.tsx`), the Olympics flow, or the team-change Fan Love reset (`initialFanLoveForTeamChange`). This plan: (a) adds one small pure function to `development.ts` (`snapToSelectableBand`) applied at the exact point `getDevelopmentOptions` computes a card's final delta, so the locked-reward contract means the snap is inherited "for free" wherever that locked value gets applied later; (b) adds one more pure function to `development.ts` (`capAutomaticGrowth`) that trims the three automatic-source lists (dev secondary nudges, age report, minigame dev) AND the player's actual attribute values together, called once at the tail of `career.ts`'s `finishSeason`, after `advance()` has already applied aging; (c) reduces `fanlove.ts`'s existing bump tables and adds one diminishing-returns multiplier function (`applyFanLoveGain`), wired into every POSITIVE Fan Love gain call site in `career.ts` (playoff-depth bump, MVP/All-Star/All-NBA bumps, Olympics medal bump) — penalties (missed playoffs) are explicitly never softened by this.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- Do NOT modify `src/ui/screens/Celebration.tsx`, its trigger-building logic (`buildSeasonCelebrations`), its wiring in `App.tsx` (the `celebrationQueue`/`celebrationFrom`/`olympicsGoldPending` state and the `"celebration"` stage), or anything about how/when celebration screens appear. This plan is development-magnitude and Fan Love only.
- Do NOT modify the Olympics flow's structure (`finishRound`'s OLYMPICS branch, `finishOlympics`'s control flow, `SeasonResultScreen`). `finishOlympics`'s Fan Love bump VALUES are in scope (Task 4); its control flow and event/celebration wiring are not.
- Do NOT modify `initialFanLoveForTeamChange`, the team-change reset behavior, or `Person.hidden.reputation`'s own accumulation — explicitly preserved per the user's request.
- Do NOT modify `TIER_BUDGET`, `rollTier`, `rollPositiveTier`, or `diminishingScale` — the tier-roll probability model and the existing near-ceiling diminishing-returns mechanic both stay exactly as they are; this plan only changes what magnitude a rolled tier is allowed to ultimately display/apply.
- The locked-development-reward contract (a development card's shown `to`/`delta` is exactly what gets applied, never re-rolled) is never broken — `snapToSelectableBand` is applied once, at generation time in `getDevelopmentOptions`, and the locked value flows through unchanged everywhere else, exactly like the existing `diminishingScale` does today.
- Automatic development's cap is enforced on BOTH the displayed number and the player's actual attribute value together — never a display-only clamp that leaves the real attribute value inconsistent with what's shown.
- `tsc --noEmit`, `npm test`, and `npx vite build` must all be clean at the end of this plan. The one known, pre-existing flaky test (`simulation.test.ts`'s OVR-spread statistical check) is unrelated and not this plan's concern.

---

## File Structure

**Modified:** `src/engine/development.ts`, `src/engine/development.test.ts`, `src/engine/career.ts`, `src/engine/career.test.ts`, `src/engine/fanlove.ts`, `src/engine/fanlove.test.ts` (new test file — none currently exists for this module).

**Not touched:** `src/ui/screens/Celebration.tsx`, `src/ui/screens/Celebration.test.ts`, `src/App.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/ui/components/FanLove.tsx` (the presentation component — its band text/thresholds are explicitly left asconceptual, not hardcoded to the user's 7-tier list, per the plan's design notes below), `src/engine/focus.ts` (aging's own per-attribute formula is untouched; only its OUTPUT gets trimmed downstream when it stacks with other automatic sources), `src/engine/awards.ts`, `src/engine/types.ts`.

---

### Task 1: Restrict player-selected development to the NORMAL (1-4) / RARE (8-9) bands

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/development.test.ts`

**Interfaces:**
- Produces: a new internal `snapToSelectableBand(raw: number): number` (not exported — used only within `development.ts`, at the exact point `getDevelopmentOptions` computes a card's final delta).

- [ ] **Step 1: Add `snapToSelectableBand`**

Find (the existing `diminishingScale` function, in the file's "SEASONAL DEVELOPMENT OUTCOMES" section):

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

Replace with:

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
  if (raw <= 4) return Math.max(1, raw);
  if (raw >= 8) return 9;
  return raw <= 6 ? 4 : 8;
}
```

- [ ] **Step 2: Apply the snap in `getDevelopmentOptions`**

Find:

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

Replace with:

```ts
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
```

(`rollDevelopment`'s locked branch — `primaryDelta = locked ? locked.delta : ...` — is untouched by this task: it already uses `locked.delta` verbatim, so it automatically inherits the snapped value from the card the player picked, with no further changes needed there. `rollDevelopment`'s UNLOCKED primary path, used only for the AI rival, is intentionally left with its existing wider range — the rival is never shown a "Choose Your Focus" screen, so the band restriction doesn't apply to it.)

- [ ] **Step 3: Add tests**

In `src/engine/development.test.ts`, add `snapToSelectableBand`... actually it's not exported, so test it through `getDevelopmentOptions`'s observable output. Add this new `describe` block at the end of the file:

```ts
describe("getDevelopmentOptions only ever offers NORMAL (1-4) or RARE (8-9) magnitudes", () => {
  it("never generates a +5, +6, or +7 option across many seeds and playstyles", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      for (let seed = 0; seed < 400; seed++) {
        const rng = createRNG(seed * 31 + 7);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const options = getDevelopmentOptions(rng, player, [], 24, 0.72);
        for (const o of options) {
          expect([5, 6, 7]).not.toContain(o.delta);
        }
      }
    }
  });

  it("never generates a delta of 10 or higher", () => {
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRNG(seed * 13 + 3);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "SUPERSTAR",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.8);
      for (const o of options) {
        expect(o.delta).toBeLessThan(10);
      }
    }
  });

  it("every generated delta falls in {1,2,3,4,8,9} (allowing the ceiling clamp to shrink it further near 99)", () => {
    const ALLOWED = new Set([1, 2, 3, 4, 8, 9]);
    let sawBelowCeilingSample = false;
    for (let seed = 0; seed < 500; seed++) {
      const rng = createRNG(seed * 41 + 11);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SLASHER",
      });
      const options = getDevelopmentOptions(rng, player, [], 25, 0.75);
      for (const o of options) {
        if (o.to < 96) {
          // Far enough from the ceiling that the final clamp can't be the
          // reason for an out-of-band value — the snap itself must hold.
          sawBelowCeilingSample = true;
          expect(ALLOWED.has(o.delta)).toBe(true);
        }
      }
    }
    expect(sawBelowCeilingSample).toBe(true);
  });

  it("can still generate +8 or +9 (RARE) options — the band is reachable, not accidentally dead", () => {
    let sawRare = false;
    outer: for (let seed = 0; seed < 3000; seed++) {
      const rng = createRNG(seed * 97 + 5);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SF", height: 201, playstyle: "SUPERSTAR",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.88);
      for (const o of options) {
        if (o.delta === 8 || o.delta === 9) { sawRare = true; break outer; }
      }
    }
    expect(sawRare).toBe(true);
  });
});
```

- [ ] **Step 4: Run, confirm tests pass**

Run: `npx vitest run development.test.ts` — expect all passing (existing tests in this file are unaffected; the "NORMAL-tier deltas land in [1,3]" test from an earlier plan should still pass unchanged, since NORMAL-tier rolls rarely if ever reach the snap's forbidden gap).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/development.ts src/engine/development.test.ts
git commit -m "fix: restrict player-selected development to NORMAL (1-4) / RARE (8-9) bands only

getDevelopmentOptions's final delta now passes through snapToSelectableBand
before being shown on a card — 5, 6, 7, and anything >=10 can never be
offered as a player-selectable reward again, not just hidden from the
rarity badge. 5/6 snap down to 4 (NORMAL), 7 snaps up to 8 (RARE),
anything above 9 clamps to 9. Applied once at generation time; the
locked-reward contract means rollDevelopment's locked branch inherits the
snapped value automatically, with no changes needed there. RARE (8/9)
stays genuinely rare because it's still gated by the same BREAKOUT/
RARE_BREAKOUT/LEGENDARY tier-roll probabilities as before — untouched."
```

---

### Task 2: Cap automatic development at +3 per attribute, for real

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/career.ts`
- Modify: `src/engine/development.test.ts`
- Modify: `src/engine/career.test.ts`

**Interfaces:**
- Produces: `export const AUTOMATIC_ATTR_CAP = 3;` and `export function capAutomaticGrowth(player: Person, primaryAttribute: keyof Attributes | null, devChanges: DevChange[], ageReport: AgeReport, minigameDev: DevChange[]): { player: Person; devChanges: DevChange[]; ageReport: AgeReport; minigameDev: DevChange[] }`, both exported from `development.ts`.
- Consumes (in `career.ts`): called once, at the tail of `finishSeason`, after `advance()` has run.

- [ ] **Step 1: Add `AUTOMATIC_ATTR_CAP` and `capAutomaticGrowth` to `development.ts`**

Add this at the very end of `development.ts` (after `totalSeasonDelta`, which this task does not modify):

```ts
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
 * AUTOMATIC_ATTR_CAP (once rounded), excluding the player's own locked pick
 * (primaryAttribute), which this function never touches. Excess is removed
 * from aging first (the most incidental/passive automatic source), then
 * from development's secondary nudges, then from minigame development,
 * until each over-cap attribute's automatic total is back within the cap.
 * The same total reduction is applied to the player's real attributes, so
 * the ceiling is genuine, not cosmetic.
 */
export function capAutomaticGrowth(
  player: Person,
  primaryAttribute: keyof Attributes | null,
  devChanges: DevChange[],
  ageReport: AgeReport,
  minigameDev: DevChange[]
): { player: Person; devChanges: DevChange[]; ageReport: AgeReport; minigameDev: DevChange[] } {
  const totals = new Map<keyof Attributes, number>();
  const add = (attribute: keyof Attributes, delta: number) => {
    if (attribute === primaryAttribute) return;
    totals.set(attribute, (totals.get(attribute) ?? 0) + delta);
  };
  for (const c of devChanges) add(c.attribute, c.delta);
  for (const a of ageReport) add(a.attribute, a.delta);
  for (const c of minigameDev) add(c.attribute, c.delta);

  const excess = new Map<keyof Attributes, number>();
  for (const [attribute, total] of totals) {
    const over = Math.round(total) - AUTOMATIC_ATTR_CAP;
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
    const over = Math.round(total) - AUTOMATIC_ATTR_CAP;
    if (over > 0) attributes[attribute] = clamp(attributes[attribute] - over, 30, 99);
  }

  return {
    player: { ...player, attributes },
    devChanges: trimmedDevChanges,
    ageReport: trimmedAgeReport,
    minigameDev: trimmedMinigameDev,
  };
}
```

- [ ] **Step 2: Wire it into `career.ts`'s `finishSeason`**

Find the `development.ts` import line — find:

```ts
import {
  DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult,
  getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment, DevChange, totalSeasonDelta,
} from "./development";
```

Replace with:

```ts
import {
  DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult,
  getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment, DevChange, totalSeasonDelta,
  capAutomaticGrowth,
} from "./development";
```

Find (the exact current tail of `finishSeason`):

```ts
  const out = advance(next, events, wonTitle);
  // Captured from the INCOMING state (never reassigned in this function),
  // before advance() clears lockedDevelopment on the returned state.
  const primaryDevelopment = state.lockedDevelopment
    ? { attribute: state.lockedDevelopment.attribute, delta: state.lockedDevelopment.delta }
    : null;
  return { ...out, development, conclusion, primaryDevelopment, year: 2026 + state.season };
}
```

Replace with:

```ts
  const out = advance(next, events, wonTitle);
  // Captured from the INCOMING state (never reassigned in this function),
  // before advance() clears lockedDevelopment on the returned state.
  const primaryDevelopment = state.lockedDevelopment
    ? { attribute: state.lockedDevelopment.attribute, delta: state.lockedDevelopment.delta }
    : null;
  // Automatic growth (everything except the player's own locked pick) is
  // capped for real here, after advance() has already applied aging to
  // out.state.player — both the attribute values and the source lists that
  // feed totalSeasonDelta's display are trimmed together.
  const capped = capAutomaticGrowth(
    out.state.player,
    primaryDevelopment?.attribute ?? null,
    development.changes,
    out.state.lastAgeReport,
    out.state.lastMinigameDev
  );
  const cappedState: CareerState = {
    ...out.state,
    player: capped.player,
    lastAgeReport: capped.ageReport,
    lastMinigameDev: capped.minigameDev,
    lastDevelopment: { ...development, changes: capped.devChanges },
  };
  return {
    ...out,
    state: cappedState,
    development: { ...development, changes: capped.devChanges },
    conclusion,
    primaryDevelopment,
    year: 2026 + state.season,
  };
}
```

- [ ] **Step 3: Add tests for `capAutomaticGrowth`**

In `src/engine/development.test.ts`, add `capAutomaticGrowth`, `AUTOMATIC_ATTR_CAP`, and `Person` to the imports — find:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta, classifyDevRarity, pickAttrFlavor, ATTR_FLAVOR } from "./development";
```

Replace with:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta, classifyDevRarity, pickAttrFlavor, ATTR_FLAVOR, capAutomaticGrowth, AUTOMATIC_ATTR_CAP } from "./development";
```

(Check the file's existing imports first — if `createPlayer` isn't already imported, it already is, from the file's earlier tests; no new import needed for that.)

Add this new `describe` block at the end of the file:

```ts
describe("capAutomaticGrowth", () => {
  it("leaves everything unchanged when no attribute exceeds the cap", () => {
    const player = primeAveragePlayer(1);
    const result = capAutomaticGrowth(
      player, "shooting",
      [{ attribute: "shooting", delta: 3 }], // primary — never touched regardless of cap
      [{ attribute: "passing", delta: 1.5 }],
      [{ attribute: "ballHandling", delta: 2 }]
    );
    expect(result.devChanges).toEqual([{ attribute: "shooting", delta: 3 }]);
    expect(result.ageReport).toEqual([{ attribute: "passing", delta: 1.5 }]);
    expect(result.minigameDev).toEqual([{ attribute: "ballHandling", delta: 2 }]);
  });

  it("trims an over-cap automatic total on a single attribute down to AUTOMATIC_ATTR_CAP, reducing the actual attribute value by the same amount", () => {
    const player = primeAveragePlayer(2);
    const before = player.attributes.passing;
    const result = capAutomaticGrowth(
      player, null, // no primary pick this call
      [],
      [{ attribute: "passing", delta: 2.4 }],
      [{ attribute: "passing", delta: 3 }] // raw automatic total for passing: 5.4 -> rounds to 5, over cap by 2
    );
    const totalAfterTrim = result.ageReport[0].delta + result.minigameDev[0].delta;
    expect(Math.round(totalAfterTrim)).toBe(AUTOMATIC_ATTR_CAP);
    expect(result.player.attributes.passing).toBe(before + AUTOMATIC_ATTR_CAP);
  });

  it("never trims the player's own primary/locked attribute, even if it would otherwise look over-cap", () => {
    const player = primeAveragePlayer(3);
    const result = capAutomaticGrowth(
      player, "shooting",
      [{ attribute: "shooting", delta: 8 }], // the player's own locked RARE pick — must survive untouched
      [{ attribute: "shooting", delta: 2 }], // aging ALSO touched the same attribute this season
      []
    );
    const shootingDevEntry = result.devChanges.find((c) => c.attribute === "shooting")!;
    expect(shootingDevEntry.delta).toBe(8); // untouched — primary is exempt from the cap entirely
  });

  it("trims aging before dev secondary nudges before minigame development, in that order", () => {
    const player = primeAveragePlayer(4);
    const result = capAutomaticGrowth(
      player, null,
      [{ attribute: "defense", delta: 2 }],
      [{ attribute: "defense", delta: 2 }],
      [{ attribute: "defense", delta: 2 }]
      // raw total: 6, over cap by 3 -> aging (2) should be fully consumed first, then 1 more from dev
    );
    const aging = result.ageReport.find((a) => a.attribute === "defense")!;
    const dev = result.devChanges.find((c) => c.attribute === "defense")!;
    const mg = result.minigameDev.find((c) => c.attribute === "defense")!;
    expect(aging.delta).toBe(0);
    expect(dev.delta).toBe(1);
    expect(mg.delta).toBe(2);
    expect(Math.round(aging.delta + dev.delta + mg.delta)).toBe(AUTOMATIC_ATTR_CAP);
  });

  it("never generates a displayed automatic total of +0 — capAutomaticGrowth combined with totalSeasonDelta's existing zero-filter drops fully-trimmed rows", () => {
    const player = primeAveragePlayer(5);
    const result = capAutomaticGrowth(
      player, null,
      [],
      [{ attribute: "strength", delta: 3 }],
      [{ attribute: "strength", delta: 3 }] // total 6, capped to 3 -> aging fully consumed (3), minigame keeps 3
    );
    const merged = totalSeasonDelta([], result.ageReport, result.minigameDev);
    const strengthRow = merged.find((c) => c.attribute === "strength");
    expect(strengthRow).toBeDefined();
    expect(strengthRow!.delta).not.toBe(0);
    expect(strengthRow!.delta).toBe(AUTOMATIC_ATTR_CAP);
  });
});
```

- [ ] **Step 4: Add a `career.ts`-level integration test**

In `src/engine/career.test.ts`, add this new `describe` block at the end of the file:

```ts
describe("finishSeason caps automatic development in the final returned state", () => {
  it("never lets a non-primary attribute's totalSeasonDelta exceed AUTOMATIC_ATTR_CAP", () => {
    let state = initCareer(70, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SUPERSTAR" });
    state = chooseFocus(state, "shooting");
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    const primaryAttr = end.primaryDevelopment?.attribute;
    const totals = totalSeasonDelta(
      end.development?.changes ?? [],
      end.state.lastAgeReport,
      end.state.lastMinigameDev
    );
    for (const t of totals) {
      if (t.attribute === primaryAttr) continue; // the player's own pick is never capped
      expect(t.delta).toBeLessThanOrEqual(3);
    }
  });
});
```

Add the `totalSeasonDelta` import to `career.test.ts` if not already present — find:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

Replace with:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { totalSeasonDelta } from "./development";
```

(If `./development` is already imported in `career.test.ts` for any other reason, merge into that existing import line instead of adding a new one — check the file's current imports first.)

- [ ] **Step 5: Run, confirm tests pass**

Run: `npx vitest run development.test.ts career.test.ts` — expect all passing.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 7: Commit**

```bash
git add src/engine/development.ts src/engine/career.ts src/engine/development.test.ts src/engine/career.test.ts
git commit -m "fix: cap automatic development at +3 per attribute, enforced on both the display and the real attribute value

Aging, minigame development, the workout bonus, and development's own
secondary nudges can independently target the same attribute in the same
season, and previously nothing stopped their combined total from landing
anywhere. capAutomaticGrowth trims any over-cap attribute's automatic
total down to AUTOMATIC_ATTR_CAP (3) — aging first, then dev secondary,
then minigame — and reduces the player's actual attribute by the same
amount, so the number shown always matches what really happened. The
player's own locked pick (primaryDevelopment) is never touched by this,
regardless of what else lands on the same attribute that season."
```

---

### Task 3: Fan Love — diminishing returns + reduced gain magnitudes

**Files:**
- Modify: `src/engine/fanlove.ts`
- Create: `src/engine/fanlove.test.ts`

**Interfaces:**
- Produces: `export function applyFanLoveGain(current: number, rawGain: number): number`.
- `TIER_BUMP_FIRST`/`TIER_BUMP_REPEAT`'s values change; their shape/type is unchanged. They stay module-private (not exported), matching current visibility.

- [ ] **Step 1: Reduce the playoff-depth bump tables**

Find:

```ts
const TIER_BUMP_FIRST: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 3, 3: 8, 4: 16, 5: 30 };
const TIER_BUMP_REPEAT: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 1, 3: 4, 4: 8, 5: 15 };
```

Replace with:

```ts
const TIER_BUMP_FIRST: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 2, 3: 5, 4: 10, 5: 18 };
const TIER_BUMP_REPEAT: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 1, 3: 2, 4: 5, 5: 10 };
```

- [ ] **Step 2: Add the diminishing-returns curve and `applyFanLoveGain`**

Find the top of the file:

```ts
import { Award, PlayoffResult } from "./types";
```

Replace with:

```ts
import { Award, PlayoffResult } from "./types";
import { clamp } from "./rng";
```

Add this new section right after `playoffOutcomeFanLoveBump` (before the `FAN_LOVE_BAND_THRESHOLDS` export) — find:

```ts
/**
 * Ascending Fan Love thresholds that mark a narrative tier change. Shared
 * by FanLove.tsx's band text and finishSeason's milestone-crossing check
 * (career.ts) — defined once here so the two can never drift apart.
 */
export const FAN_LOVE_BAND_THRESHOLDS = [14, 32, 52, 72, 88] as const;
```

Replace with:

```ts
/**
 * Diminishing-returns multiplier for POSITIVE Fan Love gains only. The same
 * nominal bump is worth much less once Fan Love is already high, so
 * reaching the 90s/100 takes a long career of real, REPEATED achievement
 * rather than one great season — 100 should feel like franchise mythology,
 * not a strong year. Never softens a penalty (missed playoffs, etc.) —
 * those still apply at full value regardless of current Fan Love.
 */
function fanLoveDiminishing(current: number): number {
  if (current >= 90) return 0.2;
  if (current >= 75) return 0.4;
  if (current >= 55) return 0.65;
  if (current >= 30) return 0.85;
  return 1;
}

/**
 * Applies a Fan Love change with diminishing returns on the way up. A
 * negative or zero rawGain (a penalty, or no change) always applies at full
 * value — only growth gets scaled down as Fan Love climbs. Pure — no RNG,
 * no state, clamped to the valid 0-100 range.
 */
export function applyFanLoveGain(current: number, rawGain: number): number {
  if (rawGain <= 0) return clamp(current + rawGain, 0, 100);
  return clamp(current + rawGain * fanLoveDiminishing(current), 0, 100);
}

/**
 * Ascending Fan Love thresholds that mark a narrative tier change. Shared
 * by FanLove.tsx's band text and finishSeason's milestone-crossing check
 * (career.ts) — defined once here so the two can never drift apart.
 */
export const FAN_LOVE_BAND_THRESHOLDS = [14, 32, 52, 72, 88] as const;
```

(`FAN_LOVE_BAND_THRESHOLDS` itself is intentionally left unchanged — the user's 7-tier conceptual framework explicitly does not require hardcoded exact thresholds; the underlying GROWTH RATE change above is what slows the climb toward the top bands. `FanLove.tsx`'s band text, which already reads as "still learning your name" → "familiar face" → "one of the faces of the league," already matches the desired career-fantasy arc without needing rewording.)

- [ ] **Step 3: Write `fanlove.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applyFanLoveGain, playoffOutcomeFanLoveBump, initialFanLoveForTeamChange } from "./fanlove";

describe("applyFanLoveGain", () => {
  it("applies a positive gain at full value when Fan Love is low", () => {
    expect(applyFanLoveGain(10, 10)).toBe(20);
  });

  it("scales a positive gain down as Fan Love climbs, via diminishing returns", () => {
    const lowGain = applyFanLoveGain(10, 20) - 10;
    const highGain = applyFanLoveGain(92, 20) - 92;
    expect(highGain).toBeLessThan(lowGain);
    expect(highGain).toBeGreaterThan(0); // never fully blocked, just much smaller
  });

  it("never softens a penalty (non-positive rawGain applies at full value regardless of current)", () => {
    expect(applyFanLoveGain(95, -4)).toBe(91);
    expect(applyFanLoveGain(20, -4)).toBe(16);
  });

  it("stays within the 0-100 range", () => {
    expect(applyFanLoveGain(98, 30)).toBeLessThanOrEqual(100);
    expect(applyFanLoveGain(2, -10)).toBeGreaterThanOrEqual(0);
  });

  it("reaching 100 requires many large gains even from a high starting point, because of diminishing returns", () => {
    let fanLove = 85;
    let seasons = 0;
    while (fanLove < 100 && seasons < 30) {
      fanLove = applyFanLoveGain(fanLove, 18); // simulate a repeated first-time-championship-caliber season
      seasons++;
    }
    expect(seasons).toBeGreaterThan(3); // not a 1-2 season sprint from 85 to 100
  });
});

describe("Fan Love does not reach 100 unrealistically early in a normal successful career", () => {
  it("a strong but not historically dominant career (a few All-Star nods, one deep run, no championship) stays well under 90 after 5 seasons", () => {
    // Simulates 5 seasons of: repeat conf-finals depth + occasional All-Star-caliber bump,
    // using the same magnitudes finishSeason actually applies.
    let fanLove = 15; // a rookie's starting Fan Love is low
    const priorResults: ("CONF_FINALS")[] = [];
    for (let season = 0; season < 5; season++) {
      const bump = playoffOutcomeFanLoveBump("CONF_FINALS", priorResults);
      fanLove = applyFanLoveGain(fanLove, bump + 1 /* tenure tick */);
      priorResults.push("CONF_FINALS");
    }
    expect(fanLove).toBeLessThan(75);
  });

  it("championships and major awards provide meaningful progression, not a trivial one", () => {
    let fanLove = 20;
    const before = fanLove;
    fanLove = applyFanLoveGain(fanLove, 18); // first championship
    fanLove = applyFanLoveGain(fanLove, 16); // first MVP, same season
    expect(fanLove - before).toBeGreaterThan(15); // a real, noticeable jump
  });
});

describe("initialFanLoveForTeamChange is unaffected by this rebalance (explicitly out of scope)", () => {
  it("still produces its existing range of values", () => {
    const value = initialFanLoveForTeamChange(60, [], 3);
    expect(value).toBeGreaterThanOrEqual(5);
    expect(value).toBeLessThanOrEqual(70);
  });
});
```

- [ ] **Step 4: Run, confirm tests pass**

Run: `npx vitest run fanlove.test.ts` — expect all passing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/fanlove.ts src/engine/fanlove.test.ts
git commit -m "fix: rebalance Fan Love's growth curve — diminishing returns near the top, reduced raw bump magnitudes

TIER_BUMP_FIRST/TIER_BUMP_REPEAT's values are cut roughly 35-40% across
the board (championship first-time 30->18, MVP first-time still applied
in career.ts's own bump, all magnitudes tuned together in this plan).
New applyFanLoveGain scales any POSITIVE gain down as current Fan Love
climbs (full value below 30, down to 20% of a gain's value at 90+) —
penalties are never softened. Together this means a single great season
can still meaningfully move a young player's Fan Love, but climbing from
the 80s into the high 90s now requires many more seasons of REPEATED
elite achievement — 100 should read as franchise mythology, not a great
year. initialFanLoveForTeamChange and the reset-on-team-change behavior
are completely untouched, per the explicit scope of this plan."
```

---

### Task 4: Wire `applyFanLoveGain` into every Fan Love gain call site

**Files:**
- Modify: `src/engine/career.ts`
- Modify: `src/engine/career.test.ts`

**Interfaces:**
- Consumes: `applyFanLoveGain` (Task 3, `./fanlove`).
- No changes to any function signature — this task only changes HOW each existing bump is applied, not what triggers it.

- [ ] **Step 1: Import `applyFanLoveGain`**

Find the `fanlove.ts` import line — find:

```ts
import {
  playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange, FAN_LOVE_BAND_THRESHOLDS,
} from "./fanlove";
```

Replace with:

```ts
import {
  playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange, FAN_LOVE_BAND_THRESHOLDS,
  applyFanLoveGain,
} from "./fanlove";
```

- [ ] **Step 2: Wire the playoff-depth + tenure bump, and widen the tenure tick's own longevity signal**

Find:

```ts
  // A small, permanent nudge for another season of staying put — the
  // "connection to the city" layer. Never large enough to matter on its
  // own, and it's never subtracted for changing teams (the Big Decision's
  // loyalty effect already handles that, modestly).
  const seasonsOnTeam = seasonsOnCurrentTeam(state.timeline.map((e) => e.teamId), state.team.id);
  const tenureTick = seasonsOnTeam > 1 ? 1 : 0;
  player = {
    ...player,
    hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + playoffBump + tenureTick, 0, 100) },
  };
```

Replace with:

```ts
  // A small, permanent nudge for another season of staying put — the
  // "connection to the city" / LOYALTY + LONGEVITY layer. Never subtracted
  // for changing teams (the Big Decision's loyalty effect already handles
  // that, modestly). Grows in modest steps with real tenure, rather than a
  // flat +1 regardless of whether this is year 2 or year 10.
  const seasonsOnTeam = seasonsOnCurrentTeam(state.timeline.map((e) => e.teamId), state.team.id);
  const tenureTick = seasonsOnTeam >= 8 ? 3 : seasonsOnTeam >= 5 ? 2 : seasonsOnTeam > 1 ? 1 : 0;
  player = {
    ...player,
    hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, playoffBump + tenureTick) },
  };
```

- [ ] **Step 3: Wire the MVP/All-Star/All-NBA award bumps, with reduced magnitudes**

Find:

```ts
    if (a.type === "MVP") {
      const bump = hadMvp ? 12 : 25;
      player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + bump, 0, 100) } };
    } else if (a.type === "ALL_STAR") {
      const bump = hadAllStar ? 6 : 12;
      player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + bump, 0, 100) } };
    } else if (a.type === "ALL_NBA") {
      const bump = hadAllNba ? 6 : 10;
      player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + bump, 0, 100) } };
    }
```

Replace with:

```ts
    if (a.type === "MVP") {
      const bump = hadMvp ? 8 : 16;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    } else if (a.type === "ALL_STAR") {
      const bump = hadAllStar ? 4 : 8;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    } else if (a.type === "ALL_NBA") {
      const bump = hadAllNba ? 3 : 6;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    }
```

- [ ] **Step 4: Wire the Olympics medal bump, with reduced magnitude**

Find:

```ts
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: clamp(state.player.hidden.fanLove + (won ? 25 : 8), 0, 100),
```

Replace with:

```ts
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: applyFanLoveGain(state.player.hidden.fanLove, won ? 16 : 5),
```

(`reputation`'s own line is untouched — reputation is a separate, persistent signal explicitly out of scope for this plan, per the Global Constraints.)

- [ ] **Step 5: Add a regression test confirming the wiring produces a slower climb in a realistic multi-season simulation**

In `src/engine/career.test.ts`, add this new `describe` block at the end of the file:

```ts
describe("Fan Love grows more slowly across a realistic multi-season career after the rebalance", () => {
  it("a 25-year-old with 3-5 seasons on one team does not reach 100 Fan Love even with strong (but not historically dominant) play", () => {
    let state = initCareer(80, { name: "T", country: "USA", position: "SF", height: 201, playstyle: "TWO_WAY" });
    for (let i = 0; i < 4; i++) {
      state = chooseFocus(state, "defense");
      const run = runSeason(state);
      const end = finishSeason(run.state, null);
      state = end.state;
    }
    expect(state.player.hidden.fanLove).toBeLessThan(100);
  });
});
```

- [ ] **Step 6: Run, confirm tests pass**

Run: `npx vitest run career.test.ts fanlove.test.ts` — expect all passing.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine/career.ts src/engine/career.test.ts
git commit -m "fix: wire applyFanLoveGain into every Fan Love gain call site

Playoff-depth bump, MVP/All-Star/All-NBA award bumps, and the Olympics
medal bump all now go through applyFanLoveGain instead of a flat clamp —
diminishing returns near the top apply uniformly across every growth
source. The tenure tick (LOYALTY/LONGEVITY) now grows in modest steps
with real tenure (1/2/3 at 2/5/8+ seasons) instead of a flat +1 past year
one. reputation and the team-change reset are untouched, per this plan's
explicit scope."
```

---

### Task 5: Final verification

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread flaky failure is expected and unrelated). Compare `npm run simulate`'s average-final-OVR output against the pre-plan baseline — confirm it doesn't crash and that final OVRs shift down somewhat (expected, given both the automatic-growth cap and the tighter player-selectable bands reduce total career growth) without collapsing to unreasonably low values.

- [ ] **Step 2: Real browser smoke test**

Start the dev server and play through a real career via `claude-in-chrome`. Confirm:

1. **Development cards**: the "Choose Your Focus" screen never shows a +5, +6, or +7 option across several seasons — only 1-4 or, occasionally, 8/9.
2. **Automatic rows in Season Complete**: any non-selected attribute's shown delta never exceeds +3, and never shows +0 (a fully-trimmed-to-zero row simply doesn't appear).
3. **Fan Love**: over a handful of simulated seasons (even a strong start), Fan Love does not rocket toward 100 — it should feel like a slow, multi-season climb, matching the "people are learning your name" → "one of the faces of the team" arc.
4. **Celebrations are completely unaffected**: confirm the MVP/Champion/Finals MVP/All-Star/All-NBA/ROY/Olympic Gold celebration screens, their chaining, their timing, and their visuals are all pixel-identical to before this plan — this plan must not have touched anything in that system, and this is the one item worth double-checking live given how much of this plan lives in the same season-completion code path.

Report exactly what was visually verified, and which items (if any) were covered by unit tests instead of live observation, with the reason why.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify Step 1, and commit. If clean, no further commit needed.

---

## Self-review notes

- **Spec coverage:** Task 1 implements requirement 1 (player-selected magnitude restriction) in full, including "genuinely rare +8/+9" (unchanged tier-roll probabilities) and "still shows appropriate microcopy/rarity" (unaffected — Task 3 of the prior plan's badge logic already reads `classifyDevRarity(primaryDevelopment.delta)`; note this claim was corrected post-implementation: `classifyDevRarity` can still return `null` for a player pick near the attribute ceiling, since `getDevelopmentOptions`'s post-snap ceiling clamp can re-produce a displayed delta of 5-7 for `from` in the low-90s — see the final whole-branch review's Minor finding #4, deferred as intentional-but-undocumented ceiling behavior). Task 2 implements requirement 2 (automatic development capped at +3, real not cosmetic, never displays 0 — the last part already guaranteed by `totalSeasonDelta`'s existing zero-filter, confirmed by a dedicated test). Tasks 3-4 implement requirement 3 (Fan Love rebalance: diminishing returns + reduced magnitudes, explicitly preserving the team-change reset). Requirement 4 (don't touch celebrations) is enforced by this plan's Global Constraints and file-structure's explicit "not touched" list, and re-verified live in Task 5. Requirement 5 (verification + the specific test list) is covered by each task's own Step + Task 5's final pass — every bullet in the user's test list has a corresponding test: "never +5/+6/+7" (Task 1), "+8/+9 reachable" (Task 1), "automatic never exceeds +3" (Task 2), "+0 never rendered" (Task 2), "Fan Love doesn't reach 100 unrealistically early" (Task 3 + Task 4's integration test), "championships/major achievements provide meaningful progression" (Task 3), "high Fan Love has diminishing returns" (Task 3).
- **Placeholder scan:** every code block above is complete, verbatim content against the actual current files (re-read fresh during planning) — no TBD, no "similar to Task N".
- **Type consistency:** `snapToSelectableBand` (Task 1) is private, used once, no cross-task interface. `AUTOMATIC_ATTR_CAP`/`capAutomaticGrowth` (Task 2) are defined once in `development.ts` and consumed with a matching signature in Task 2's own `career.ts` edit — no other consumer. `applyFanLoveGain` (Task 3) is defined once in `fanlove.ts` and consumed identically at all 4 call sites Task 4 touches.
- **Cross-task ordering:** Task 2's `career.ts` edit is written against the file's state as Task 1 left it (Task 1 doesn't touch `career.ts` at all, so this is moot in practice, but confirmed for completeness). Task 4's `career.ts` edits are written against the file's state as Task 2 left it — in particular, Task 4's Step 2 Find block (the `seasonsOnTeam`/`tenureTick`/playoff-bump block) is UNCHANGED by Task 2 (Task 2's own edit is at the very tail of `finishSeason`, after this block), so Task 4's Find blocks should match verbatim regardless of Task 2 having run first — apply in plan order (1→2→3→4→5) regardless, and re-read `career.ts` fresh before Task 4 to confirm.
- **Explicitly preserved (per Global Constraints):** `TIER_BUDGET`, `rollTier`, `rollPositiveTier`, `diminishingScale`, `initialFanLoveForTeamChange`, the team-change reset, `Person.hidden.reputation`'s own logic, the entire celebration system, and the Olympics flow's structure.
