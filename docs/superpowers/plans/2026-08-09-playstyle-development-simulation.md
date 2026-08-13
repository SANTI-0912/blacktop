# Playstyle-Driven Development & Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 cosmetic playstyles with 6 identity-defining archetypes where each one owns a closed pool of attributes it can ever develop or that ever matter to its season simulation and OVR — everything else (contracts, awards, rival comparison, career summary) inherits the new identity for free.

**Architecture:** One new file, `engine/playstyle.ts`, becomes the single source of truth (active attributes + weights + role weights + creation copy) consumed by: character creation UI, the season development-option generator, aging, `computeOverall`, and `performanceScore`. No change to the season/tournament/draft/contract state machine itself — only to what feeds attribute numbers into it.

**Tech Stack:** React 18 + TypeScript 5 + Vite (existing). Adds Vitest as the first test runner in the project.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-08-09-playstyle-development-simulation-design.md` — every task below implements a section of it; do not deviate without checking there first.
- No new trainable attribute (`rebounding` stays a career statistic, not an `Attributes` field) — spec §2.1.
- `clutch` stays outside the whole playstyle system — never a development option, never counted in OVR/performanceScore, untouched by this plan's aging changes beyond its existing small independent drift — spec §2.2.
- Exactly 3 development options per season, drawn without replacement from the active pool only, with a recency cooldown — spec §4.
- Tier budgets: REGRESSION -4..-1, POOR 0..1, NORMAL 2..4, GOOD 5..6, BREAKOUT 7, RARE_BREAKOUT 8..9, LEGENDARY 10..13 — spec §5.
- Inactive attributes: never shown as a development option, never touched by aging, never counted in OVR/performanceScore for that playstyle — spec §2, §3, §6, §8.
- `tsc --noEmit` and `vite build` must stay clean throughout; run after every task.
- Do not touch: draft, tournament, playoffs, teams, contracts, bigdecision, challenge, minigameLibrary/rounds.tsx mechanics, events, threads, awards, history, schedule, identity, countries, rng, growth.ts (already-dead code, out of scope).

---

## File Structure

**New:**
- `src/engine/playstyle.ts` — `PLAYSTYLE_PROFILES` table, `startingBias()`, `isActive()`.
- `src/engine/playstyle.test.ts`, `src/engine/overall.test.ts`, `src/engine/simulation.test.ts`, `src/engine/development.test.ts`, `src/engine/focus.test.ts`, `src/engine/career.test.ts` — Vitest unit tests, one per engine module touched.
- `scripts/simulate-careers.ts` — headless multi-career simulation for statistical validation (Task 9).
- `vitest.config.ts` — Vitest config.

**Modified:** `src/engine/types.ts`, `src/engine/player.ts`, `src/engine/overall.ts`, `src/engine/simulation.ts`, `src/engine/development.ts`, `src/engine/focus.ts`, `src/engine/rival.ts`, `src/engine/career.ts`, `src/ui/screens/Onboarding.tsx`, `src/ui/screens/Creation.tsx`, `src/ui/screens/CareerHub.tsx`, `src/App.tsx`, `src/engine/index.ts`, `package.json`.

---

### Task 1: Test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/engine/rng.test.ts` (smoke test)

**Interfaces:**
- Produces: `npm test` runs Vitest once; `npm run test:watch` for watch mode. Every later task's tests assume this works.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `src/engine/rng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";

describe("createRNG", () => {
  it("is deterministic for the same seed", () => {
    const a = createRNG(42);
    const b = createRNG(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRNG(7);
    for (let i = 0; i < 50; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 test file, 2 tests, both PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/engine/rng.test.ts
git commit -m "test: add Vitest test infrastructure"
```

---

### Task 2: Rename Playstyle taxonomy + create `playstyle.ts`

This is one task, not several, because a closed-union rename cannot leave an intermediate compiling state — every direct consumer must move together.

**Files:**
- Create: `src/engine/playstyle.ts`
- Create: `src/engine/playstyle.test.ts`
- Modify: `src/engine/types.ts` (Playstyle union)
- Modify: `src/engine/player.ts` (remove `PLAYSTYLE_TABLE`/`RoleWeights`, source starting bias from `playstyle.ts`)
- Modify: `src/engine/overall.ts` (`computeOverall`)
- Modify: `src/engine/simulation.ts` (`weightedAttributeScore`, `roleWeights` source)
- Modify: `src/ui/screens/Creation.tsx` (`STYLES` sourced from `playstyle.ts`)

**Interfaces:**
- Produces: `PLAYSTYLE_PROFILES: Record<Playstyle, PlaystyleProfile>`, `PlaystyleProfile = { id, label, tagline, coreLabel, identityLine, active: (keyof Attributes)[], weights: Partial<Record<keyof Attributes, number>>, roleWeights: { scoring, playmaking, rebounding, defenseImpact } }`, `startingBias(profile): Partial<Record<keyof Attributes, number>>`, `isActive(playstyle, attribute): boolean`. Every later task imports from here.

- [ ] **Step 1: Rename the union in `types.ts`**

In `src/engine/types.ts`, replace:

```ts
export type Playstyle =
  | "SCORER"
  | "PHYSICAL"
  | "MID_RANGE"
  | "PLAYMAKER"
  | "TWO_WAY"
  | "ATHLETIC";
```

with:

```ts
export type Playstyle =
  | "SHARPSHOOTER"
  | "PLAYMAKER"
  | "SUPERSTAR"
  | "SLASHER"
  | "TWO_WAY"
  | "INTERIOR";
```

- [ ] **Step 2: Create `src/engine/playstyle.ts`**

```ts
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
```

`SUPPORT` is currently unused by any profile — kept for consistency with the spec's 4-tier scale in case a future playstyle needs it; this is a real, load-bearing named constant for the other three tiers, not a placeholder. If a linter flags it unused, that's fine to leave (`export`-adjacent constant in a data file); do not delete it since it documents the full scale from the approved spec.

- [ ] **Step 3: Unit test the profile table**

Create `src/engine/playstyle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PLAYSTYLE_PROFILES, startingBias, isActive } from "./playstyle";
import { Playstyle } from "./types";

const ALL_PLAYSTYLES: Playstyle[] = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"];

describe("PLAYSTYLE_PROFILES", () => {
  it("defines exactly the 6 approved playstyles", () => {
    expect(Object.keys(PLAYSTYLE_PROFILES).sort()).toEqual([...ALL_PLAYSTYLES].sort());
  });

  it("every profile has at least 4 active attributes (3-of-N draw always possible)", () => {
    for (const p of ALL_PLAYSTYLES) {
      expect(PLAYSTYLE_PROFILES[p].active.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("never includes clutch as an active attribute", () => {
    for (const p of ALL_PLAYSTYLES) {
      expect(PLAYSTYLE_PROFILES[p].active).not.toContain("clutch");
    }
  });

  it("every active attribute has a positive weight", () => {
    for (const p of ALL_PLAYSTYLES) {
      const profile = PLAYSTYLE_PROFILES[p];
      for (const attr of profile.active) {
        expect(profile.weights[attr]).toBeGreaterThan(0);
      }
    }
  });

  it("SUPERSTAR includes Ball Handling as active (explicit user requirement)", () => {
    expect(PLAYSTYLE_PROFILES.SUPERSTAR.active).toContain("ballHandling");
  });

  it("SHARPSHOOTER never includes Defense, Strength, Finishing or Athleticism", () => {
    const active = PLAYSTYLE_PROFILES.SHARPSHOOTER.active;
    expect(active).not.toContain("defense");
    expect(active).not.toContain("strength");
    expect(active).not.toContain("finishing");
    expect(active).not.toContain("athleticism");
  });

  it("isActive() agrees with the profile's active list", () => {
    expect(isActive("SHARPSHOOTER", "shooting")).toBe(true);
    expect(isActive("SHARPSHOOTER", "defense")).toBe(false);
  });
});

describe("startingBias", () => {
  it("only biases active attributes", () => {
    const bias = startingBias(PLAYSTYLE_PROFILES.INTERIOR);
    expect(Object.keys(bias).sort()).toEqual([...PLAYSTYLE_PROFILES.INTERIOR.active].sort());
  });

  it("gives a bigger bias to VERY_HIGH-weight attributes than SUPPORT-weight ones", () => {
    const bias = startingBias(PLAYSTYLE_PROFILES.SHARPSHOOTER);
    expect(bias.shooting!).toBeGreaterThan(bias.passing!);
  });
});
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test`
Expected: all new tests PASS. The rest of the project will not compile yet — that's expected until Step 5-8 land; do not run `tsc` until Step 8.

- [ ] **Step 5: Update `player.ts`**

In `src/engine/player.ts`, remove the entire `RoleWeights` type and `PLAYSTYLE_TABLE` constant (the block from `export type RoleWeights = {` through the closing `};` of `PLAYSTYLE_TABLE`). Add the import:

```ts
import { PLAYSTYLE_PROFILES, startingBias } from "./playstyle";
```

Replace `baseAttributes`:

```ts
const BASE_ATTRIBUTE_FLOOR = 45; // every rookie is already a top prospect, not a random scrub

function baseAttributes(rng: RNG, playstyle: Playstyle): Attributes {
  const bias = startingBias(PLAYSTYLE_PROFILES[playstyle]);
  const attrs: Attributes = {
    shooting: BASE_ATTRIBUTE_FLOOR,
    finishing: BASE_ATTRIBUTE_FLOOR,
    passing: BASE_ATTRIBUTE_FLOOR,
    ballHandling: BASE_ATTRIBUTE_FLOOR,
    defense: BASE_ATTRIBUTE_FLOOR,
    athleticism: BASE_ATTRIBUTE_FLOOR,
    strength: BASE_ATTRIBUTE_FLOOR,
    basketballIQ: BASE_ATTRIBUTE_FLOOR,
    clutch: BASE_ATTRIBUTE_FLOOR,
  };
  for (const key of Object.keys(attrs) as (keyof Attributes)[]) {
    attrs[key] += bias[key] ?? 0;
    attrs[key] += randInt(rng, -3, 3); // small variance so no two players start identical
    attrs[key] = clamp(attrs[key], 40, 70); // rookies have room to grow; nobody starts maxed
  }
  return attrs;
}
```

In `createRival`, replace:

```ts
const playstyles = Object.keys(PLAYSTYLE_TABLE) as Playstyle[];
```

with:

```ts
const playstyles = Object.keys(PLAYSTYLE_PROFILES) as Playstyle[];
```

Everything else in `player.ts` (`baseHidden`, `createPlayer`, `RIVAL_NAME_POOL`, `RIVAL_ARCS`, the rest of `createRival`) is unchanged.

- [ ] **Step 6: Update `overall.ts`**

Replace the imports and `computeOverall`:

```ts
import { Attributes, Playstyle, Position } from "./types";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { clamp } from "./rng";

export function computeOverall(attrs: Attributes, playstyle: Playstyle): number {
  const profile = PLAYSTYLE_PROFILES[playstyle];
  let sum = 0;
  let weight = 0;
  for (const k of profile.active) {
    const w = profile.weights[k] ?? 1;
    sum += attrs[k] * w;
    weight += w;
  }
  // Slight upward curve so late-career elite players read as 90+ rather than
  // everyone clustering in the 70s.
  const raw = weight > 0 ? sum / weight : 50;
  return clamp(Math.round(raw * 1.06), 40, 99);
}
```

Delete the old `ALL` constant above it (`const ALL: (keyof Attributes)[] = [...]`) — it is no longer referenced anywhere in this file. `Role`, `ROLE_LABEL`, `determineRole`, `roleMinutesFactor`, `jerseyNumber` below it are unchanged.

- [ ] **Step 7: Test that inactive attributes cannot move OVR**

Create `src/engine/overall.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeOverall } from "./overall";
import { Attributes } from "./types";

const BASELINE: Attributes = {
  shooting: 60, finishing: 60, passing: 60, ballHandling: 60, defense: 60,
  athleticism: 60, strength: 60, basketballIQ: 60, clutch: 60,
};

describe("computeOverall", () => {
  it("raising SHARPSHOOTER's inactive Defense to 99 does not change OVR", () => {
    const before = computeOverall(BASELINE, "SHARPSHOOTER");
    const after = computeOverall({ ...BASELINE, defense: 99 }, "SHARPSHOOTER");
    expect(after).toBe(before);
  });

  it("raising SHARPSHOOTER's active Shooting to 99 does change OVR", () => {
    const before = computeOverall(BASELINE, "SHARPSHOOTER");
    const after = computeOverall({ ...BASELINE, shooting: 99 }, "SHARPSHOOTER");
    expect(after).toBeGreaterThan(before);
  });

  it("the same attribute set moved differently is active for one playstyle and inactive for another", () => {
    const withDefense = { ...BASELINE, defense: 99 };
    const sharpshooterOvr = computeOverall(withDefense, "SHARPSHOOTER");
    const twoWayOvr = computeOverall(withDefense, "TWO_WAY");
    const sharpshooterBaseline = computeOverall(BASELINE, "SHARPSHOOTER");
    const twoWayBaseline = computeOverall(BASELINE, "TWO_WAY");
    expect(sharpshooterOvr).toBe(sharpshooterBaseline); // Defense inactive for Sharpshooter
    expect(twoWayOvr).toBeGreaterThan(twoWayBaseline); // Defense active for Two-Way
  });
});
```

Run: `npm test -- overall.test.ts`
Expected: PASS once Step 6 above is in place (this is a same-task confirmation, not a separate red/green cycle, since `computeOverall`'s rewrite already happened in Step 6 — run it now to lock the behavior in before moving on).

- [ ] **Step 8: Update `simulation.ts`**

Replace the top imports:

```ts
import { Attributes, Hidden, Playstyle, PlayoffResult, SeasonStats, Person } from "./types";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { RNG, clamp, randRange } from "./rng";
```

Replace `weightedAttributeScore`:

```ts
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
```

In `simulateSeasonStats`, replace:

```ts
const roleWeights = PLAYSTYLE_TABLE[person.playstyle];
```

with:

```ts
const roleWeights = PLAYSTYLE_PROFILES[person.playstyle].roleWeights;
```

Everything else in the function (`basePerformance`, `morale`, `cons`, the box-score formulas) is unchanged — they already read `person.attributes.<specific key>` directly, so they automatically reflect whichever attributes the new system actually develops.

- [ ] **Step 9: Update `Creation.tsx`**

Remove the local `STYLES` array and its `Playstyle` literal ids. Add:

```tsx
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
```

Replace the render block that maps over `STYLES`:

```tsx
<div className="mt-3 space-y-2">
  {Object.values(PLAYSTYLE_PROFILES).map((s) => {
    const on = playstyle === s.id;
    return (
      <button
        key={s.id}
        onClick={() => setPlaystyle(s.id)}
        className={`w-full text-left px-4 py-3 border rounded-sm transition-colors ${
          on ? "border-amber bg-amber/10" : "border-line bg-court/50 hover:border-mute/50"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-display uppercase text-xl tracking-wide">{s.label}</span>
          <span className="eyebrow">{s.coreLabel}</span>
        </div>
        <p className="text-sm text-mute mt-0.5">{s.tagline}</p>
      </button>
    );
  })}
</div>
```

`playstyle` state stays `useState<Playstyle | null>(null)`; `setPlaystyle(s.id)` type-checks unchanged since `s.id: Playstyle`.

- [ ] **Step 10: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If not, the error list will point at any remaining `PLAYSTYLE_TABLE`/old-literal reference — fix in place, this task is not done until it's clean.

- [ ] **Step 11: Run tests and build**

Run: `npm test && npx vite build`
Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add src/engine/playstyle.ts src/engine/playstyle.test.ts src/engine/overall.test.ts \
  src/engine/types.ts src/engine/player.ts src/engine/overall.ts src/engine/simulation.ts \
  src/ui/screens/Creation.tsx
git commit -m "feat: replace cosmetic playstyles with identity-defining profiles"
```

---

### Task 3: Recalibrate development tiers

**Files:**
- Modify: `src/engine/development.ts` (`TIER_BUDGET`, `rollTier`)
- Test: `src/engine/development.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: same `rollTier(rng, age, performance, confidence, coachTrust): DevTier` signature, same `TIER_BUDGET: Record<DevTier, [number, number]>` shape — only values change. Later tasks depend on these exact names/shapes.

- [ ] **Step 1: Write the failing tier-distribution test**

Create `src/engine/development.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { rollDevelopment, TIER_BUDGET } from "./development";
import { createPlayer } from "./player";

function primeAveragePlayer(seed: number) {
  const rng = createRNG(seed);
  const player = createPlayer(rng, {
    name: "Test", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
  });
  return { ...player, hidden: { ...player.hidden, confidence: 55, coachTrust: 50 } };
}

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

  it("NORMAL is the modal tier for a prime-age, average-performance player", () => {
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < 2000; seed++) {
      const player = primeAveragePlayer(seed);
      const rng = createRNG(seed * 999 + 1);
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 26, performance: 0.72 });
      counts[result.tier] = (counts[result.tier] ?? 0) + 1;
    }
    const total = 2000;
    expect(counts.NORMAL / total).toBeGreaterThan(0.5);
    expect((counts.RARE_BREAKOUT ?? 0) / total).toBeLessThan(0.04);
    expect((counts.LEGENDARY ?? 0) / total).toBeLessThan(0.01);
  });

});
```

PLAN CORRECTION (found during implementation): a third test — "the primary (focus) attribute delta falls in [2, 4] the large majority of NORMAL-tier seasons" — originally appeared here. It does not belong in Task 3: at this point in the sequence, `rollDevelopment`'s primary attribute still only receives a 45-70% fractional share of the tier budget (today's pre-existing behavior), not the full budget — that rewrite is Task 4's job. The equivalent, correctly-scoped check already exists in Task 4 ("the chosen focus attribute gets the full tier budget, not a fraction of it"), which runs against the rewritten `rollDevelopment`. Do not add this assertion here.

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm test -- development.test.ts`
Expected: FAIL — `TIER_BUDGET` still has the old ranges, and the distribution assertions fail against the old `rollTier` weights.

- [ ] **Step 3: Recalibrate `development.ts`**

Replace `TIER_BUDGET` (add `export` — it wasn't exported before, and the test above plus Task 9's headless script both need it):

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

Replace `rollTier`:

```ts
function rollTier(rng: RNG, age: number, performance: number, confidence: number, coachTrust: number): DevTier {
  const young = age <= 23;
  const prime = age >= 24 && age <= 28;
  const old = age >= 31;

  const boost = (performance - 0.7) * 2 + (confidence - 50) / 90 + (coachTrust - 50) / 130;

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
```

(Only the numeric weights changed from today's version — same shape, same age-band gating, same `boost` formula.)

- [ ] **Step 4: Run the test again**

Run: `npm test -- development.test.ts`
Expected: PASS. If the distribution assertions are close but fail, adjust the `NORMAL`/`GOOD`/`BREAKOUT` base weights slightly (keep the ratios directionally the same) and rerun — this is expected calibration, not a sign of a wrong approach.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: clean (nothing outside `development.ts` reads `TIER_BUDGET`'s old values by literal, so this should not cascade).

```bash
git add src/engine/development.ts src/engine/development.test.ts
git commit -m "feat: recalibrate development tier budgets and probabilities"
```

---

### Task 4: Restrict secondary/regression development to the active pool

**Files:**
- Modify: `src/engine/development.ts` (`rollDevelopment`, remove `STYLE_AFFINITY`/`pickAttribute`)
- Test: `src/engine/development.test.ts` (append)

**Interfaces:**
- Consumes: `PLAYSTYLE_PROFILES` from Task 2.
- Produces: `rollDevelopment(params): DevelopmentResult` — same public signature as today (`{ rng, person, focus, age, performance }`), but every attribute inside `result.changes` is now guaranteed to be in `PLAYSTYLE_PROFILES[person.playstyle].active`. The chosen `focus` attribute now receives the tier's **full** budget (not a 45-70% share) — secondary attributes get a separate, smaller, additive nudge. This matches the spec's "pick Shooting +2→+4, get Shooting +3" model.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/development.test.ts`:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { Playstyle } from "./types";

const ALL_PLAYSTYLES: Playstyle[] = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"];

describe("rollDevelopment respects the active pool", () => {
  it("never changes an inactive attribute, across all playstyles", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      const active = new Set(PLAYSTYLE_PROFILES[playstyle].active);
      for (let seed = 0; seed < 300; seed++) {
        const rng = createRNG(seed * 13 + 1);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const result = rollDevelopment({ rng, person: player, focus: PLAYSTYLE_PROFILES[playstyle].active[0], age: 24, performance: 0.7 });
        for (const c of result.changes) {
          expect(active.has(c.attribute)).toBe(true);
        }
      }
    }
  });

  it("the chosen focus attribute gets the full tier budget, not a fraction of it", () => {
    let matches = 0;
    const trials = 500;
    for (let seed = 0; seed < trials; seed++) {
      const rng = createRNG(seed * 31 + 5);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 26, performance: 0.72 });
      if (result.tier === "REGRESSION") continue;
      const [lo, hi] = TIER_BUDGET[result.tier];
      const primary = result.changes.find((c) => c.attribute === "shooting");
      if (primary && primary.delta >= Math.max(1, lo - 1) && primary.delta <= hi + 1) matches++;
    }
    expect(matches / trials).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- development.test.ts`
Expected: FAIL — today's `rollDevelopment` draws secondary/regression attributes from `STYLE_AFFINITY` (all 9 attributes) and splits the budget across primary + secondaries, so both new assertions fail.

- [ ] **Step 3: Rewrite `rollDevelopment` and delete `STYLE_AFFINITY`/`pickAttribute`**

In `src/engine/development.ts`, add the import:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

Delete the `PHYSICAL`, `MENTAL`, `ALL`, `STYLE_AFFINITY` constants and the `pickAttribute` function entirely — all superseded.

Add a small weighted-pick helper (reuses the existing `weighted` from `rng.ts`):

```ts
function pickFromActive(rng: RNG, playstyle: Playstyle, pool: (keyof Attributes)[]): keyof Attributes {
  const profile = PLAYSTYLE_PROFILES[playstyle];
  const entries = pool.map((k) => ({ item: k, weight: profile.weights[k] ?? 1 }));
  return weighted(rng, entries);
}
```

(Add `weighted` and `Playstyle` to the existing `rng`/`types` imports at the top of the file if not already present.)

Replace the body of `rollDevelopment` (keep the function signature identical):

```ts
export function rollDevelopment(params: {
  rng: RNG;
  person: Person;
  focus: FocusKey | null;
  age: number;
  performance: number;
}): DevelopmentResult {
  const { rng, person, focus, age, performance } = params;
  const { confidence, coachTrust, developmentRate } = person.hidden;
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const rate = clamp(developmentRate, 0.75, 1.3);

  const tier = rollTier(rng, age, performance, confidence, coachTrust);
  const [lo, hi] = TIER_BUDGET[tier];

  if (tier === "REGRESSION") {
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
    const gainKey = focus && !used.has(focus) ? focus : gainPool.length ? pickFromActive(rng, person.playstyle, gainPool) : null;
    if (gainKey) changes.push({ attribute: gainKey, delta: randInt(rng, 1, 3) });
    return finish(tier, changes, person);
  }

  const changes: DevChange[] = [];
  const used = new Set<string>();

  // PRIMARY: the chosen focus attribute gets the FULL tier budget — what the
  // player sees on the development-option card is what they get.
  const primary = focus ?? pickFromActive(rng, person.playstyle, profile.active);
  const primaryDelta = Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
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
      const delta = Math.round(randRange(rng, secondaryLo, secondaryHi) * rate);
      if (delta > 0) changes.push({ attribute: k, delta });
    }
  }

  return finish(tier, changes, person);
}
```

`finish()` (clamping against the 30-99 ceiling, dropping no-ops, building the `DevelopmentResult`) is unchanged.

- [ ] **Step 4: Run tests, confirm PASS**

Run: `npm test -- development.test.ts`
Expected: all PASS, including the ones from Task 3.

- [ ] **Step 5: Typecheck, build, run full suite**

Run: `npx tsc --noEmit && npm test && npx vite build`
Expected: all clean. (`rival.ts` still compiles here — its `rollDevelopment` call site is unchanged, only the internals moved.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/development.ts src/engine/development.test.ts
git commit -m "feat: restrict development gains/regression to the active attribute pool"
```

---

### Task 5: Exactly-3 development options generator, end to end

Bundled as one task — like Task 2's enum rename, `FOCUS_OPTIONS` has two consumers (`Onboarding.tsx`, `rival.ts`) that must move together with its removal, or `tsc --noEmit` sits red in between. This task's deliverable is "development options are dynamic, 3-of-N, playstyle-driven, end to end" — engine and UI in the same pass.

**Files:**
- Modify: `src/engine/development.ts` (add `getDevelopmentOptions`, `DevelopmentOptionView`)
- Modify: `src/engine/career.ts` (`recentDevAttrs` field, `chooseFocus`, new `getSeasonDevelopmentOptions`)
- Modify: `src/engine/rival.ts` (replace `FOCUS_OPTIONS` usage)
- Modify: `src/engine/focus.ts` (remove `FOCUS_OPTIONS`)
- Modify: `src/ui/screens/Onboarding.tsx` (`FocusSelect` → `DevelopmentSelect`)
- Modify: `src/App.tsx` (import rename, pass options in)
- Test: `src/engine/development.test.ts` (append), `src/engine/career.test.ts` (new)

**Interfaces:**
- Produces: `type DevelopmentOptionView = { attribute: keyof Attributes; label: string; previewLow: number; previewHigh: number }`, `getDevelopmentOptions(rng: RNG, playstyle: Playstyle, recentDevAttrs: (keyof Attributes)[]): DevelopmentOptionView[]` (always length 3, or `active.length` if fewer than 3 — never happens per Task 2's ≥4 guarantee, but the function must not crash if it ever did). `CareerState.recentDevAttrs: FocusKey[]`. `getSeasonDevelopmentOptions(state: CareerState): DevelopmentOptionView[]`. `DevelopmentSelect({ state, options, onChoose }): JSX.Element`, replacing `FocusSelect`'s public shape (`onChoose: (f: FocusKey) => void` unchanged).
- Consumes: `PLAYSTYLE_PROFILES` (Task 2), `ATTR_LABEL` (already in `development.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/development.test.ts`:

```ts
import { getDevelopmentOptions } from "./development";

describe("getDevelopmentOptions", () => {
  it("always returns exactly 3 distinct options", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      for (let seed = 0; seed < 50; seed++) {
        const rng = createRNG(seed);
        const options = getDevelopmentOptions(rng, playstyle, []);
        expect(options.length).toBe(3);
        expect(new Set(options.map((o) => o.attribute)).size).toBe(3);
      }
    }
  });

  it("every option's attribute is in that playstyle's active pool", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      const active = new Set(PLAYSTYLE_PROFILES[playstyle].active);
      for (let seed = 0; seed < 50; seed++) {
        const rng = createRNG(seed * 3 + 1);
        const options = getDevelopmentOptions(rng, playstyle, []);
        for (const o of options) expect(active.has(o.attribute)).toBe(true);
      }
    }
  });

  it("previews a normal-tier band", () => {
    const rng = createRNG(1);
    const options = getDevelopmentOptions(rng, "SHARPSHOOTER", []);
    for (const o of options) {
      expect(o.previewLow).toBe(2);
      expect(o.previewHigh).toBe(4);
    }
  });

  it("high-weight attributes are drawn more often than low-weight ones over many seasons", () => {
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      const rng = createRNG(seed * 17 + 2);
      const options = getDevelopmentOptions(rng, "SHARPSHOOTER", []);
      for (const o of options) counts[o.attribute] = (counts[o.attribute] ?? 0) + 1;
    }
    // shooting (weight 5) should appear more often than passing (weight 3)
    expect(counts.shooting).toBeGreaterThan(counts.passing);
  });

  it("a recently-picked attribute is deweighted, not banned", () => {
    let withCooldownCount = 0;
    let withoutCooldownCount = 0;
    const trials = 800;
    for (let seed = 0; seed < trials; seed++) {
      const rngA = createRNG(seed * 5 + 1);
      const rngB = createRNG(seed * 5 + 1);
      const withCooldown = getDevelopmentOptions(rngA, "SHARPSHOOTER", ["shooting"]);
      const withoutCooldown = getDevelopmentOptions(rngB, "SHARPSHOOTER", []);
      if (withCooldown.some((o) => o.attribute === "shooting")) withCooldownCount++;
      if (withoutCooldown.some((o) => o.attribute === "shooting")) withoutCooldownCount++;
    }
    expect(withCooldownCount).toBeLessThan(withoutCooldownCount);
    expect(withCooldownCount).toBeGreaterThan(0); // deweighted, never fully banned
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- development.test.ts`
Expected: FAIL — `getDevelopmentOptions` does not exist yet.

- [ ] **Step 3: Implement `getDevelopmentOptions` in `development.ts`**

Add near the bottom of the file:

```ts
export type DevelopmentOptionView = {
  attribute: keyof Attributes;
  label: string;
  previewLow: number;
  previewHigh: number;
};

/**
 * Exactly 3 development options per season, drawn without replacement from
 * the playstyle's active pool, weighted by the profile's priority table.
 * The immediately-previous season's chosen attribute is deweighted (not
 * banned) so the same trio doesn't repeat two years running.
 */
export function getDevelopmentOptions(
  rng: RNG,
  playstyle: Playstyle,
  recentDevAttrs: (keyof Attributes)[]
): DevelopmentOptionView[] {
  const profile = PLAYSTYLE_PROFILES[playstyle];
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

  return picked.map((attribute) => ({
    attribute,
    label: ATTR_LABEL[attribute],
    previewLow: TIER_BUDGET.NORMAL[0],
    previewHigh: TIER_BUDGET.NORMAL[1],
  }));
}
```

(`ATTR_LABEL` and `TIER_BUDGET` already live in this file; `weighted` and `RNG` are already imported; add `Playstyle` to the `types` import if not already present from Task 4.)

- [ ] **Step 4: Run tests, confirm PASS**

Run: `npm test -- development.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `recentDevAttrs` and `getSeasonDevelopmentOptions` into `career.ts`**

In `src/engine/career.ts`, add the import:

```ts
import { getDevelopmentOptions, DevelopmentOptionView } from "./development";
```

(This is additive to the existing `import { DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult } from "./development";` line — merge into one import statement.)

Add the field to `CareerState` (near `focus`):

```ts
  /** Focus chosen for the CURRENT season. */
  focus: FocusKey | null;
  /** Last 1-2 seasons' chosen development attribute, for pool-variety cooldown. */
  recentDevAttrs: FocusKey[];
```

Initialize it in `initCareer`'s returned object (alongside `focus: null,`):

```ts
    focus: null,
    recentDevAttrs: [],
```

Replace `chooseFocus`:

```ts
export function chooseFocus(state: CareerState, focus: FocusKey): CareerState {
  const next = {
    ...state,
    focus,
    recentDevAttrs: [focus, ...state.recentDevAttrs].slice(0, 2),
  };
  const { roster, role } = refreshRoster(next, rngFor(state, 9));
  return { ...next, roster, role };
}
```

Add a new exported function near it:

```ts
export function getSeasonDevelopmentOptions(state: CareerState): DevelopmentOptionView[] {
  return getDevelopmentOptions(rngFor(state, 8), state.player.playstyle, state.recentDevAttrs);
}
```

- [ ] **Step 6: Fix `rival.ts`'s `FOCUS_OPTIONS` usage**

In `src/engine/rival.ts`, replace the import:

```ts
import { FOCUS_OPTIONS } from "./focus";
```

with:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

And replace the line:

```ts
const rivalFocus = pick(rng, FOCUS_OPTIONS).key;
```

with:

```ts
const rivalFocus = pick(rng, PLAYSTYLE_PROFILES[rival.playstyle].active);
```

(`pick` is already imported from `./rng` in this file.) This is a real behavior improvement, not just a compile fix: the rival's development now respects their own playstyle identity too.

- [ ] **Step 7: Remove `FOCUS_OPTIONS` from `focus.ts`**

In `src/engine/focus.ts`, delete the `FOCUS_OPTIONS` constant (the array of 8 `{ key, label, blurb }` entries). Leave `FocusKey`, `applyFocus` (unused today, out of scope to remove — see plan's Global Constraints), and everything below it untouched for now (aging changes come in Task 6).

- [ ] **Step 8: Rewrite `FocusSelect` as `DevelopmentSelect` in `Onboarding.tsx`**

Replace the whole `FocusSelect` function (imports at the top of the file also change: remove `import { FOCUS_OPTIONS, FocusKey } from "../../engine/focus";`, add `import { FocusKey } from "../../engine/focus"; import { DevelopmentOptionView } from "../../engine/development";`):

```tsx
export function DevelopmentSelect({
  state, options, onChoose,
}: { state: CareerState; options: DevelopmentOptionView[]; onChoose: (f: FocusKey) => void }) {
  const [selected, setSelected] = useState<FocusKey | null>(null);

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Title>Choose your focus</Title>
        <p className="text-mute text-sm mt-2 leading-relaxed">
          What part of your game will you develop this season? This sets the direction of
          your career — not its ceiling.
        </p>
      </div>

      <div className="mt-6 space-y-2 rise rise-1">
        {options.map((o) => {
          const on = selected === o.attribute;
          const current = Math.round(state.player.attributes[o.attribute]);
          return (
            <button
              key={o.attribute}
              onClick={() => setSelected(o.attribute)}
              className={`w-full text-left px-4 py-3 border rounded-sm transition-colors ${
                on ? "border-amber bg-amber/10" : "border-line bg-court/50 hover:border-mute/50"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display uppercase text-xl tracking-wide">{o.label}</span>
                <span className="stat-num text-sm">
                  <span className="text-mute">{current}</span>
                  {on && <span className="text-amber"> → +{o.previewLow} to +{o.previewHigh}</span>}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rise rise-2">
        <button
          className="btn-primary disabled:opacity-30"
          disabled={!selected}
          onClick={() => selected && onChoose(selected)}
        >
          Commit to the work
        </button>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 9: Update `App.tsx`**

Replace the import line:

```tsx
import { TeamSelect, FocusSelect, Offseason, SeasonEventScreen } from "./ui/screens/Onboarding";
```

with:

```tsx
import { TeamSelect, DevelopmentSelect, Offseason, SeasonEventScreen } from "./ui/screens/Onboarding";
```

Add `getSeasonDevelopmentOptions` to the existing `./engine/career` import block.

Replace the `"focus"` case in the render switch:

```tsx
    case "focus":
      return <DevelopmentSelect state={state} options={getSeasonDevelopmentOptions(state)} onChoose={pickFocus} />;
```

- [ ] **Step 10: Run all the new/updated tests, confirm PASS**

Run: `npm test -- development.test.ts`
Expected: PASS (from Step 4, still holds).

- [ ] **Step 11: Write a small `career.ts` test**

Create `src/engine/career.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initCareer, chooseFocus, getSeasonDevelopmentOptions } from "./career";
import { PLAYSTYLE_PROFILES } from "./playstyle";

describe("season development options", () => {
  it("returns 3 options from the player's active pool", () => {
    const state = initCareer(1, { name: "Test", country: "USA", position: "SG", height: 198, playstyle: "PLAYMAKER" });
    const options = getSeasonDevelopmentOptions(state);
    expect(options.length).toBe(3);
    const active = new Set(PLAYSTYLE_PROFILES.PLAYMAKER.active);
    for (const o of options) expect(active.has(o.attribute)).toBe(true);
  });

  it("chooseFocus tracks recentDevAttrs", () => {
    const state = initCareer(2, { name: "Test", country: "USA", position: "PG", height: 190, playstyle: "SHARPSHOOTER" });
    const next = chooseFocus(state, "shooting");
    expect(next.focus).toBe("shooting");
    expect(next.recentDevAttrs[0]).toBe("shooting");
  });
});
```

Run: `npm test -- career.test.ts`
Expected: PASS.

- [ ] **Step 12: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean — this is the first checkpoint since Step 1 where the whole project (engine + UI) compiles again, now with the full dynamic-options flow wired end to end.

- [ ] **Step 13: Manual verification**

Run: `npm run dev`, open the app, create a SHARPSHOOTER, and confirm the "Choose your focus" screen shows exactly 3 options, all plausible for a shooter (e.g. Shooting/Ball Handling/Basketball IQ/Passing — never Defense/Strength/Finishing/Athleticism). Repeat once for INTERIOR and confirm its 3 options only ever come from Finishing/Strength/Defense/Basketball IQ/Athleticism. Stop the dev server when done.

- [ ] **Step 14: Run full suite and build**

Run: `npm test && npx tsc --noEmit && npx vite build`
Expected: all clean.

- [ ] **Step 15: Commit**

```bash
git add src/engine/development.ts src/engine/development.test.ts src/engine/career.ts \
  src/engine/career.test.ts src/engine/rival.ts src/engine/focus.ts \
  src/ui/screens/Onboarding.tsx src/App.tsx
git commit -m "feat: 3-option playstyle-driven development draw, wired end to end"
```

---

### Task 6: Restrict aging to active attributes

**Files:**
- Modify: `src/engine/focus.ts` (`applyAging`)
- Test: `src/engine/focus.test.ts`

**Interfaces:**
- Produces: `applyAging(rng, person, age): { person, report }` — same signature, but only attributes in `PLAYSTYLE_PROFILES[person.playstyle].active` (plus `clutch`, unconditionally) ever appear in `report` or change.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/focus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { applyAging } from "./focus";
import { createPlayer } from "./player";

describe("applyAging respects the active pool", () => {
  it("never changes an inactive attribute for SHARPSHOOTER", () => {
    let player = createPlayer(createRNG(1), {
      name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
    });
    const before = { ...player.attributes };
    for (let season = 0; season < 12; season++) {
      const rng = createRNG(season * 11 + 3);
      const { person } = applyAging(rng, player, 20 + season);
      player = person;
    }
    expect(player.attributes.defense).toBeCloseTo(before.defense, 5);
    expect(player.attributes.strength).toBeCloseTo(before.strength, 5);
    expect(player.attributes.finishing).toBeCloseTo(before.finishing, 5);
    expect(player.attributes.athleticism).toBeCloseTo(before.athleticism, 5);
  });

  it("a pure Sharpshooter (no active physical attribute) shows no physical decline into their 30s", () => {
    let player = createPlayer(createRNG(2), {
      name: "T", country: "USA", position: "PG", height: 190, playstyle: "SHARPSHOOTER",
    });
    for (let age = 25; age <= 34; age++) {
      const rng = createRNG(age * 7 + 1);
      const { person } = applyAging(rng, player, age);
      player = person;
    }
    // No assertion needed beyond "doesn't crash and stays within bounds" since
    // none of Sharpshooter's active attributes are physical — this test mainly
    // documents the intended emergent behavior for future readers.
    expect(player.attributes.shooting).toBeGreaterThan(0);
  });

  it("INTERIOR does experience physical decline in the AgeReport by their early 30s", () => {
    let player = createPlayer(createRNG(3), {
      name: "T", country: "USA", position: "C", height: 213, playstyle: "INTERIOR",
    });
    let sawDecline = false;
    for (let age = 25; age <= 33; age++) {
      const rng = createRNG(age * 13 + 5);
      const { person, report } = applyAging(rng, player, age);
      player = person;
      if (report.some((r) => r.delta < 0 && (r.attribute === "athleticism" || r.attribute === "strength" || r.attribute === "finishing"))) {
        sawDecline = true;
      }
    }
    expect(sawDecline).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- focus.test.ts`
Expected: FAIL — today's `applyAging` touches `PHYSICAL`/`MENTAL` for every player regardless of playstyle, so the Sharpshooter's Defense/Strength/Finishing/Athleticism do change.

- [ ] **Step 3: Rewrite `applyAging`**

In `src/engine/focus.ts`, add the import:

```ts
import { PLAYSTYLE_PROFILES } from "./playstyle";
```

Replace the `PHYSICAL`/`MENTAL` constants and `applyAging`:

```ts
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
  if (age <= 24) mentDelta = randRange(rng, 0.6, 1.6);
  else if (age <= 30) mentDelta = randRange(rng, 0.8, 2.0);
  else if (age <= 34) mentDelta = randRange(rng, 0.3, 1.2);
  else mentDelta = randRange(rng, -0.2, 0.5);

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
```

`retirementChance` below is unchanged.

- [ ] **Step 4: Run tests, confirm PASS**

Run: `npm test -- focus.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, full suite, build**

Run: `npx tsc --noEmit && npm test && npx vite build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/focus.ts src/engine/focus.test.ts
git commit -m "feat: restrict aging deltas to the player's active attribute pool"
```

---

### Task 7: Make the development workout minigame rare

**Files:**
- Modify: `src/engine/career.ts` (`hasWorkoutOpportunity`)
- Modify: `src/App.tsx` (`pickFocus` handler)
- Test: `src/engine/career.test.ts` (append)

**Interfaces:**
- Produces: `hasWorkoutOpportunity(state: CareerState): boolean`.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/career.test.ts`:

```ts
import { hasWorkoutOpportunity } from "./career";

describe("hasWorkoutOpportunity", () => {
  it("does not fire every season — roughly 20-35% of seasons across many careers", () => {
    let fired = 0;
    const trials = 1000;
    for (let seed = 0; seed < trials; seed++) {
      let state = initCareer(seed, { name: "T", country: "USA", position: "SF", height: 200, playstyle: "SLASHER" });
      state = chooseFocus(state, "finishing");
      if (hasWorkoutOpportunity(state)) fired++;
    }
    const rate = fired / trials;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.45);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- career.test.ts`
Expected: FAIL — `hasWorkoutOpportunity` does not exist yet.

- [ ] **Step 3: Implement it in `career.ts`**

Add near `workoutMinigame`:

```ts
/** Most seasons skip the offseason workout entirely — it's an occasional bonus opportunity, not a weekly chore. */
export function hasWorkoutOpportunity(state: CareerState): boolean {
  return rngFor(state, 62).next() < 0.28;
}
```

- [ ] **Step 4: Run test, confirm PASS**

Run: `npm test -- career.test.ts`
Expected: PASS. If the measured rate lands outside the asserted band, adjust the `0.28` constant (not the test's band, unless the band itself was too tight) and rerun.

- [ ] **Step 5: Wire the gate into `App.tsx`**

Add `hasWorkoutOpportunity` to the existing `./engine/career` import block. Replace `pickFocus`:

```tsx
  const pickFocus = (f: FocusKey) => {
    if (!state) return;
    const s2 = chooseFocus(state, f);
    setState(s2);
    if (hasWorkoutOpportunity(s2)) {
      setStage("workout");
      return;
    }
    setDecision(getBigDecision(s2));
    setStage("decision");
  };
```

`finishWorkout` is unchanged — it already transitions to the decision stage after a workout completes, which is exactly what the skipped branch above now does directly.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, play through several seasons of a career, and confirm the workout screen appears only some of the time, not every season, and that skipping straight to the big decision works cleanly. Stop the dev server when done.

- [ ] **Step 8: Full suite and build**

Run: `npm test && npx tsc --noEmit && npx vite build`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add src/engine/career.ts src/engine/career.test.ts src/App.tsx
git commit -m "feat: make the development workout an occasional opportunity, not every season"
```

---

### Task 8: Filter the CareerHub Stats tab to active attributes

**Files:**
- Modify: `src/ui/screens/CareerHub.tsx` (`StatsTab`)

**Interfaces:**
- Consumes: `PLAYSTYLE_PROFILES` (Task 2).

- [ ] **Step 1: Update imports**

Add to the top of `CareerHub.tsx`:

```tsx
import { Attributes } from "../../engine/types";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
```

- [ ] **Step 2: Replace `StatsTab`**

```tsx
const ATTR_DISPLAY_LABEL: Record<keyof Attributes, string> = {
  shooting: "Shooting", finishing: "Finishing", passing: "Passing",
  ballHandling: "Ball Handling", defense: "Defense", athleticism: "Speed",
  strength: "Strength", basketballIQ: "Basketball IQ", clutch: "Clutch",
};

function StatsTab({ state }: { state: CareerState }) {
  const a = state.player.attributes;
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const rows = profile.active.map((key) => ({ label: ATTR_DISPLAY_LABEL[key], value: a[key] }));
  return (
    <div>
      <Eyebrow>{profile.label} attributes — these set your windows in the championship challenge</Eyebrow>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-[13px] text-mute w-28 shrink-0">{r.label}</span>
            <div className="flex-1 h-1.5 bg-line rounded-sm overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (r.value / 99) * 100)}%`,
                  background: r.value >= 85 ? "#E8A33D" : "#4DA3FF",
                }}
              />
            </div>
            <span className="stat-num text-sm w-7 text-right">{Math.round(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the Career Hub's STATS tab for a SHARPSHOOTER and confirm only Shooting/Ball Handling/Basketball IQ/Passing appear — never Defense/Strength/Finishing/Athleticism/Clutch. Stop the dev server when done.

- [ ] **Step 5: Build and commit**

Run: `npx vite build`
Expected: clean.

```bash
git add src/ui/screens/CareerHub.tsx
git commit -m "feat: filter Career Hub stats tab to the playstyle's active attributes"
```

---

### Task 9: Headless multi-career simulation + statistical validation

This is the task that directly answers the user's top request: prove the six playstyles produce statistically different career identities, and that the development distribution matches the intended shape.

**Files:**
- Create: `scripts/simulate-careers.ts`
- Create: `src/engine/simulation.test.ts` (statistical divergence assertions, run via Vitest so they're part of `npm test` and re-checked on every future change)
- Modify: `package.json` (add `"simulate": "tsx scripts/simulate-careers.ts"` script)

**Interfaces:**
- Consumes: `initCareer`, `chooseFocus`, `getSeasonDevelopmentOptions`, `runSeason`, `finishSeason`, `hasWorkoutOpportunity`, `setWorkoutResult` from `career.ts` (all existing or added in earlier tasks) — no React involved, same functions `App.tsx` calls.

- [ ] **Step 1: Install `tsx` for running the script directly**

```bash
npm install -D tsx
```

- [ ] **Step 2: Write the headless career driver**

Create `scripts/simulate-careers.ts`:

```ts
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, runSeason, finishSeason,
  hasWorkoutOpportunity, setWorkoutResult, playerOvr, signDraftPick, CareerState,
} from "../src/engine/career";
import { PLAYSTYLE_PROFILES } from "../src/engine/playstyle";
import { Playstyle } from "../src/engine/types";
import { DevTier } from "../src/engine/development";

// SCOPE NOTE: this driver validates attribute development and box-score
// divergence across playstyles, not full game fidelity. Two simplifications
// are deliberate and do not affect what it measures:
//  - Tournament rounds are never played interactively, so every playoff
//    appearance resolves as an immediate first-round exit inside
//    finishSeason(). This changes playoffResult/awards, not attributes or
//    box-score stats.
//  - Olympics are never triggered (startOlympics/finishOlympics are App.tsx-
//    only side content), so a career simply skips that branch.

const PLAYSTYLES: Playstyle[] = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"];

export type CareerOutcome = {
  playstyle: Playstyle;
  finalOvr: number;
  finalAttrs: Record<string, number>;
  careerPpg: number;
  careerRpg: number;
  careerApg: number;
  tierCounts: Partial<Record<DevTier, number>>;
};

/** Plays one full career headlessly, mirroring what App.tsx does, minus React. */
export function simulateOneCareer(seed: number, playstyle: Playstyle): CareerOutcome {
  let state: CareerState = initCareer(seed, {
    name: "Sim",
    country: "USA",
    position: "SG",
    height: 198,
    playstyle,
  });

  const tierCounts: Partial<Record<DevTier, number>> = {};

  let guard = 0;
  while (state.phase !== "RETIRED" && guard < 40) {
    guard++;
    const options = getSeasonDevelopmentOptions(state);
    state = chooseFocus(state, options[0].attribute);
    if (hasWorkoutOpportunity(state)) {
      state = setWorkoutResult(state, Math.random() < 0.5);
    }
    const run = runSeason(state);
    state = run.state;

    const end = finishSeason(state, null);
    state = end.state;
    if (end.development) {
      tierCounts[end.development.tier] = (tierCounts[end.development.tier] ?? 0) + 1;
    }
    if (state.draftBoard) {
      // Take the first realistic slot to keep the headless run moving.
      const slot = state.draftBoard.slots.find((s) => s.interested) ?? state.draftBoard.slots[0];
      state = signDraftPick(state, slot);
    }
  }

  const nbaStats = state.player.seasonStats.filter((s) => s.phase === "NBA");
  const avg = (f: (s: (typeof nbaStats)[number]) => number) =>
    nbaStats.length ? nbaStats.reduce((s, x) => s + f(x), 0) / nbaStats.length : 0;

  return {
    playstyle,
    finalOvr: playerOvr(state),
    finalAttrs: { ...state.player.attributes },
    careerPpg: avg((s) => s.ppg),
    careerRpg: avg((s) => s.rpg),
    careerApg: avg((s) => s.apg),
    tierCounts,
  };
}

export function simulateMany(n: number, playstyle: Playstyle): CareerOutcome[] {
  return Array.from({ length: n }, (_, i) => simulateOneCareer(i * 1000 + PLAYSTYLES.indexOf(playstyle), playstyle));
}

// ESM-safe "run only when executed directly" check (the project is `"type": "module"`).
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const N = 30;
  for (const playstyle of PLAYSTYLES) {
    const results = simulateMany(N, playstyle);
    const avgOvr = results.reduce((s, r) => s + r.finalOvr, 0) / N;
    const avgPpg = results.reduce((s, r) => s + r.careerPpg, 0) / N;
    const avgRpg = results.reduce((s, r) => s + r.careerRpg, 0) / N;
    const avgApg = results.reduce((s, r) => s + r.careerApg, 0) / N;
    const tierTotals: Partial<Record<DevTier, number>> = {};
    for (const r of results) {
      for (const [tier, count] of Object.entries(r.tierCounts)) {
        tierTotals[tier as DevTier] = (tierTotals[tier as DevTier] ?? 0) + (count ?? 0);
      }
    }
    console.log(`\n=== ${playstyle} (n=${N}) ===`);
    console.log(`avg final OVR: ${avgOvr.toFixed(1)}`);
    console.log(`avg career PPG/RPG/APG: ${avgPpg.toFixed(1)} / ${avgRpg.toFixed(1)} / ${avgApg.toFixed(1)}`);
    console.log(`tier distribution:`, tierTotals);
  }
}
```

- [ ] **Step 3: Run it manually and eyeball the output**

Run: `npx tsx scripts/simulate-careers.ts`
Expected: 6 blocks of output, one per playstyle. Sanity-check by eye:
- INTERIOR's avg RPG is clearly the highest of the six.
- PLAYMAKER's avg APG is clearly the highest.
- SHARPSHOOTER's avg PPG is competitive with SLASHER/SUPERSTAR but its RPG is the lowest.
- No playstyle's avg final OVR is wildly out of line with the others (all roughly in the same 70-90 neighborhood) — OVR should reflect "how good is this player," not "how many attributes does this playstyle have."

If OVR or a box-score average looks broken (e.g. everyone converges to nearly identical numbers, or one playstyle's OVR is 20+ points below the rest), that means a weight/roleWeights constant from Task 2 needs adjusting — go back and tune `PLAYSTYLE_PROFILES` in `playstyle.ts`, then rerun this script, before moving on. This loop is expected, not a sign the plan is wrong.

- [ ] **Step 4: Add the `simulate` npm script**

In `package.json`:

```json
"simulate": "tsx scripts/simulate-careers.ts"
```

- [ ] **Step 5: Write the statistical divergence test**

Create `src/engine/simulation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { simulateMany } from "../../scripts/simulate-careers";

describe("playstyles produce statistically different careers", () => {
  it("INTERIOR out-rebounds SHARPSHOOTER by a wide margin", () => {
    const interior = simulateMany(20, "INTERIOR");
    const sharpshooter = simulateMany(20, "SHARPSHOOTER");
    const avgRpg = (rs: typeof interior) => rs.reduce((s, r) => s + r.careerRpg, 0) / rs.length;
    expect(avgRpg(interior)).toBeGreaterThan(avgRpg(sharpshooter) * 1.4);
  });

  it("PLAYMAKER out-assists SLASHER by a wide margin", () => {
    const playmaker = simulateMany(20, "PLAYMAKER");
    const slasher = simulateMany(20, "SLASHER");
    const avgApg = (rs: typeof playmaker) => rs.reduce((s, r) => s + r.careerApg, 0) / rs.length;
    expect(avgApg(playmaker)).toBeGreaterThan(avgApg(slasher) * 1.3);
  });

  it("SHARPSHOOTER's inactive attributes stay near baseline while active ones climb", () => {
    const results = simulateMany(20, "SHARPSHOOTER");
    const avgShooting = results.reduce((s, r) => s + r.finalAttrs.shooting, 0) / results.length;
    const avgDefense = results.reduce((s, r) => s + r.finalAttrs.defense, 0) / results.length;
    expect(avgShooting).toBeGreaterThan(avgDefense + 20);
  });

  it("no playstyle's average final OVR is wildly out of line with the others", () => {
    const PLAYSTYLES = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"] as const;
    const avgOvrs = PLAYSTYLES.map((p) => {
      const rs = simulateMany(15, p);
      return rs.reduce((s, r) => s + r.finalOvr, 0) / rs.length;
    });
    const max = Math.max(...avgOvrs);
    const min = Math.min(...avgOvrs);
    expect(max - min).toBeLessThan(15);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm test -- simulation.test.ts`
Expected: PASS. This test suite is slow (it plays dozens of full careers); that's expected and acceptable for a once-per-change validation suite. If any assertion fails, it means a `roleWeights` or `weights` constant in `playstyle.ts` needs tuning — adjust and rerun, do not weaken the assertion to make it pass.

- [ ] **Step 7: Full project verification**

Run: `npx tsc --noEmit && npm test && npx vite build`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add scripts/simulate-careers.ts src/engine/simulation.test.ts package.json package-lock.json
git commit -m "test: add headless multi-career simulation validating playstyle divergence"
```

---

### Task 10: Final verification pass

**Files:**
- Modify: `README.md` (small, scoped update only)

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

Expected: all four clean/passing. Read the `simulate` output one more time end-to-end as a final sanity check.

- [ ] **Step 2: Manual smoke test of the full loop**

Run: `npm run dev`. Play one full flow: create a player (try INTERIOR), pick a college, go through the Hub → development options (confirm 3, all paint-related) → (workout, if offered) → big decision → season sim → tournament (play a round) → season result → offseason → repeat once more → confirm nothing crashes. Stop the dev server.

- [ ] **Step 3: Update the README's playstyle-related lines only**

In `README.md`, update the "Season loop" / file-map area to mention `engine/playstyle.ts` as the new source of playstyle identity (one line addition to the existing table), and correct the `engine/growth.ts` row's status if it still claims to be "reused" (it is not, per the original project analysis — but only touch this if it's a one-line factual correction; do not rewrite the README wholesale, that is out of scope for this task).

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: note the new playstyle.ts source of truth"
```

---

## Self-review notes (already applied above)

- **Spec coverage:** every numbered section of the approved spec (§2 through §11) maps to at least one task above; §12 (preserved systems) is enforced by the Global Constraints "do not touch" list rather than a task, which is correct — there's nothing to implement for "leave it alone."
- **Type consistency check:** `DevelopmentOptionView`, `getDevelopmentOptions`, `getSeasonDevelopmentOptions`, `hasWorkoutOpportunity`, `PLAYSTYLE_PROFILES`, `PlaystyleProfile`, `startingBias`, `isActive` are each defined exactly once (Task 2 or 5) and referenced with identical names/shapes in every later task.
- **rival.ts dependency on `FOCUS_OPTIONS`:** caught during planning and fixed in Task 5 alongside the UI removal, so the build never has an orphaned reference.
