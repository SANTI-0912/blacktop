# Development Rarity + Grand Celebration Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two presentation-layer additions on top of the already-shipped development/balance system: (1) Season Complete's development list gets short, varied microcopy and a NORMAL/RARE rarity badge — but ONLY for the one attribute the player explicitly picked in "Choose Your Focus" that season, never for aging/minigame/workout deltas, which keep displaying plainly; (2) a new full-screen "grand celebration" reveal for the handful of season-defining awards (NBA MVP, NBA/NCAA Champion, Finals MVP, All-Star, All-NBA, Rookie of the Year, Olympic Gold), chained when a season earns several, integrated into both the normal season flow and the existing Olympics flow without adding a second result screen anywhere.

**Architecture:** No changes to `TIER_BUDGET`, `rollDevelopment`, `rollSeasonAwards`, Fan Love, or any RNG/balance logic. This plan is additive: (a) `development.ts` gains two small pure functions (`classifyDevRarity`, `pickAttrFlavor`) and `ATTR_FLAVOR` changes shape from one string per attribute to a short pool per attribute; (b) `career.ts`'s `finishSeason` captures two values it already computes but currently discards (`state.lockedDevelopment` before `advance()` clears it, and the real calendar year via the same `2026 + season` formula already used for the draft class) onto `SeasonEnd`, and `finishOlympics` gains the same `year` field; (c) a new `src/ui/screens/Celebration.tsx` owns the celebration copy table, the pure queue-building function, and the screen component, reusing `Shell.tsx`'s existing primitives and the `.rise` animation — no new architecture, no new award system; (d) `App.tsx` gains one new `"celebration"` stage fed by two independent, narrow trigger points (after `SeasonComplete`, after Olympics' own `SeasonResultScreen`) that both funnel into the same queue/component, structurally incapable of firing on the Olympics path before its own result screen has shown, so the "two result screens" bug class cannot reoccur.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- No changes to `TIER_BUDGET`, `diminishingScale`, `rollDevelopment`, `rollTier`, `applyWorkout`'s bonus logic, `rollSeasonAwards`'s thresholds, or Fan Love (`fanlove.ts`, `FanLove.tsx`).
- The rarity/microcopy treatment (Task 1) applies ONLY to the row whose attribute matches the season's `primaryDevelopment` (the card the player picked in "Choose Your Focus") — every other row (aging-only, minigame-only, workout-bonus-only, or the primary attribute's row when its own locked delta doesn't classify) always displays its plain merged number, exactly as today, with no badge and no microcopy.
- Rarity has exactly two categories: NORMAL (locked delta 1-4) and RARE (locked delta 8-9). There is no LEGENDARY category. A locked delta of 5, 6, 7, or 10+ gets neither category — the row still shows its plain number, just without the badge/microcopy overlay.
- No new award types are invented. The `Award` union in `types.ts` is untouched. Celebration triggers read only what already exists: `conclusion.awards` (from `rollSeasonAwards`, already computed), the existing `MILESTONE_FLAGS.CHAMPIONSHIP` event flag (for the NCAA-championship case, which never produces a `CHAMPION` award), and the existing `"olympic_gold"` event flag from `finishOlympics`.
- Celebration screens use the real calendar year (`2026 + season`, the exact formula already used for the draft class in `advance()`), never "Season N" — every other screen keeps "Season N" unchanged.
- The Olympics flow (`finishRound`'s OLYMPICS branch → `finishOlympics` → `stage: "result"` → `SeasonResultScreen` → `afterResult`) is not restructured. A celebration can only be reached AFTER `SeasonResultScreen` has already rendered, via `afterResult`, using a boolean flag set once at the exact moment gold is confirmed and consumed (cleared) the instant it's read — never inferred from stale array contents.
- Celebration copy is written in English, matching the rest of the game's UI language (every existing screen — Season Complete, Career Hub, Fan Love, Draft, Olympics — is English-only; there is no precedent for Spanish-language UI text anywhere in the codebase).
- Icons stay intentional, not decorative spam: one icon per celebration screen (the award's own icon), reused from the existing `AWARD_ICON` assignments where a 1:1 mapping exists.
- `tsc --noEmit`, `npm test`, and `npx vite build` must all be clean at the end of this plan. The one known, already-reported, pre-existing flaky test (`simulation.test.ts`'s OVR-spread statistical check) is unrelated and not this plan's concern.

---

## File Structure

**Modified:** `src/engine/development.ts`, `src/engine/development.test.ts`, `src/engine/career.ts`, `src/engine/career.test.ts`, `src/ui/screens/SeasonComplete.tsx`, `src/App.tsx`, `tailwind.config.js`, `src/styles.css`.

**Created:** `src/ui/screens/Celebration.tsx`, `src/ui/screens/Celebration.test.ts`.

**Not touched:** `src/engine/awards.ts`, `src/engine/types.ts` (the `Award` union), `src/engine/fanlove.ts`, `src/ui/components/FanLove.tsx`, `src/ui/components/Shell.tsx`, `src/ui/screens/SeasonFlow.tsx`, `src/ui/screens/CareerHub.tsx`, `src/engine/history.ts`.

---

### Task 1: Development rarity classification + microcopy pools (pure functions)

**Files:**
- Modify: `src/engine/development.ts`
- Modify: `src/engine/development.test.ts`

**Interfaces:**
- Produces: `export type DevRarity = "NORMAL" | "RARE";`, `export function classifyDevRarity(delta: number): DevRarity | null`, `export function pickAttrFlavor(attribute: keyof Attributes, season: number): string`.
- `ATTR_FLAVOR`'s exported shape changes from `Record<keyof Attributes, string>` to `Record<keyof Attributes, string[]>` — its only consumer (`SeasonComplete.tsx`) is updated in Task 3, in the same plan, so this is not a breaking change left dangling.

- [ ] **Step 1: Replace `ATTR_FLAVOR` with short per-attribute pools**

Find (the current single-sentence table, too long for the new "one short line" requirement):

```ts
/** A short, concrete sentence explaining WHY this attribute's growth felt like
 * part of the season — shown alongside the exact +delta in Season Complete. */
export const ATTR_FLAVOR: Record<keyof Attributes, string> = {
  shooting: "Repetition became routine. Your release started looking more natural, even with a hand in your face.",
  finishing: "You started finishing plays that used to end in a contested miss — the touch around the rim just got more consistent.",
  passing: "You spent the year making quicker reads and trusting the pass earlier. The improvement started showing when the game slowed down around you.",
  ballHandling: "The ball stopped being something you had to think about. It just moved with you now, even under real pressure.",
  defense: "Your positioning got sharper, and the little mistakes that used to cost you a half-step stopped happening.",
  athleticism: "You're moving differently — first step, recovery speed, the whole package got noticeably faster this year.",
  strength: "The physical part of the game stopped being a problem. You're holding your ground in spaces that used to push you out.",
  basketballIQ: "The game slowed down for you this season. You started seeing plays develop a beat before everyone else did.",
  clutch: "Late-game situations stopped feeling like moments to survive. You started actually wanting the ball there.",
};
```

Replace with:

```ts
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
```

- [ ] **Step 2: Run, confirm the file still compiles in isolation**

Run: `npx tsc --noEmit` — this WILL show errors in `SeasonComplete.tsx` at this point (its old `ATTR_FLAVOR[c.attribute]` usage now returns a `string[]`, not a `string`) — that's expected and fixed in Task 3. Confirm the errors are confined to `SeasonComplete.tsx` and that `development.ts` itself has no errors.

- [ ] **Step 3: Add tests**

In `src/engine/development.test.ts`, add `classifyDevRarity` and `pickAttrFlavor` to the existing import line — find:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta } from "./development";
```

Replace with:

```ts
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta, classifyDevRarity, pickAttrFlavor, ATTR_FLAVOR } from "./development";
```

Add this new `describe` block at the end of the file:

```ts
describe("classifyDevRarity", () => {
  it("classifies 1-4 as NORMAL", () => {
    expect(classifyDevRarity(1)).toBe("NORMAL");
    expect(classifyDevRarity(2)).toBe("NORMAL");
    expect(classifyDevRarity(3)).toBe("NORMAL");
    expect(classifyDevRarity(4)).toBe("NORMAL");
  });

  it("classifies 8-9 as RARE", () => {
    expect(classifyDevRarity(8)).toBe("RARE");
    expect(classifyDevRarity(9)).toBe("RARE");
  });

  it("classifies 5, 6, 7, and 10+ as unclassified (null) — no LEGENDARY tier exists", () => {
    expect(classifyDevRarity(5)).toBeNull();
    expect(classifyDevRarity(6)).toBeNull();
    expect(classifyDevRarity(7)).toBeNull();
    expect(classifyDevRarity(10)).toBeNull();
    expect(classifyDevRarity(11)).toBeNull();
    expect(classifyDevRarity(20)).toBeNull();
  });

  it("classifies 0 and negative deltas as unclassified", () => {
    expect(classifyDevRarity(0)).toBeNull();
    expect(classifyDevRarity(-2)).toBeNull();
  });
});

describe("pickAttrFlavor", () => {
  it("always returns one of the attribute's own pool entries", () => {
    for (let season = 0; season < 20; season++) {
      const line = pickAttrFlavor("shooting", season);
      expect(ATTR_FLAVOR.shooting).toContain(line);
    }
  });

  it("is deterministic — the same season always returns the same line", () => {
    expect(pickAttrFlavor("ballHandling", 7)).toBe(pickAttrFlavor("ballHandling", 7));
  });

  it("varies across at least some seasons", () => {
    const lines = new Set(Array.from({ length: 9 }, (_, i) => pickAttrFlavor("passing", i)));
    expect(lines.size).toBeGreaterThan(1);
  });

  it("every attribute has a non-empty pool", () => {
    for (const key of Object.keys(ATTR_FLAVOR) as (keyof typeof ATTR_FLAVOR)[]) {
      expect(ATTR_FLAVOR[key].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run development.test.ts` — expect all passing (the pre-existing test suite in this file is untouched by this task and should still pass; `SeasonComplete.tsx`'s type errors from Step 2 are still open at this point and get fixed in Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/engine/development.ts src/engine/development.test.ts
git commit -m "feat: add development rarity classification and per-attribute microcopy pools

classifyDevRarity(delta) sorts a player-selected development delta into
exactly two tiers — NORMAL (1-4) or RARE (8-9) — returning null for
everything else (5-7, 10+), which the UI layer (Task 3) uses to skip the
badge entirely rather than invent a category. ATTR_FLAVOR changes from
one long sentence per attribute to a short 3-line pool per attribute,
with pickAttrFlavor rotating through it deterministically by season. No
change to any development math — this is pure presentation-layer data."
```

---

### Task 2: Expose the player-selected delta and the real calendar year from the engine

**Files:**
- Modify: `src/engine/career.ts`
- Modify: `src/engine/career.test.ts`

**Interfaces:**
- `SeasonEnd` gains two fields: `primaryDevelopment: { attribute: keyof Attributes; delta: number } | null` and `year: number`.
- `finishOlympics`'s return type gains one field: `year: number`, changing from `{ state: CareerState; events: CareerEvent[] }` to `{ state: CareerState; events: CareerEvent[]; year: number }`.

- [ ] **Step 1: Add the two new fields to `SeasonEnd`**

Find:

```ts
export type SeasonEnd = {
  state: CareerState;
  events: CareerEvent[];
  wonTitle: boolean;
  careerOver: boolean;
  olympicsNext: boolean;
  development: DevelopmentResult | null;
  conclusion: SeasonConclusion | null;
};
```

Replace with:

```ts
export type SeasonEnd = {
  state: CareerState;
  events: CareerEvent[];
  wonTitle: boolean;
  careerOver: boolean;
  olympicsNext: boolean;
  development: DevelopmentResult | null;
  conclusion: SeasonConclusion | null;
  /** The exact attribute + delta the player picked in "Choose Your Focus"
   * this season, captured from state.lockedDevelopment BEFORE advance()
   * clears it — the only reliable way to know which row of the season's
   * development actually came from the player's own pick, as opposed to
   * aging, minigames, or the workout bonus (which can never land on this
   * same attribute — see applyWorkout). Null on the rare season where
   * nothing was locked. */
  primaryDevelopment: { attribute: keyof Attributes; delta: number } | null;
  /** Real calendar year this season took place, reusing the exact formula
   * already used for the draft class (2026 + season) in advance() — for
   * grand celebration screens only; every other screen keeps "Season N". */
  year: number;
};
```

- [ ] **Step 2: Capture both values at the end of `finishSeason`**

Find (the exact tail of `finishSeason`):

```ts
  const conclusion = buildConclusion(
    state, stats, development, awards.map((a) => a.type.replace(/_/g, " ")), t, lg,
    events.filter((e) => e.type === "consequence" || e.type === "callback").map((e) => e.narrative),
    state.seasonDecisions
  );
  const out = advance(next, events, wonTitle);
  return { ...out, development, conclusion };
}
```

Replace with:

```ts
  const conclusion = buildConclusion(
    state, stats, development, awards.map((a) => a.type.replace(/_/g, " ")), t, lg,
    events.filter((e) => e.type === "consequence" || e.type === "callback").map((e) => e.narrative),
    state.seasonDecisions
  );
  const out = advance(next, events, wonTitle);
  // Captured from the INCOMING state (never reassigned in this function),
  // before advance() clears lockedDevelopment on the returned state.
  const primaryDevelopment = state.lockedDevelopment
    ? { attribute: state.lockedDevelopment.attribute, delta: state.lockedDevelopment.delta }
    : null;
  return { ...out, development, conclusion, primaryDevelopment, year: 2026 + state.season };
}
```

(`state` here is the function's own parameter, confirmed never reassigned anywhere in `finishSeason`'s body — every mutation in this function builds `next`/`out`, never `state = ...` — so `state.lockedDevelopment` and `state.season` are still the exact original incoming values at this point, identical to what every other read of `state.season` earlier in this same function already relies on, e.g. the `TimelineEntry`'s own `season: state.season` a few lines above.)

- [ ] **Step 3: Add `year` to `finishOlympics`'s return**

Find:

```ts
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

Replace with:

```ts
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
  // state.season is already incremented for the NEXT NBA season by the time
  // Olympics runs (it happens in the offseason gap after advance() already
  // ran for the season that triggered it) — state.season - 1 is the actual
  // Olympics year, the same value this function already uses for the
  // TimelineEntry's own `season` field a few lines above.
  return { state: next, events, year: 2026 + (state.season - 1) };
}
```

Also update `finishOlympics`'s exported function signature line to reflect the new return type — find:

```ts
export function finishOlympics(state: CareerState): { state: CareerState; events: CareerEvent[] } {
```

Replace with:

```ts
export function finishOlympics(state: CareerState): { state: CareerState; events: CareerEvent[]; year: number } {
```

- [ ] **Step 4: Write tests**

In `src/engine/career.test.ts`, add this new `describe` block at the end of the file:

```ts
describe("finishSeason exposes primaryDevelopment and year", () => {
  it("primaryDevelopment matches the attribute/delta the player locked in via chooseFocus", () => {
    let state = initCareer(60, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    const options = getSeasonDevelopmentOptions(state);
    state = chooseFocus(state, options[0].attribute);
    const locked = state.lockedDevelopment!;
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.primaryDevelopment).toEqual({ attribute: locked.attribute, delta: locked.delta });
  });

  it("year is 2026 + the season that was just played (not the incremented one)", () => {
    let state = initCareer(61, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    const seasonPlayed = state.season;
    state = chooseFocus(state, "shooting");
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.year).toBe(2026 + seasonPlayed);
    expect(end.state.season).toBe(seasonPlayed + 1); // confirms year is NOT computed off the post-advance value
  });
});

describe("finishOlympics exposes year", () => {
  it("year reflects the season Olympics actually happened in, not the already-incremented state.season", () => {
    let state = initCareer(62, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    state = { ...state, phase: "OLYMPICS", tournament: null, season: 9 };
    const { year } = finishOlympics(state);
    expect(year).toBe(2026 + 8); // state.season (9) - 1, matching this function's own TimelineEntry.season
  });
});
```

- [ ] **Step 5: Run, confirm tests pass and typecheck is clean**

Run: `npx vitest run career.test.ts` — expect all passing. Run: `npx tsc --noEmit` — expect the SAME `SeasonComplete.tsx` errors as Task 1 left (still not yet fixed), and now ALSO an error at `App.tsx`'s `finishOlympics` destructuring call site (still using the 2-field shape) — confirm no errors anywhere in `career.ts`/`career.test.ts` themselves.

- [ ] **Step 6: Commit**

```bash
git add src/engine/career.ts src/engine/career.test.ts
git commit -m "feat: expose the player's locked development pick and the real calendar year from finishSeason/finishOlympics

Both values were already being computed internally (lockedDevelopment
before advance() clears it; the season number the draft-class year
formula already uses) and then discarded. Exposing them as new SeasonEnd/
finishOlympics fields is what lets the UI layer (Tasks 3 and 6) reliably
tell a player-selected development delta apart from an automatic one, and
show a real year on celebration screens, without re-deriving either from
scratch or inventing a new formula."
```

---

### Task 3: Wire rarity + microcopy into Season Complete

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `classifyDevRarity`, `pickAttrFlavor` (Task 1, `../../engine/development`); `SeasonEnd.primaryDevelopment` (Task 2).
- `SeasonComplete`'s prop shape gains one new required prop: `primaryDevelopment: { attribute: keyof Attributes; delta: number } | null`.

- [ ] **Step 1: Update `SeasonComplete`'s imports and props**

Find:

```tsx
import { CareerState, SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL, ATTR_FLAVOR, totalSeasonDelta } from "../../engine/development";
import { playerStatus } from "../../engine/status";
```

Replace with:

```tsx
import { CareerState, SeasonConclusion } from "../../engine/career";
import { Attributes, CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL, totalSeasonDelta, classifyDevRarity, pickAttrFlavor } from "../../engine/development";
import { playerStatus } from "../../engine/status";
```

(`ATTR_FLAVOR` is dropped from this import — it's no longer read directly here, only through `pickAttrFlavor`.)

Find:

```tsx
export function SeasonComplete({
  state, conclusion, development, events, onNext,
}: {
  state: CareerState;
  conclusion: SeasonConclusion;
  development: DevelopmentResult | null;
  events: CareerEvent[];
  onNext: () => void;
}) {
```

Replace with:

```tsx
export function SeasonComplete({
  state, conclusion, development, events, primaryDevelopment, onNext,
}: {
  state: CareerState;
  conclusion: SeasonConclusion;
  development: DevelopmentResult | null;
  events: CareerEvent[];
  primaryDevelopment: { attribute: keyof Attributes; delta: number } | null;
  onNext: () => void;
}) {
```

- [ ] **Step 2: Replace the `totalDeltas` rendering block**

Find (the exact current block — this is Task 4's block from the prior `polish-balance-flow` plan, gating the old single-line `ATTR_FLAVOR` flavor text on the merged total's own magnitude, which this task replaces):

```tsx
        {totalDeltas.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {totalDeltas.map((c) => {
              const developmentDelta = development?.changes.find((d) => d.attribute === c.attribute)?.delta ?? 0;
              return (
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
                  {developmentDelta >= 3 && (
                    <p className="text-[11px] text-mute mt-0.5 leading-snug">{ATTR_FLAVOR[c.attribute]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
```

Replace with:

```tsx
        {totalDeltas.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {totalDeltas.map((c) => {
              // Rarity/microcopy apply ONLY to the row matching this season's
              // player-selected pick — never to aging/minigame/workout deltas,
              // and never inferred from magnitude alone (the same +8 means
              // nothing special if it came from an automatic source).
              const isPrimaryPick = primaryDevelopment?.attribute === c.attribute;
              const rarity = isPrimaryPick ? classifyDevRarity(primaryDevelopment!.delta) : null;
              return (
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
                  {rarity && (
                    <>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {rarity === "RARE" && <span className="text-[11px]">💎</span>}
                        <span
                          className="eyebrow text-[10px]"
                          style={{ color: rarity === "RARE" ? "#A78BFA" : "#8A99B8" }}
                        >
                          {rarity}
                        </span>
                      </div>
                      <p className="text-[11px] text-mute mt-0.5 leading-snug">
                        {pickAttrFlavor(c.attribute, state.season)}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
```

- [ ] **Step 3: Update `App.tsx`'s `SeasonComplete` call site and `completeSeason`**

Find:

```tsx
import { CareerEvent, Playstyle, Position, SeasonStats } from "./engine/types";
```

Replace with:

```tsx
import { Attributes, CareerEvent, Playstyle, Position, SeasonStats } from "./engine/types";
```

Find:

```tsx
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [conclusion, setConclusion] = useState<SeasonConclusion | null>(null);
```

Replace with:

```tsx
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [conclusion, setConclusion] = useState<SeasonConclusion | null>(null);
  const [primaryDevelopment, setPrimaryDevelopment] = useState<{ attribute: keyof Attributes; delta: number } | null>(null);
```

Find:

```tsx
  const completeSeason = (override?: CareerState) => {
    const base = override ?? state;
    if (!base) return;
    const end = finishSeason(base, null);
    setState(end.state);
    setResultEvents(end.events);
    setOlympicsPending(end.olympicsNext);
    setDevelopment(end.development);
    setConclusion(end.conclusion);
    if (end.careerOver) setSummary(buildCareerSummary(end.state));
    // Rare development tiers earn their own screen before the season report.
    setStage(end.development?.special ? "development" : "season_complete");
  };
```

Replace with:

```tsx
  const completeSeason = (override?: CareerState) => {
    const base = override ?? state;
    if (!base) return;
    const end = finishSeason(base, null);
    setState(end.state);
    setResultEvents(end.events);
    setOlympicsPending(end.olympicsNext);
    setDevelopment(end.development);
    setConclusion(end.conclusion);
    setPrimaryDevelopment(end.primaryDevelopment);
    setSeasonYear(end.year);
    if (end.careerOver) setSummary(buildCareerSummary(end.state));
    // Rare development tiers earn their own screen before the season report.
    setStage(end.development?.special ? "development" : "season_complete");
  };
```

(`setSeasonYear` doesn't exist yet at this point in the plan — it's introduced in Task 6, which also touches this exact function again. This step's edit is safe to apply now; Task 6's own edit to this same function is written against THIS post-Task-3 version of the code, not the original, so apply tasks in order.)

Find:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete state={state} conclusion={conclusion} development={development} events={resultEvents} onNext={afterSeasonComplete} />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

Replace with:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete
          state={state} conclusion={conclusion} development={development} events={resultEvents}
          primaryDevelopment={primaryDevelopment} onNext={afterSeasonComplete}
        />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

Find:

```tsx
  const restart = () => {
    setState(null); setPending(null); setDecision(null); setSeasonEvent(null);
    setSeasonView(null); setRoundChallenge(null); setResultEvents([]);
    setSummary(null); setOlympicsPending(false);
    setDevelopment(null); setConclusion(null); setEventPhase(null);
    setDecisionResultText(null);
    setStage("creation");
  };
```

Replace with:

```tsx
  const restart = () => {
    setState(null); setPending(null); setDecision(null); setSeasonEvent(null);
    setSeasonView(null); setRoundChallenge(null); setResultEvents([]);
    setSummary(null); setOlympicsPending(false);
    setDevelopment(null); setConclusion(null); setEventPhase(null);
    setDecisionResultText(null); setPrimaryDevelopment(null);
    setStage("creation");
  };
```

(`setSeasonYear` and the celebration-queue resets are added to this same function in Task 6 — apply tasks in order.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — expect it to STILL show one remaining error (the `finishOlympics` 2-field destructuring at the OLYMPICS branch of `finishRound`, and `setSeasonYear` not yet defined at this point — both are fixed together in Task 6, applied immediately next in this plan; do not treat these as this task's failure). Confirm `SeasonComplete.tsx` itself now has zero errors, and confirm the `completeSeason`/`restart`/`case "season_complete"` edits above compile correctly in isolation by checking there are no NEW errors introduced by this task's own changes beyond the pre-existing (soon to be fixed) `setSeasonYear`/`finishOlympics` ones.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx src/App.tsx
git commit -m "feat: rarity badge + microcopy for the player-selected development pick in Season Complete

Only the row matching this season's primaryDevelopment (the exact card
the player chose in Choose Your Focus) can show a NORMAL/RARE badge and
a short rotating microcopy line. Every other row — aging, minigame,
workout bonus, or the player's own pick when its delta doesn't classify
(5-7, 10+) — keeps showing its plain merged number exactly as before.
Replaces the old single-ATTR_FLAVOR-line-at->=3 mechanism, which gated
on the merged total rather than the actual source of the growth."
```

---

### Task 4: Design tokens for the celebration system

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: a new `rare` Tailwind color token; a new `.celebration-glow` CSS class + `glowPulse` keyframe, consumed by Task 5's `Celebration.tsx`.

- [ ] **Step 1: Add the `rare` color token**

Find:

```js
      colors: {
        ink:   "#0B1020", // arena dark — base
        court: "#141F38", // elevated surface
        line:  "#25344F", // hairline borders
        bone:  "#EDE8DE", // primary text
        mute:  "#8A99B8", // secondary text
        amber: "#E8A33D", // hardwood accent — primary action
        heat:  "#FF4D3D", // clutch / danger
        cool:  "#4DA3FF", // rival accent
      },
```

Replace with:

```js
      colors: {
        ink:   "#0B1020", // arena dark — base
        court: "#141F38", // elevated surface
        line:  "#25344F", // hairline borders
        bone:  "#EDE8DE", // primary text
        mute:  "#8A99B8", // secondary text
        amber: "#E8A33D", // hardwood accent — primary action
        heat:  "#FF4D3D", // clutch / danger
        cool:  "#4DA3FF", // rival accent
        rare:  "#A78BFA", // rare-tier development badge accent
      },
```

- [ ] **Step 2: Add the celebration glow keyframe**

Find (the existing animation block, near the end of the file):

```css
@keyframes riseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.rise { animation: riseIn .32s cubic-bezier(.2,.7,.2,1) both; }
.rise-1 { animation-delay: .05s }
.rise-2 { animation-delay: .11s }
.rise-3 { animation-delay: .17s }

@keyframes flash { 0%,100% { opacity: 0 } 12% { opacity: .5 } }
.flash { animation: flash .5s ease-out both; }
```

Replace with:

```css
@keyframes riseIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.rise { animation: riseIn .32s cubic-bezier(.2,.7,.2,1) both; }
.rise-1 { animation-delay: .05s }
.rise-2 { animation-delay: .11s }
.rise-3 { animation-delay: .17s }

@keyframes flash { 0%,100% { opacity: 0 } 12% { opacity: .5 } }
.flash { animation: flash .5s ease-out both; }

/* A soft pulsing glow behind a celebration screen's award icon — the one
   piece of new visual language this plan adds, reused identically across
   every grand-award reveal rather than styled per award. */
@keyframes glowPulse { 0%, 100% { opacity: .6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
.celebration-glow { position: relative; display: inline-flex; }
.celebration-glow::before {
  content: "";
  position: absolute;
  inset: -40px;
  background: radial-gradient(circle, rgba(232,163,61,0.35), transparent 70%);
  animation: glowPulse 2.2s ease-in-out infinite;
  z-index: -1;
}
```

- [ ] **Step 3: Confirm the build still compiles**

Run: `npx vite build` — expect this to succeed (CSS/Tailwind config changes don't affect TypeScript compilation, and `.celebration-glow` isn't referenced anywhere yet — that's fine, unused CSS classes don't error). `npx tsc --noEmit` still shows the same open `finishOlympics`/`setSeasonYear` errors from Task 3, unaffected by this task's CSS-only changes.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/styles.css
git commit -m "feat: add the rare-tier color token and celebration glow keyframe

One new Tailwind color (rare, a light violet, for the RARE development
badge) and one new reusable CSS glow effect for grand celebration
screens — both prep for Tasks 3/5, not yet consumed by anything in this
commit."
```

---

### Task 5: The Celebration screen and its trigger-building logic

**Files:**
- Create: `src/ui/screens/Celebration.tsx`
- Create: `src/ui/screens/Celebration.test.ts`

**Interfaces:**
- Produces: `export type CelebrationEntry = { key: string; year: number };`, `export function buildSeasonCelebrations(conclusion: SeasonConclusion, events: CareerEvent[], year: number): CelebrationEntry[]`, `export function Celebration({ playerName, entry, onNext }: { playerName: string; entry: CelebrationEntry; onNext: () => void })`.
- Consumes: `SeasonConclusion` (`../../engine/career`), `CareerEvent` (`../../engine/types`), `MILESTONE_FLAGS` (`../../engine/history`), `Screen` (`../components/Shell`).

- [ ] **Step 1: Write `Celebration.tsx`**

```tsx
import { useEffect, useState } from "react";
import { CareerEvent } from "../../engine/types";
import { MILESTONE_FLAGS } from "../../engine/history";
import { SeasonConclusion } from "../../engine/career";
import { Screen } from "../components/Shell";

export type CelebrationEntry = { key: string; year: number };

const CELEBRATION_COPY: Record<string, { headline: string; awardName: string; icon: string }> = {
  MVP: { headline: "THE BEST IN THE WORLD!!!!!", awardName: "NBA Most Valuable Player", icon: "👑" },
  NBA_CHAMPION: { headline: "NBA CHAMPION!!!!!", awardName: "NBA Champion", icon: "🏆" },
  NCAA_CHAMPION: { headline: "NATIONAL CHAMPION!!!!!", awardName: "NCAA Champion", icon: "🏆" },
  "FINALS MVP": { headline: "THE FINALS BELONG TO YOU!!!!!", awardName: "Finals MVP", icon: "🏅" },
  "ALL STAR": { headline: "ONE OF THE BEST!!!!!", awardName: "NBA All-Star", icon: "⭐" },
  "ALL NBA": { headline: "AMONG THE LEAGUE'S ELITE!!!!!", awardName: "All-NBA Team", icon: "🎖️" },
  "ROOKIE OF YEAR": { headline: "THE ROOKIE OF THE YEAR!!!!!", awardName: "Rookie of the Year", icon: "🌟" },
  OLYMPIC_GOLD: { headline: "OLYMPIC CHAMPION!!!!!", awardName: "Olympic Gold Medalist", icon: "🥇" },
};

// Smaller moments first, the biggest ones last — a multi-award season
// chains through these in order and ends on its highest note.
const CELEBRATION_ORDER = [
  "ROOKIE OF YEAR", "ALL STAR", "ALL NBA", "MVP", "NBA_CHAMPION", "NCAA_CHAMPION", "FINALS MVP",
];

/**
 * Builds this season's celebration queue from data finishSeason already
 * computed — never invents an award. conclusion.awards covers every
 * NBA-side type (MVP, CHAMPION, FINALS MVP, ALL STAR, ALL NBA, ROOKIE OF
 * YEAR). NCAA's tournament championship never produces a CHAMPION award
 * (rollSeasonAwards only pushes ALL_TOURNAMENT for NCAA), so it's detected
 * from the existing MILESTONE_FLAGS.CHAMPIONSHIP event flag instead — the
 * same flag finishSeason already attaches to that season's signature_moment
 * event. The two are mutually exclusive by construction (a season is either
 * NBA or NCAA), so there's no risk of double-counting one championship as
 * both.
 */
export function buildSeasonCelebrations(
  conclusion: SeasonConclusion,
  events: CareerEvent[],
  year: number
): CelebrationEntry[] {
  const queue: CelebrationEntry[] = [];
  for (const key of CELEBRATION_ORDER) {
    if (key === "NBA_CHAMPION") {
      if (conclusion.awards.includes("CHAMPION")) queue.push({ key, year });
    } else if (key === "NCAA_CHAMPION") {
      if (!conclusion.awards.includes("CHAMPION") && events.some((e) => e.flags.includes(MILESTONE_FLAGS.CHAMPIONSHIP))) {
        queue.push({ key, year });
      }
    } else if (conclusion.awards.includes(key)) {
      queue.push({ key, year });
    }
  }
  return queue;
}

/**
 * A single full-screen award reveal. Deliberately NOT another Season
 * Complete — no stats, no decisions, no league news, just the moment. The
 * Continue button stays disabled for a beat so the screen has a chance to
 * land before the player taps through it.
 */
export function Celebration({
  playerName, entry, onNext,
}: { playerName: string; entry: CelebrationEntry; onNext: () => void }) {
  const copy = CELEBRATION_COPY[entry.key];
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const id = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(id);
  }, [entry.key, entry.year]);

  if (!copy) return null;

  return (
    <Screen>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="celebration-glow rise">
          <span className="text-6xl">{copy.icon}</span>
        </div>
        <div className="rise rise-1 mt-6 font-display uppercase text-2xl tracking-wide text-bone">
          {playerName}
        </div>
        <h1 className="rise rise-2 mt-3 font-display uppercase text-[40px] leading-[0.95] text-amber">
          {copy.headline}
        </h1>
        <div className="rise rise-3 mt-5 eyebrow">{copy.awardName}</div>
        <div className="rise rise-3 mt-1 text-mute text-sm">{entry.year}</div>
      </div>
      <div
        className={`mt-auto pt-10 rise rise-3 transition-opacity duration-300 ${
          ready ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button className="btn-primary" onClick={onNext}>Continue</button>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 2: Write `Celebration.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSeasonCelebrations } from "./Celebration";
import { SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { MILESTONE_FLAGS } from "../../engine/history";

function conclusionWithAwards(awards: string[]): SeasonConclusion {
  return {
    headline: "", lines: [],
    stats: { season: 1, phase: "NBA", gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, fgPct: 0 } as any,
    awards, draftStock: null, decisions: [],
  };
}

describe("buildSeasonCelebrations", () => {
  it("returns an empty queue when nothing grand happened", () => {
    expect(buildSeasonCelebrations(conclusionWithAwards([]), [], 2027)).toEqual([]);
  });

  it("includes MVP when conclusion.awards has it", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["MVP"]), [], 2027);
    expect(queue).toEqual([{ key: "MVP", year: 2027 }]);
  });

  it("includes ALL TOURNAMENT-only seasons as an empty queue — it's a secondary award, not a grand one", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["ALL TOURNAMENT"]), [], 2027);
    expect(queue).toEqual([]);
  });

  it("maps a NBA CHAMPION award to NBA_CHAMPION, not NCAA_CHAMPION", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["CHAMPION"]), [], 2027);
    expect(queue).toEqual([{ key: "NBA_CHAMPION", year: 2027 }]);
  });

  it("detects an NCAA championship via the MILESTONE_FLAGS.CHAMPIONSHIP event flag when there's no CHAMPION award", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 3, type: "signature_moment", narrative: "NATIONAL CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards([]), events, 2029);
    expect(queue).toEqual([{ key: "NCAA_CHAMPION", year: 2029 }]);
  });

  it("never double-counts a championship as both NBA_CHAMPION and NCAA_CHAMPION in the same season", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 5, type: "signature_moment", narrative: "NBA CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards(["CHAMPION"]), events, 2031);
    expect(queue.filter((c) => c.key === "NBA_CHAMPION" || c.key === "NCAA_CHAMPION")).toHaveLength(1);
    expect(queue).toEqual([{ key: "NBA_CHAMPION", year: 2031 }]);
  });

  it("chains multiple grand awards in the smaller-to-biggest order, ending on the highest note", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 5, type: "signature_moment", narrative: "NBA CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards(["MVP", "ALL STAR", "ALL NBA", "CHAMPION", "FINALS MVP"]), events, 2031);
    expect(queue.map((c) => c.key)).toEqual(["ALL STAR", "ALL NBA", "MVP", "NBA_CHAMPION", "FINALS MVP"]);
  });
});
```

- [ ] **Step 3: Run, confirm tests pass**

Run: `npx vitest run Celebration.test.ts` — expect all passing.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — this NEW file must compile cleanly; the pre-existing `App.tsx` errors from Task 3 (`finishOlympics`/`setSeasonYear`, not yet fixed) are unaffected by this task and still expected at this point.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/Celebration.tsx src/ui/screens/Celebration.test.ts
git commit -m "feat: add the Celebration screen and its season-celebration-queue builder

buildSeasonCelebrations reads only data finishSeason already computes
(conclusion.awards, the existing MILESTONE_FLAGS.CHAMPIONSHIP event flag
for NCAA's championship, which never produces a CHAMPION award) — no new
award types, no new architecture. The Celebration component is a
dedicated full-screen reveal, not a repurposed Season Complete: player
name, a big headline, the award's official name, its real year, and a
Continue button that stays disabled for ~900ms so the moment has time to
land. Not yet wired into App.tsx's stage machine — that's Task 6."
```

---

### Task 6: Wire the celebration stage into both the normal flow and Olympics

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- `Stage` gains `"celebration"`.
- New state: `seasonYear`, `celebrationQueue`, `celebrationFrom`, `olympicsGoldPending`.

- [ ] **Step 1: Add `"celebration"` to the `Stage` type**

Find:

```tsx
type Stage =
  | "creation" | "team_select" | "hub" | "focus" | "decision" | "decision_result" | "event"
  | "workout" | "season" | "tournament" | "consequence" | "round" | "result" | "development" | "season_complete"
  | "offseason" | "draft" | "summary";
```

Replace with:

```tsx
type Stage =
  | "creation" | "team_select" | "hub" | "focus" | "decision" | "decision_result" | "event"
  | "workout" | "season" | "tournament" | "consequence" | "round" | "result" | "development" | "season_complete"
  | "celebration" | "offseason" | "draft" | "summary";
```

- [ ] **Step 2: Import the new module**

Find:

```tsx
import { BigDecisionScreen, SeasonSimScreen, SeasonResultScreen, BigDecisionResultScreen } from "./ui/screens/SeasonFlow";
```

Replace with:

```tsx
import { BigDecisionScreen, SeasonSimScreen, SeasonResultScreen, BigDecisionResultScreen } from "./ui/screens/SeasonFlow";
import { Celebration, CelebrationEntry, buildSeasonCelebrations } from "./ui/screens/Celebration";
```

- [ ] **Step 3: Add the new state**

Find (this is the post-Task-3 version of this block — confirm `primaryDevelopment` is already present from Task 3's own edit before applying this one):

```tsx
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [conclusion, setConclusion] = useState<SeasonConclusion | null>(null);
  const [primaryDevelopment, setPrimaryDevelopment] = useState<{ attribute: keyof Attributes; delta: number } | null>(null);
```

Replace with:

```tsx
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [conclusion, setConclusion] = useState<SeasonConclusion | null>(null);
  const [primaryDevelopment, setPrimaryDevelopment] = useState<{ attribute: keyof Attributes; delta: number } | null>(null);
  const [seasonYear, setSeasonYear] = useState<number>(2026);
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEntry[]>([]);
  const [celebrationFrom, setCelebrationFrom] = useState<"season" | "olympics" | null>(null);
  const [olympicsGoldPending, setOlympicsGoldPending] = useState(false);
```

- [ ] **Step 4: Capture the Olympics year and gold flag in `finishRound`**

Find:

```tsx
  const finishRound = (outcome: GauntletOutcome) => {
    if (!state || !roundChallenge) return;
    const res = resolveTournamentRound(state, roundChallenge, outcome);
    setState(res.state);
    setRoundChallenge(null);
    if (res.tournamentOver) {
      // Olympics wrap up on their own track; club seasons continue to results.
      if (res.state.phase === "OLYMPICS") {
        const { state: done, events: olympicsEvents } = finishOlympics(res.state);
        setState(done);
        setResultEvents(olympicsEvents);
        setStage("result");
        return;
      }
      completeSeason(res.state);
      return;
    }
    setStage("tournament");
  };
```

Replace with:

```tsx
  const finishRound = (outcome: GauntletOutcome) => {
    if (!state || !roundChallenge) return;
    const res = resolveTournamentRound(state, roundChallenge, outcome);
    setState(res.state);
    setRoundChallenge(null);
    if (res.tournamentOver) {
      // Olympics wrap up on their own track; club seasons continue to results.
      if (res.state.phase === "OLYMPICS") {
        const { state: done, events: olympicsEvents, year: olympicsYear } = finishOlympics(res.state);
        setState(done);
        setResultEvents(olympicsEvents);
        setSeasonYear(olympicsYear);
        // Set once, here, at the exact moment gold is confirmed — never
        // inferred later from resultEvents' contents, which get reused for
        // other things. afterResult clears this the instant it reads it.
        setOlympicsGoldPending(olympicsEvents.some((e) => e.flags.includes("olympic_gold")));
        setStage("result");
        return;
      }
      completeSeason(res.state);
      return;
    }
    setStage("tournament");
  };
```

- [ ] **Step 5: Split `afterSeasonComplete` into a celebration-check wrapper + `proceedAfterSeasonComplete`**

Find (this is the post-Task-3 version):

```tsx
  const afterSeasonComplete = () => {
    if (!state) return;
    if (summary || (state.phase === "DRAFT" && state.draftBoard)) {
      // Career just ended, or the player is draft-bound — no free-agency call this transition.
      afterResult();
      return;
    }
    setDecision(getBigDecision(state));
    setStage("decision");
  };
```

Replace with:

```tsx
  const proceedAfterSeasonComplete = () => {
    if (!state) return;
    if (summary || (state.phase === "DRAFT" && state.draftBoard)) {
      // Career just ended, or the player is draft-bound — no free-agency call this transition.
      afterResult();
      return;
    }
    setDecision(getBigDecision(state));
    setStage("decision");
  };

  const afterSeasonComplete = () => {
    if (!state || !conclusion) { proceedAfterSeasonComplete(); return; }
    const queue = buildSeasonCelebrations(conclusion, resultEvents, seasonYear);
    if (queue.length > 0) {
      setCelebrationQueue(queue);
      setCelebrationFrom("season");
      setStage("celebration");
      return;
    }
    proceedAfterSeasonComplete();
  };
```

- [ ] **Step 6: Split `afterResult` into an Olympics-gold check wrapper + `proceedAfterResult`**

Find:

```tsx
  const afterResult = () => {
    if (!state) return;
    if (summary) { setStage("summary"); return; }
    if (state.phase === "DRAFT" && state.draftBoard) { setStage("draft"); return; }
    if (olympicsPending) {
      setState(startOlympics(state));
      setOlympicsPending(false);
      setStage("tournament");
      return;
    }
    setStage("offseason");
  };
```

Replace with:

```tsx
  const proceedAfterResult = () => {
    if (!state) return;
    if (summary) { setStage("summary"); return; }
    if (state.phase === "DRAFT" && state.draftBoard) { setStage("draft"); return; }
    if (olympicsPending) {
      setState(startOlympics(state));
      setOlympicsPending(false);
      setStage("tournament");
      return;
    }
    setStage("offseason");
  };

  const afterResult = () => {
    if (!state) return;
    if (olympicsGoldPending) {
      setOlympicsGoldPending(false);
      setCelebrationQueue([{ key: "OLYMPIC_GOLD", year: seasonYear }]);
      setCelebrationFrom("olympics");
      setStage("celebration");
      return;
    }
    proceedAfterResult();
  };
```

- [ ] **Step 7: Add `nextCelebration`**

Add this new function directly after `afterResult` (i.e. right after the block from Step 6):

```tsx
  const nextCelebration = () => {
    const rest = celebrationQueue.slice(1);
    if (rest.length > 0) {
      setCelebrationQueue(rest);
      return;
    }
    setCelebrationQueue([]);
    const from = celebrationFrom;
    setCelebrationFrom(null);
    if (from === "olympics") { proceedAfterResult(); return; }
    proceedAfterSeasonComplete();
  };
```

- [ ] **Step 8: Add the `"celebration"` case to the render switch**

Find:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete
          state={state} conclusion={conclusion} development={development} events={resultEvents}
          primaryDevelopment={primaryDevelopment} onNext={afterSeasonComplete}
        />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

Replace with:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete
          state={state} conclusion={conclusion} development={development} events={resultEvents}
          primaryDevelopment={primaryDevelopment} onNext={afterSeasonComplete}
        />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
    case "celebration":
      return celebrationQueue.length > 0 ? (
        <Celebration playerName={state.player.name} entry={celebrationQueue[0]} onNext={nextCelebration} />
      ) : null;
```

- [ ] **Step 9: Reset the new state in `restart`**

Find (the post-Task-3 version):

```tsx
  const restart = () => {
    setState(null); setPending(null); setDecision(null); setSeasonEvent(null);
    setSeasonView(null); setRoundChallenge(null); setResultEvents([]);
    setSummary(null); setOlympicsPending(false);
    setDevelopment(null); setConclusion(null); setEventPhase(null);
    setDecisionResultText(null); setPrimaryDevelopment(null);
    setStage("creation");
  };
```

Replace with:

```tsx
  const restart = () => {
    setState(null); setPending(null); setDecision(null); setSeasonEvent(null);
    setSeasonView(null); setRoundChallenge(null); setResultEvents([]);
    setSummary(null); setOlympicsPending(false);
    setDevelopment(null); setConclusion(null); setEventPhase(null);
    setDecisionResultText(null); setPrimaryDevelopment(null);
    setSeasonYear(2026); setCelebrationQueue([]); setCelebrationFrom(null); setOlympicsGoldPending(false);
    setStage("creation");
  };
```

- [ ] **Step 10: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must now be fully clean (every error opened by Tasks 1/2/3 against `App.tsx` and `SeasonComplete.tsx` is resolved by this task's edits).

- [ ] **Step 11: Run the full test suite**

Run: `npm test` — expect all tests passing (this task adds no new engine logic, only `App.tsx` wiring, so no new test file — the behavior it wires together is already covered by Task 2's `finishSeason`/`finishOlympics` tests and Task 5's `buildSeasonCelebrations` tests).

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire the celebration stage into the normal season flow and Olympics

Two independent trigger points feed the same queue/component: (1)
afterSeasonComplete, reached only after SeasonComplete itself has
rendered, builds the queue from conclusion.awards + the existing
championship event flag; (2) afterResult, reached only after Olympics'
own SeasonResultScreen has already shown, checks a boolean set once at
the exact moment finishOlympics confirms gold and cleared the instant
it's read. Neither path can fire before its screen's own existing result
has already been shown, and Olympics' flow (finishRound -> finishOlympics
-> SeasonResultScreen -> afterResult) is otherwise untouched — no new
result screen, no restructuring, so the prior two-result-screens bug
class stays fixed."
```

---

### Task 7: Final verification

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread flaky failure is expected and unrelated). `npm run simulate` isn't expected to change output meaningfully — this plan touches no development math — but confirm it still runs without crashing (a crash would indicate an accidental import cycle or type error the other checks missed).

- [ ] **Step 2: Real browser smoke test**

Start the dev server (`npm run dev`) and play through a real career via `claude-in-chrome`. Confirm:

1. **Development rarity (normal case)**: play a season, pick a development card whose delta is 1-4 or 8-9. Confirm Season Complete shows that ONE row with a NORMAL or RARE badge (💎 + purple for RARE) and a short microcopy line — and confirm every OTHER row on that same screen (from aging/minigame/workout) shows only its plain number, no badge, no microcopy, regardless of that row's own magnitude.
2. **Development rarity (unclassified case)**: if reachable within the session (may require several seeded seasons — otherwise rely on Task 1's unit tests as evidence and note that in the report), confirm a season where the picked card's delta is 5, 6, 7, or 10+ shows that row with its plain number and NO badge/microcopy — never an incorrect or invented category.
3. **Grand celebration (single award)**: reach a season with at least one qualifying award (All-Star is usually the easiest to reach first). Confirm: Season Complete renders and is dismissed FIRST (still showing its own awards pills, unchanged), THEN the Celebration screen appears as a distinct, dramatic, dark full-screen reveal — not a variant of Season Complete — with the player's name, the big headline, the award's official name, the real year (not "Season N"), and a Continue button that's disabled for roughly a second before becoming clickable.
4. **Grand celebration (chained)**: if reachable, a season with multiple qualifying awards (e.g. a championship season with MVP + Finals MVP) chains through multiple Celebration screens back-to-back before reaching the next stage (Big Decision) — confirm the order ends on the biggest moment and confirm there is no way to get stuck or see a screen with blank/missing content.
5. **Olympics — no duplicate result screens**: play or seed-select through to an Olympics season. Confirm the flow is: Olympics bracket → the existing `SeasonResultScreen` (unchanged content) → (only if gold) ONE Celebration screen for Olympic Gold → continues normally to offseason/next season. Confirm silver/bronze/group-stage results do NOT trigger a celebration screen and proceed exactly as before this plan. Confirm there is still exactly one result-shaped screen before any celebration, never two.
6. **Non-grand awards still work normally**: confirm `ALL TOURNAMENT` (NCAA) still appears only as a small pill on Season Complete, with no celebration screen.

Report exactly what was visually verified, and which items (if any) were covered by unit tests instead of live observation, with the reason why.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify Step 1, and commit. If clean, no further commit needed.

---

## Self-review notes

- **Spec coverage:** Task 1 (rarity/microcopy source-of-truth restriction to player-selected picks) fully implements the corrected Task 1 spec, including the LEGENDARY-removal correction. Task 2 implements the exact "identify player-selected vs automatic reliably in code" requirement via `SeasonEnd.primaryDevelopment`, and the real-year requirement via `SeasonEnd.year`/`finishOlympics`'s `year`. Tasks 3-4 wire Task 1's presentation. Tasks 5-6 implement the grand celebration system (Task 2/3/5 of the user's original numbering) including multi-award chaining and the Olympics-safe single-path integration (Task 4 of the user's original numbering), with Olympic Gold included per the final correction. Task 7 covers the explicit "revisión final de los flujos normales y Olympics" request.
- **Placeholder scan:** every code block above is complete, verbatim content against the actual current files (re-read fresh during planning, post-merge) — no TBD, no "similar to Task N".
- **Type consistency:** `classifyDevRarity`/`pickAttrFlavor`/`DevRarity` (Task 1) are defined once and consumed with matching signatures in Task 3's `SeasonComplete.tsx`. `SeasonEnd.primaryDevelopment`/`.year` and `finishOlympics`'s `.year` (Task 2) are consumed with matching shapes in Task 3 and Task 6's `App.tsx` edits. `CelebrationEntry`/`buildSeasonCelebrations`/`Celebration` (Task 5) are consumed identically in Task 6.
- **Cross-task ordering is load-bearing for `App.tsx`:** Tasks 3 and 6 both edit `App.tsx`'s `completeSeason`, `restart`, and the `case "season_complete"` render branch, and Task 6 edits `afterSeasonComplete`/`afterResult` which Task 3 does not touch. Each task's Find blocks are written against the file state AFTER the previous task's edits landed — apply strictly in numeric order (1→2→3→4→5→6→7) and re-read `App.tsx` fresh before starting Task 6 to confirm Task 3's edits are present exactly as written, since a task reviewer or resumed implementer working out of order would otherwise fail to match a Find block.
- **Explicitly preserved (per Global Constraints):** `TIER_BUDGET`, `rollDevelopment`, `rollSeasonAwards`, Fan Love, the `Award` union, the existing Olympics single-path flow structure, and every other screen's "Season N" labeling.
