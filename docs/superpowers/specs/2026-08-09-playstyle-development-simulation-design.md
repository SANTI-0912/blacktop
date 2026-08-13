# Playstyle-Driven Development & Simulation — Design Spec

Status: approved decisions from user, pending final doc sign-off
Date: 2026-08-09
Scope owner: gameplay only (`engine/` + the 4-5 UI screens listed below). No refactor of unrelated systems.

## 1. Problem statement

Today `Playstyle` (SCORER/PHYSICAL/MID_RANGE/PLAYMAKER/TWO_WAY/ATHLETIC) is close to cosmetic:

- Season development (`focus.ts::FOCUS_OPTIONS`) shows **all 8 trainable attributes** every season regardless of playstyle. A Sharpshooter-type build is asked "+3 Defense?" exactly like a Two-Way build.
- `simulation.ts::weightedAttributeScore` and `overall.ts::computeOverall` sum **all 9 attributes**, giving on-brand ones a 1.6-2.0x multiplier but still counting off-brand ones at 1.0x. A low, never-trained Defense on a Sharpshooter quietly drags down `performanceScore`/OVR.
- Development tiers (`development.ts::TIER_BUDGET`) regularly hand out +9 to +22 in a single season, so "rare" doesn't feel rare.
- The offseason workout minigame fires every single season.

Goal: make `Playstyle` the actual spine of career identity — it defines a closed pool of attributes the player can ever develop or that ever matter to their on-court simulation, and everything else (contracts, awards, rival comparison, career summary) inherits that identity for free because it already reads from OVR / performanceScore / box-score stats.

## 2. Playstyle taxonomy (full replacement)

Replace the `Playstyle` union in `engine/types.ts`:

```ts
export type Playstyle =
  | "SHARPSHOOTER"
  | "PLAYMAKER"
  | "SUPERSTAR"
  | "SLASHER"
  | "TWO_WAY"
  | "INTERIOR";
```

No aliasing, no legacy names kept. Every usage site (`player.ts`, `overall.ts`, `simulation.ts`, `Creation.tsx`, `rival.ts`'s random pick, any `Record<Playstyle, ...>` table) is updated in the same pass — TypeScript's exhaustiveness checking on the union surfaces every site that needs it.

### 2.1 Rebounding — decision: no new attribute (Option A)

`Attributes` stays exactly as-is (9 fields, no `rebounding` field added). "Rebounding" is a **career statistic** (RPG), not a trainable attribute — consistent with the existing distinction between `Attributes` (capability) and `SeasonStats` (outcome). INTERIOR's rebounding dominance comes entirely from:

- Strength + Athleticism being **active, high-weight** attributes for INTERIOR (so they actually get developed), and
- a per-playstyle `roleWeights.rebounding` multiplier (see §5) that scales how hard the existing `reboundSkill` formula in `simulation.ts` converts those attributes into RPG.

No change to the box-score `rpg` formula's *inputs* — only to which playstyle gets a high `roleWeights.rebounding` multiplier, which is the exact mechanism `simulation.ts` already uses for this purpose today (`PLAYSTYLE_TABLE[playstyle].rebounding`).

### 2.2 Clutch — decision: excluded entirely from the new system

`clutch` remains a normal field on `Attributes` and keeps functioning exactly as it does today:

- Moved only by existing `decisions.ts` / `events.ts` / `threads.ts` effect payloads (unchanged).
- Read directly by `challenge.ts` (late-round window bonus) and `minigameLibrary.ts::modsFor` (late-round minigame leniency) — unchanged call sites, unchanged behavior.

It is **not** part of any playstyle's `active` list, not part of the development-option pool, and not part of `performanceScore`/OVR weighting under the new system. It simply keeps doing what it already does, off to the side.

## 3. Playstyle profile table

New file `engine/playstyle.ts`, single source of truth consumed by creation UI, development pool, aging, and simulation.

Weight scale: **VERY HIGH = 5, HIGH = 4, MEDIUM = 3, SUPPORT = 2**.

| Playstyle | Active attributes (dev-pool / OVR weight) | Inactive | `roleWeights` emphasis |
|---|---|---|---|
| SHARPSHOOTER | Shooting 5 · Ball Handling 4 · Basketball IQ 4 · Passing 3 | Defense, Strength, Finishing, Athleticism | scoring↑, rebounding↓, defenseImpact↓ |
| PLAYMAKER | Passing 5 · Ball Handling 5 · Basketball IQ 4 · Shooting 3 | Strength, Defense, Finishing, Athleticism | playmaking↑↑, rebounding↓ |
| SUPERSTAR | Finishing 5 · Athleticism 5 · Passing 4 · Basketball IQ 4 · Strength 4 · Shooting 3 · Ball Handling 3 | Defense | scoring↑, playmaking↑, rebounding→moderate (broadest profile — 7 of 8 non-clutch attributes active) |
| SLASHER | Finishing 5 · Athleticism 5 · Strength 4 · Ball Handling 3 | Shooting, Passing, Defense, Basketball IQ | scoring↑ (rim), rebounding→moderate, playmaking↓ |
| TWO_WAY | Defense 5 · Basketball IQ 5 · Athleticism 4 · Strength 4 · Finishing 3 | Shooting, Passing, Ball Handling | defenseImpact↑↑, scoring/playmaking→moderate |
| INTERIOR | Finishing 5 · Strength 5 · Defense 4 · Basketball IQ 3 · Athleticism 3 | Shooting, Passing, Ball Handling | rebounding↑↑, defenseImpact↑, scoring→moderate (interior only), playmaking↓ |

Exact `roleWeights` numbers (scoring/playmaking/rebounding/defenseImpact, same 4-field shape as today's `PLAYSTYLE_TABLE`) are tuned during implementation and validated against the headless simulation sweep (§8) before being considered final — the table above states direction/emphasis, not literal constants.

**Breadth vs. depth is intentional.** SUPERSTAR has 7 active attributes against 4-5 for the other five playstyles. Because the weighted draw in §4 spreads its 3 development slots across a wider competing pool, any single Superstar attribute develops somewhat more slowly per season than, say, a Sharpshooter's Shooting (which competes against only 3 rivals for the draw). This is the mechanical expression of "broadest profile, not fastest specialist" — a Superstar career ends up strong across many stats rather than historically dominant in one, which is the requested fantasy. No corrective factor is applied to equalize this; it is the intended trade-off.

`computeOverall()` and `weightedAttributeScore()` (performanceScore) both sum **only** each playstyle's active attributes × weight. Inactive attributes are excluded from the sum entirely — not down-weighted, not read. A Sharpshooter's Defense value cannot appear anywhere in OVR or performanceScore math.

Starting attributes at creation (`player.ts::baseAttributes`) apply bias proportional to the same weight table, scaled to a reasonable creation-time bonus (roughly weight × 2.4, i.e. VERY HIGH ≈ +12, SUPPORT ≈ +5) — only to active attributes. Inactive attributes start at the existing flat floor (45 + small noise) and are never biased up or down.

## 4. Development pool: exactly 3 options per season

Replaces `focus.ts::FOCUS_OPTIONS` (the static 8-attribute list) and the screen that renders it.

**Generation** (`development.ts`, new function `getDevelopmentOptions(state): DevelopmentOptionView[]`):

1. Look up `PLAYSTYLE_PROFILES[player.playstyle].active` (4-7 entries depending on playstyle, always ≥ 4 so 3-of-N without replacement is always possible).
2. Weighted sample **3 distinct attributes without replacement**, using the table's weight column.
3. Apply a soft recency cooldown: the attribute chosen (`state.focus`) in the immediately preceding season gets its weight multiplied by ~0.35 for this draw (same pattern already used by `recentMinigames`/`recentEventIds` elsewhere in the engine — not a hard ban, just deweighted so the same attribute can still return but doesn't dominate two years running).
4. Each option is shown with a static preview range **"+2 → +4"** (the NORMAL-tier band) — the real magnitude (which tier actually lands) is rolled at season end exactly as today, preserving the existing pick-now / reveal-later structure that already works.

**UI:** `Onboarding.tsx::FocusSelect` is renamed `DevelopmentSelect` and renders these 3 options instead of the current static 8. Same screen position in the flow (right after entering the hub, before the workout gate). `App.tsx` updates the one import/usage site.

**State:** `CareerState.focus` keeps its existing role (chosen attribute for the season) and existing type (`FocusKey = keyof Attributes`, unchanged). Add one new field, `recentDevAttrs: FocusKey[]` (last chosen, capped length 1-2), for the cooldown in step 3.

## 5. Tier recalibration (`development.ts`)

Keep all 7 existing tiers, rescale budgets:

| Tier | Old range | New range |
|---|---|---|
| REGRESSION | -6 .. -2 | -4 .. -1 |
| POOR | 0 .. 2 | 0 .. 1 |
| NORMAL | 3 .. 5 | **2 .. 4** |
| GOOD | 6 .. 8 | **5 .. 6** |
| BREAKOUT | 9 .. 12 | **7** |
| RARE_BREAKOUT | 13 .. 16 | **8 .. 9** |
| LEGENDARY | 17 .. 22 | **10 .. 13** |

`rollTier()` weight table is retuned (same age/performance/confidence-driven shape as today) so that, for a prime-age player with average performance:

- NORMAL ≈ 55-65%
- GOOD ≈ 15-20%
- POOR / REGRESSION ≈ remaining baseline (age-dependent, same as today)
- BREAKOUT ≈ 5-8%
- RARE_BREAKOUT ≈ 1.5-3%
- LEGENDARY < 0.5%

Actual weight constants are tuned and verified against the headless sweep (§8) rather than hand-guessed — this mirrors how the existing codebase already calibrates (see comments in `simulation.ts`, `awards.ts` referencing measured distributions).

**Secondary attribute picks:** each season also nudges 2-3 non-primary attributes for texture (existing behavior). These now draw **only from the playstyle's active pool** (weighted by the same table, excluding whichever attribute was already picked as primary), replacing today's `pickAttribute()` which draws from all 9 attributes via `STYLE_AFFINITY`. `STYLE_AFFINITY` is removed; `playstyle.ts`'s weight table is the single source now.

**REGRESSION tier:** attribute losses are drawn from the playstyle's active pool only (today they're hardcoded to `PHYSICAL = [athleticism, strength, finishing]` regardless of playstyle, which would violate "inactive attributes never move" for e.g. a Sharpshooter where none of those three are active). See §6 for exactly which active attributes are eligible.

## 6. Aging restricted to active attributes (`focus.ts::applyAging`)

Two fixed pools already exist conceptually; make them explicit and intersect with the playstyle's active set before applying any delta:

```
PHYSICAL_DECLINE_POOL = [athleticism, strength, finishing, defense]
SKILL_GROWTH_POOL     = [basketballIQ, passing, shooting, ballHandling]
```

(`defense` is added to the decline pool and `ballHandling` to the growth pool — both were previously untouched by aging at all, an existing gap; classifying them this way is a reasonable default and is called out here as an explicit, reviewable assumption rather than a silent fix.)

For each player: `physicalActive = intersect(PHYSICAL_DECLINE_POOL, active)`, `skillActive = intersect(SKILL_GROWTH_POOL, active)`. Only those receive the existing age-curve deltas; everything outside the active set is untouched — never appears in `AgeReport`, never moves. `clutch` is aged as today (small late-career drift), independent of this pool split, since it's outside the playstyle system entirely (§2.2).

Concretely: a pure SHARPSHOOTER (no active physical attribute at all) experiences **zero** physical decline from aging — an intentional, identity-consistent emergent result ("shooters age well"), not a bug.

## 7. Development workout minigame — made rare

`career.ts` gains a gate, e.g. `hasWorkoutOpportunity(state): boolean`, rolled once per season (~25-30%, tuned during implementation) via the existing `rngFor` pattern. `App.tsx`'s `pickFocus` handler checks this: if true, proceed to the `workout` stage exactly as today; if false, skip straight to `getBigDecision` + `decision` stage (the same transition `finishWorkout` already performs after a workout completes).

No change to which attribute the win bonus targets — `development.ts::applyWorkout` already adds its bonus to `state.focus`, which is now guaranteed to be an active attribute by construction (§4). No change to minigame mechanics themselves (`Simon`, `HotZone`, `ClutchBoard` keep working exactly as they do — Tic-Tac-Toe stays as one of the possible workout mechanics per the user's own note that it's fine here).

## 8. Simulation & OVR reweighting (`overall.ts`, `simulation.ts`)

- `computeOverall(attrs, playstyle)`: iterate `PLAYSTYLE_PROFILES[playstyle].active` only, weighted sum, same `*1.06` upward curve and `clamp(40, 99)` as today. Inactive attributes excluded from the loop entirely (not summed at weight 0 — literally not iterated).
- `weightedAttributeScore()` (drives `performanceScore` in `simulation.ts`): same restriction, active-only weighted sum.
- Per-category box-score formulas (`ppg`, `apg`, `rpg`, `spg`, `bpg`, `fgPct`, `tpPct`, `ftPct`) are **unchanged in shape** — they already read specific attributes directly (e.g. `apg` from `passing`, `rpg` from `strength`+`athleticism`) rather than from the generic blended score, so they naturally differentiate playstyles without further edits. Only the `roleWeights` multiplier table they read (`scoring`/`playmaking`/`rebounding`/`defenseImpact`) moves from the old `PLAYSTYLE_TABLE` to the new `playstyle.ts` profiles, retuned per §3.
- `PLAYSTYLE_TABLE` and `STYLE_AFFINITY` (both in `player.ts` / `development.ts` today) are deleted, fully superseded by `playstyle.ts`.

This is the mechanism that satisfies "a Sharpshooter's low Defense must never drag down performance/OVR": Defense is not read at all for that playstyle's performanceScore or OVR. It still naturally produces a low `spg` (steals) box-score line via the direct formula — that is a correct, honest reflection of the build, not a penalty on overall quality.

## 9. UI changes

- **`Creation.tsx`**: the hardcoded `STYLES` array is replaced by data sourced from `playstyle.ts` (label, one-line tagline, short "core" attribute list for display). Same screen layout and interaction, new copy per the 6 new archetypes.
- **`Onboarding.tsx`**: `FocusSelect` → `DevelopmentSelect`, renders exactly 3 options from `getDevelopmentOptions()` instead of 8 static ones. Preview text is the static "+2 → +4" band (§4).
- **`CareerHub.tsx`** (Stats tab): filters the attribute bar list to `PLAYSTYLE_PROFILES[playstyle].active` only. Inactive attributes are never rendered here (confirmed decision — not just hidden from development, hidden from the whole stats sheet). `clutch` is likewise not shown (it's outside every playstyle's active list per §2.2) — called out explicitly since it's a visible behavior change from today's "all 9 attributes always shown."
- **`SeasonComplete.tsx` / `Offseason` age report**: attribute delta lists naturally only ever contain active attributes now, since nothing else moves (§5, §6) — no filtering logic needed there beyond what already exists (it already only lists attributes present in the `changes`/`report` arrays).

No changes to navigation/stage flow beyond the one new conditional branch in §7.

## 10. Files

**New:**
- `src/engine/playstyle.ts` — `PLAYSTYLE_PROFILES` (active list + weights + roleWeights + creation copy), single source of truth.

**Modified:**
- `src/engine/types.ts` — `Playstyle` union replaced.
- `src/engine/player.ts` — starting-attribute bias sourced from `playstyle.ts`; `PLAYSTYLE_TABLE` removed.
- `src/engine/overall.ts` — `computeOverall` active-only weighting.
- `src/engine/simulation.ts` — `weightedAttributeScore` active-only weighting; `roleWeights` sourced from `playstyle.ts`.
- `src/engine/development.ts` — tier budgets/probabilities recalibrated; `getDevelopmentOptions()` added; secondary-pick and regression pools restricted to active attributes; `STYLE_AFFINITY` removed.
- `src/engine/focus.ts` — `FOCUS_OPTIONS` removed; `applyAging` restricted to active pool per §6.
- `src/engine/career.ts` — workout-opportunity gate; wiring for `getDevelopmentOptions`; `recentDevAttrs` field on `CareerState`.
- `src/ui/screens/Onboarding.tsx` — `FocusSelect` → `DevelopmentSelect`.
- `src/ui/screens/Creation.tsx` — style copy sourced from `playstyle.ts`.
- `src/ui/screens/CareerHub.tsx` — Stats tab filtered to active attributes.
- `src/App.tsx` — rename import, add workout-gate branch.
- `src/engine/index.ts` — barrel gains `export * from "./playstyle"`.
- `package.json` — add `vitest` devDependency + `test` script (no test runner currently installed).

**Explicitly not touched:** `draft.ts`, `tournament.ts`, `playoffs.ts`, `teams.ts`, `contracts.ts`, `bigdecision.ts`, `challenge.ts`, `minigameLibrary.ts`, `ui/minigames/rounds.tsx`, `events.ts`, `threads.ts`, `awards.ts`, `history.ts`, `rival.ts` (inherits the new system automatically — it already calls the same `rollDevelopment`/`computeOverall`/`simulateSeasonStats` functions the player uses), `schedule.ts`, `identity.ts`, `countries.ts`, `rng.ts`, `growth.ts` (already-dead code, out of scope for this task).

## 11. Testing plan

No test framework is currently installed. Add **Vitest** (lightweight, Vite-native) as a devDependency and a `test` script.

Unit tests (`src/engine/*.test.ts`):

- `getDevelopmentOptions()` always returns exactly 3 entries, all distinct.
- Every returned option's attribute is in the current playstyle's active list — inactive attributes never appear, across all 6 playstyles, sampled many times.
- `computeOverall` / `weightedAttributeScore` for a synthetic player: raising an inactive attribute to 99 produces **zero** change in OVR/performanceScore; raising an active attribute changes it.
- Tier distribution: run `rollDevelopment` a large N of times at prime age/average performance; assert NORMAL is the modal outcome and roughly matches the target band (§5), GOOD less frequent, BREAKOUT/RARE_BREAKOUT/LEGENDARY strictly decreasing and below defined ceilings.
- Applied development deltas for NORMAL tier fall in [2,4] the overwhelming majority of the time (statistical assertion, not exact-every-time).
- `applyAging` never changes an inactive attribute; a playstyle with no active physical attribute shows zero physical decline over many simulated seasons.
- Workout-opportunity gate fires at roughly the tuned rate, not every season, across many simulated seasons.
- Workout win bonus only ever targets `state.focus`, which is always active by construction.
- Two different playstyles run through N simulated seasons each produce statistically different attribute profiles and box-score emphasis (e.g. INTERIOR's average RPG meaningfully exceeds SHARPSHOOTER's; SHARPSHOOTER's average 3P-relevant shooting stat meaningfully exceeds INTERIOR's).

Headless multi-career script (`scripts/simulate-careers.ts` or similar, run via `tsx`/`vitest` — exact mechanism decided during implementation): simulates full careers per playstyle (reusing `initCareer`/`runSeason`/`finishSeason` the same way `App.tsx` does, no React involved) and prints/asserts:

- Final attribute distributions per playstyle (active attributes should trend high, inactive should stay near baseline).
- Tier frequency histogram matching the target shape in §5.
- Per-playstyle career stat lines diverge in the expected direction (Sharpshooter high FG%/3PT-driven scoring, Interior high RPG, Playmaker high APG, Two-Way high SPG/BPG, Slasher high finishing-driven scoring, Superstar broad across categories).

`tsc --noEmit` and `vite build` are run at the end and must stay clean, matching current project health.

## 12. Explicitly preserved (no changes)

NCAA, Draft, NBA phase transitions, Olympics, contracts/offers, the 30 real NBA teams + real logos, tournament bracket + gauntlet minigames, rivalry system, random events, event consequences (threads), season conclusion screens, career statistics/summary, retirement, overall navigation/stage machine shape. The only new stage-flow branch is the workout-opportunity skip in §7.
