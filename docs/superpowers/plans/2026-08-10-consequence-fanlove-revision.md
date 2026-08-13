# Consequence Depth, Fan Love, and League-Timing Revision Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four playtest-identified problems in the just-shipped season-immersion feature — (1) mini-decision consequences read as stat transactions instead of career story, (2) narrative decisions silently grant basketball-skill attributes that belong exclusively to the development system, (3) Fan Love reads as a renamed copy of reputation and is incoherent with career status, (4) "Around the League" news can reveal a rival's resolved playoff outcome before the player has played their own playoffs — while removing `coachTrust`, a hidden progression stat the player can't see or reason about, entirely from the game.

**Architecture:** No new UI screens and no changes to the locked development-roll mechanic, `TIER_BUDGET`, or `playstyle.ts`. This is a content-and-formula revision: (a) a type-level allowlist (`NarrativeEffects`) that makes the compiler enforce "no skill attributes from narrative decisions," (b) a full content pass over `events.ts`/`bigdecision.ts`/`threads.ts` applying that allowlist and deepening consequence text, (c) a three-layer Fan Love model (baseline target + big-moment spikes + curated personal-decision nudges) replacing the current blanket "echoes reputation" derivation, and (d) moving WHEN (not when it's computed) the rival's resolved season outcome is revealed to the player, from `runSeason` (pre-playoffs) to `finishSeason` (post-playoffs).

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- `src/engine/playstyle.ts`'s weight values are locked — never touched by this plan.
- The locked-development-reward mechanic (`rollDevelopment`'s `locked` param, `getDevelopmentOptions`'s from/to/delta cards, `TIER_BUDGET`) is never touched — Fan Love and narrative effects are a completely separate system from attribute development.
- **Coach Trust is removed entirely** — not renamed, not hidden differently, gone as a concept from the game (`Hidden.coachTrust`, every formula that reads it, every event/decision/thread effect that touches it, and the visible "Coach trust" UI card).
- **No narrative decision may grant a basketball-skill attribute.** `shooting`, `finishing`, `passing`, `ballHandling`, `defense`, `basketballIQ`, `clutch` are reserved exclusively for the development system. `athleticism`/`strength` may be granted by an event/thread/CallOption **only when the delta is a direct physical/sporting consequence of that specific decision** (an injury got worse, a conditioning-focused offseason made you harder to move) — never as a generic reward attached to a narrative/personal choice just because the type technically permits it. This is enforced at the type level (a new `NarrativeEffects` type excludes the 7 skill attributes) but the *content* still requires this editorial judgment call per event — apply it deliberately, not mechanically.
- **Not every consequence needs a numeric effect.** A purely narrative consequence (a memorable line with `effects: {}`) is a valid, encouraged outcome — especially for personal/social decisions. Do not turn every option into a stat transaction.
- Fan Love's three layers stay structurally separate: (1) a baseline **target** computed once per season from role/awards/tenure that Fan Love eases toward — never set directly; (2) large, fixed, immediate **big-moment spikes** (championship, first MVP, first All-Star, first All-NBA, Olympic gold) applied on top, sized so they're felt the season they happen regardless of where the baseline sits; (3) a curated, hand-authored handful of **personal-decision** nudges on events genuinely about fan perception (never a blanket auto-derivation from reputation).
- `decisions.ts`'s `DECISIONS` bank is invisible to the player (used only for the rival's own off-screen simulation — confirmed by its own header comment: "The player only ever sees `prompt` and each option's `label`"). It is exempt from the `NarrativeEffects` skill-attribute restriction (its attribute grants are the rival's balance mechanism, never seen by the player) — only `coachTrust` is removed from it, forced by the type change.
- Keep the deterministic seeded-RNG pattern throughout — never `Math.random()`.
- `tsc --noEmit`, `npm test`, `npx vite build`, and `npm run simulate` must all be clean at the end of this plan (the one pre-existing, already-reported `simulation.test.ts` OVR-spread failure is a known, human-routed balance observation from the prior plan — unaffected by this one, not something to fix here).
- Every event/CallOption id, `label`, `detail`, `when`, `category`, `title`, `once`, `weight`, and `thread` stays exactly as it is today unless a task explicitly says otherwise. Only `result` and `effects` change (plus the one `when` rewrite in Task 3 forced by removing `coachTrust` from `EventContext`).

---

## File Structure

**New:**
- `src/engine/fanlove.ts` — pure Fan Love baseline-target calculation (`computeFanLoveTarget`, `seasonsOnCurrentTeam`). Kept separate from `career.ts` so the formula is independently testable and `career.ts` doesn't grow further.

**Modified:** `src/engine/types.ts`, `src/engine/player.ts`, `src/engine/development.ts`, `src/engine/overall.ts`, `src/engine/challenge.ts`, `src/engine/career.ts`, `src/engine/events.ts`, `src/engine/bigdecision.ts`, `src/engine/threads.ts`, `src/engine/decisions.ts`, `src/engine/rival.ts`, `src/ui/screens/CareerHub.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/ui/components/FanLove.tsx`.

**Not touched:** `playstyle.ts`, `TIER_BUDGET`/locked-roll internals in `development.ts` beyond the new `ATTR_FLAVOR` addition, `App.tsx`, `SeasonFlow.tsx`, `PlayerStatusPanel.tsx`, the tournament/gauntlet minigame files beyond `challenge.ts`'s one-line `coachTrust` removal, `awards.ts`, `simulation.ts`, `focus.ts` (aging system), `history.ts`, `identity.ts`, `schedule.ts`, `teams.ts`, `playoffs.ts`.

---

### Task 1: Remove Coach Trust from the type system and every formula

**Files:**
- Modify: `src/engine/types.ts` (`Hidden`)
- Modify: `src/engine/player.ts` (`baseHidden`)
- Modify: `src/engine/development.ts` (`rollTier`, `rollDevelopment`, `getDevelopmentOptions`)
- Modify: `src/engine/overall.ts` (`determineRole`)
- Modify: `src/engine/challenge.ts` (`ChallengeInput`, `buildChallenge`)
- Modify: `src/engine/career.ts` (`refreshRoster`, `currentRoundChallenge`, `buildEventContext`)
- Modify: `src/engine/events.ts` (`EventContext`)
- Modify: `src/ui/screens/CareerHub.tsx` (TeamTab's "Coach trust" card)
- Test: `src/engine/development.test.ts` (fix the one helper that sets `coachTrust`), `src/engine/overall.test.ts` if it exists (check and fix any `determineRole` call sites), `src/engine/career.test.ts` (no `coachTrust` references expected, but grep to confirm)

**Interfaces:**
- Produces: `Hidden` with no `coachTrust` field. `determineRole(playerOvr, supportingOvr)` — two-arg, no third `coachTrust` param. `rollTier(rng, age, performance, confidence)` — four-arg. `buildChallenge`'s `ChallengeInput` has no `coachTrust` field.

- [ ] **Step 1: Remove `coachTrust` from `Hidden`**

In `src/engine/types.ts`, delete the `coachTrust: number; // 0-100` line from the `Hidden` type (it currently sits between `confidence` and `reputation`).

- [ ] **Step 2: Remove it from `baseHidden`**

In `src/engine/player.ts`, delete the `coachTrust: randInt(rng, 45, 60),` line from `baseHidden()`.

- [ ] **Step 3: Remove it from `rollTier`'s boost formula**

In `src/engine/development.ts`, change:

```ts
function rollTier(rng: RNG, age: number, performance: number, confidence: number, coachTrust: number): DevTier {
  const young = age <= 23;
  const prime = age >= 24 && age <= 28;
  const old = age >= 31;

  const boost = (performance - 0.7) * 2 + (confidence - 50) / 90 + (coachTrust - 50) / 130;
```

to:

```ts
function rollTier(rng: RNG, age: number, performance: number, confidence: number): DevTier {
  const young = age <= 23;
  const prime = age >= 24 && age <= 28;
  const old = age >= 31;

  const boost = (performance - 0.7) * 2 + (confidence - 50) / 90;
```

The rest of `rollTier` (the weight table, every threshold) is unchanged — only the `coachTrust` term is dropped from `boost`.

- [ ] **Step 4: Update `rollTier`'s two call sites and `rollPositiveTier`**

Still in `development.ts`:

- `rollPositiveTier(rng, age, performance, confidence, coachTrust)` → `rollPositiveTier(rng, age, performance, confidence)`, and its internal call `rollTier(rng, age, performance, confidence, coachTrust)` → `rollTier(rng, age, performance, confidence)`.
- In `rollDevelopment`, change `const { confidence, coachTrust, developmentRate } = person.hidden;` to `const { confidence, developmentRate } = person.hidden;`, and its call `rollTier(rng, age, performance, confidence, coachTrust)` → `rollTier(rng, age, performance, confidence)`.
- In `getDevelopmentOptions`, change `const { confidence, coachTrust, developmentRate } = player.hidden;` to `const { confidence, developmentRate } = player.hidden;`, and its call `rollPositiveTier(rng, age, lastPerformance, confidence, coachTrust)` → `rollPositiveTier(rng, age, lastPerformance, confidence)`.

- [ ] **Step 5: Remove it from `determineRole`**

In `src/engine/overall.ts`, change:

```ts
export function determineRole(playerOvr: number, supportingOvr: number, coachTrust: number): Role {
  const edge = playerOvr - supportingOvr + (coachTrust - 50) * 0.12;
```

to:

```ts
export function determineRole(playerOvr: number, supportingOvr: number): Role {
  const edge = playerOvr - supportingOvr;
```

The FRANCHISE/STAR/STARTER/ROTATION/BENCH thresholds below are unchanged.

- [ ] **Step 6: Remove it from `buildChallenge`**

In `src/engine/challenge.ts`, remove `coachTrust: number;` from the `ChallengeInput` type. In `buildChallenge`, remove `coachTrust` from the destructuring line, and change:

```ts
const skillRelief = (playerOvr - 70) / 100 + (seasonPerformance - 0.7) * 0.25 + (coachTrust - 50) / 400;
```

to:

```ts
const skillRelief = (playerOvr - 70) / 100 + (seasonPerformance - 0.7) * 0.25;
```

Nothing else in `challenge.ts` (round count, difficulty tiers, the minigame pool) changes.

- [ ] **Step 7: Update `career.ts`'s three call sites**

In `src/engine/career.ts`:

- `refreshRoster`: change `const role = determineRole(ovr, support, state.player.hidden.coachTrust);` to `const role = determineRole(ovr, support);`.
- `currentRoundChallenge`: remove the `coachTrust: state.player.hidden.coachTrust,` line from the `buildChallenge({...})` call.
- `buildEventContext`: remove the `coachTrust: state.player.hidden.coachTrust,` line from the returned object.

- [ ] **Step 8: Remove it from `EventContext`**

In `src/engine/events.ts`, delete `coachTrust: number;` from the `EventContext` type.

- [ ] **Step 9: Replace the "Coach trust" UI card**

In `src/ui/screens/CareerHub.tsx`, `TeamTab`'s 2x2 grid currently has:

```tsx
<div className="card py-2.5 px-3">
  <div className="stat-num text-lg">{Math.round(state.player.hidden.coachTrust)}</div>
  <div className="eyebrow">Coach trust</div>
</div>
```

Replace it with the player's `Role`, already computed and visible elsewhere, and a fitting substitute for what that card was trying to convey (how the player fits into the team):

```tsx
<div className="card py-2.5 px-3">
  <div className="stat-num text-lg">{ROLE_LABEL[state.role]}</div>
  <div className="eyebrow">Role</div>
</div>
```

Add `ROLE_LABEL` to the existing `from "../../engine/overall"` import in this file (check the current import line — `determineRole`/`Role` may already be imported there; add `ROLE_LABEL` alongside).

- [ ] **Step 10: Read and fix any remaining `coachTrust` references**

Run `Grep coachTrust src/` (or equivalent) across the whole `src/` tree. At this point in the plan, `bigdecision.ts`, `events.ts`'s `EVENT_POOL` content, `decisions.ts`, and `threads.ts` will still reference `coachTrust` in their `effects` objects and (for `bigdecision.ts`) in a bullet string — **do not touch those yet**, they're Tasks 3-5. Only fix references in files this task owns: `development.test.ts`'s test helper (`return { ...player, hidden: { ...player.hidden, confidence: 55, coachTrust: 50 } };` → drop `coachTrust: 50,`), and any other test file that constructs a `Hidden` object literal referencing `coachTrust` (search `career.test.ts`, `player.test.ts`, `bigdecision.test.ts`, `decisions.test.ts` if present — most construct `Person` via `createPlayer`, which no longer produces `coachTrust`, so most should need no change; only literal `Hidden` object constructions need editing).

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`. Expect errors ONLY in `bigdecision.ts`, `events.ts` (its `EVENT_POOL` content, not the types changed in Step 8), `decisions.ts`, and `threads.ts` — all `coachTrust` references in `effects` objects that Tasks 3-5 clean up. Confirm no errors anywhere else (especially not in `development.ts`, `overall.ts`, `challenge.ts`, `career.ts`, `CareerHub.tsx` — those must be fully clean after this task).

- [ ] **Step 12: Run the tests this task can run cleanly**

Run: `npm test -- development.test.ts` (should pass — `rollDevelopment`/`getDevelopmentOptions` tests don't touch `coachTrust` directly, only via the removed hidden field). Note that a full `npm test` will still fail elsewhere (bigdecision.test.ts, events.test.ts if they check effects shape) until Tasks 3-5 land — that's expected, don't chase it in this task.

- [ ] **Step 13: Commit**

```bash
git add src/engine/types.ts src/engine/player.ts src/engine/development.ts src/engine/development.test.ts src/engine/overall.ts src/engine/challenge.ts src/engine/career.ts src/engine/events.ts src/ui/screens/CareerHub.tsx
git commit -m "refactor: remove coachTrust entirely — no hidden stat the player can't see or reason about

Formulas that read it (rollTier's boost, determineRole's edge, buildChallenge's
skillRelief) keep their existing curve shape with just that term dropped.
Content in bigdecision.ts/events.ts/decisions.ts/threads.ts still references it
— cleaned up in Tasks 3-5, expected to leave tsc red in those files until then."
```

---

### Task 2: Add `NarrativeEffects` and apply it to events/threads/CallOptions/TeamOptions

**Files:**
- Modify: `src/engine/types.ts` (new `NarrativeEffects` type)
- Modify: `src/engine/events.ts` (`EventEffects` becomes `NarrativeEffects`)
- Modify: `src/engine/threads.ts` (`ThreadEffects` becomes `NarrativeEffects`)
- Modify: `src/engine/bigdecision.ts` (`TeamOption.effects`, `CallOption.effects` become `NarrativeEffects`)

**Interfaces:**
- Produces: `NarrativeEffects = Partial<Pick<Attributes, "athleticism" | "strength">> & Partial<Omit<Hidden, "developmentRate">>` (exported from `types.ts`). This is a type-only change in this task — it will make `events.ts`'s `EVENT_POOL`, `bigdecision.ts`'s `CALLS`/`generateTeamOffers`, and `threads.ts`'s `THREADS` fail to compile wherever they currently set a forbidden skill attribute or `coachTrust`. That's the point — Tasks 3-5 fix the content.

- [ ] **Step 1: Add `NarrativeEffects` to `types.ts`**

In `src/engine/types.ts`, after the `Hidden` type, add:

```ts
/**
 * The effect shape available to narrative decisions (season events, the Big
 * Decision, career threads) — deliberately narrower than what the
 * development system can touch. Only athleticism/strength may move, and
 * only when the delta is a direct physical/sporting consequence of that
 * specific choice (an injury, a conditioning-focused offseason) — never a
 * generic reward for a personal/social decision. Every basketball SKILL
 * attribute (shooting, finishing, passing, ballHandling, defense,
 * basketballIQ, clutch) is reserved exclusively for the development system.
 */
export type NarrativeEffects = Partial<Pick<Attributes, "athleticism" | "strength">> & Partial<Omit<Hidden, "developmentRate">>;
```

- [ ] **Step 2: Apply it in `events.ts`**

In `src/engine/events.ts`, replace:

```ts
export type EventEffects = Partial<Attributes> & Partial<Omit<Hidden, "developmentRate">>;
```

with:

```ts
import { NarrativeEffects } from "./types";

export type EventEffects = NarrativeEffects;
```

(Add `NarrativeEffects` to the existing `import { Attributes, Hidden } from "./types";` line rather than a second import statement — check whether `Attributes` is still used elsewhere in this file before removing it from the import; it likely still is, via `EventEffects`'s old definition being gone but other code may reference `Attributes` directly. Keep whichever of `Attributes`/`Hidden` are still used.)

- [ ] **Step 3: Apply it in `threads.ts`**

In `src/engine/threads.ts`, replace:

```ts
export type ThreadEffects = Partial<Attributes> & Partial<Omit<Hidden, "developmentRate">>;
```

with:

```ts
export type ThreadEffects = NarrativeEffects;
```

Add `NarrativeEffects` to the `import { Attributes, Hidden } from "./types";` line at the top of the file (again, check whether `Attributes`/`Hidden` are still directly used elsewhere in this file — `applyThreadEffects`'s `attrKeys`/hidden-keys iteration arrays still reference the raw shape, so likely both stay needed).

Also, in `applyThreadEffects`, narrow the iteration array to match the new type (cosmetic — makes the code honest about what it now iterates, doesn't change behavior since the removed keys will never be set):

```ts
const attrKeys: (keyof Attributes)[] = ["athleticism", "strength"];
```

(replacing the current 9-key array), and remove `coachTrust` from the hidden-keys array: `["confidence", "reputation", "chemistry", "fatigue", "injuryRisk"] as const` (was `["confidence", "coachTrust", "reputation", "chemistry", "fatigue", "injuryRisk"]`).

- [ ] **Step 4: Apply it in `bigdecision.ts`**

In `src/engine/bigdecision.ts`, replace both occurrences of:

```ts
effects: Partial<Attributes> & Partial<Omit<Hidden, "developmentRate">>;
```

(one in `TeamOption`, one in `CallOption`) with:

```ts
effects: NarrativeEffects;
```

Add `NarrativeEffects` to the `import { Attributes, Hidden, Person } from "./types";` line at the top of the file. If `Attributes`/`Hidden` become unused after this change (check — `Person` is still needed for `generateTeamOffers`'s param), remove them from the import to avoid an unused-import lint/tsc issue.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`. Expect a large number of errors, ALL inside `EVENT_POOL` (events.ts), `CALLS`/`generateTeamOffers` (bigdecision.ts), and `THREADS` (threads.ts) — every `effects: {...}` object literal that currently sets a forbidden skill attribute or `coachTrust`. Confirm `decisions.ts` shows NO new errors (it keeps its own broader, unrestricted effects type — untouched by this task) and confirm no errors anywhere outside these three content areas.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/events.ts src/engine/threads.ts src/engine/bigdecision.ts
git commit -m "feat: add NarrativeEffects — a compiler-enforced allowlist barring narrative decisions from granting basketball-skill attributes

Type-only change. EVENT_POOL/CALLS/THREADS content is fixed in the next
three tasks — tsc is expected to be red across those three files until then."
```

---

### Task 3: Rewrite `events.ts` content — prune forbidden effects, deepen every consequence

This is the largest content task: every option across all 56 events gets its `effects` pruned to the new allowlist and its `result` deepened into a genuine "what happened because of this" consequence. The table below gives the exact final `result` and `effects` for every option — apply each one as a surgical replacement of that option's existing `result` string and `effects` object (leave `id`, `label`, `detail`, `thread` untouched). One `when` predicate changes (noted separately, Step 2) because it depended on the now-removed `coachTrust`.

**Files:**
- Modify: `src/engine/events.ts`
- Test: `src/engine/events.test.ts` (existing coverage test — should still pass unchanged, since it only checks structural completeness, not specific content)

**Interfaces:**
- Consumes: `NarrativeEffects` (Task 2), the `O(id, label, detail, result, effects, thread?)` helper (unchanged signature).
- Produces: an `EVENT_POOL` where every `effects` object type-checks against `NarrativeEffects` and every `result` string is a specific, believable consequence — not a restatement of the immediate action.

- [ ] **Step 1: Apply the following replacements**

For each event id below, replace each listed option's `result` and `effects` (4th and 5th arguments to `O(...)`) with the given values. Everything else about the event and its options (id, label, detail, thread, category, title, once, weight) is unchanged.

**COACH**

`coach_primary_scorer`:
- a: `result: "The coach rebuilt the offense around you, and it never went back — for the rest of the season, every set started with your name called first."`, `effects: { confidence: 8, fatigue: 6 }`
- b: `result: "You kept your game intact. The coach never brought it up again, but the offense quietly kept running through someone else for the rest of the year."`, `effects: { confidence: 3, chemistry: 4 }`

`coach_defense_demand`:
- a: `result: "You bought in on the defensive end. The matchup wore on you physically, but the coaching staff started trusting you in different moments — crunch-time possessions you hadn't seen before."`, `effects: { fatigue: 10 }`
- b: `result: "You held your ground on offense. The defensive question never fully went away — it just moved to the next film session."`, `effects: { confidence: 6 }`
- c: `result: "You quietly fixed it in the film room. Nobody had to say anything, and the coaching staff noticed you'd solved it yourself."`, `effects: {}`

`coach_lost_confidence`:
- a: `result: "The conversation cleared the air. Your minutes started coming back within a couple of weeks, no fanfare, just more run."`, `effects: { confidence: 5 }`
- b: `result: "You out-worked the doubt in every practice rep. The coach couldn't justify sitting you anymore, and the minutes followed."`, `effects: { athleticism: 1, strength: 1, fatigue: 8 }`
- c: `result: "You waited it out. The minutes never fully came back that season, and the silence between you and the coach hardened into something that hadn't been there before."`, `effects: { confidence: -8 }`

`coach_more_responsibility`:
- a: `result: "You took command of the offense, and the ball started finding you in every crucial sequence — the team's identity shifted around what you could see on the floor."`, `effects: { confidence: 5 }`
- b: `result: "You stayed in your lane. The ball-handling role went to someone else, and the team ran two separate offenses depending on who had it."`, `effects: { confidence: 4 }`

`coach_fired`:
- a: `result: "You won the new staff over fast — showing up first, leaving last. Your spot in the rotation never wavered through the transition."`, `effects: { fatigue: 5, chemistry: 4 }`
- b: `result: "You let your play speak. It took the new staff most of the season to fully trust what they were seeing, but by spring, they did."`, `effects: { confidence: 6 }`

**TEAMMATES**

`teammate_conflict`:
- a: `result: "You heard him out, and the ball started moving more freely. It cost you a little swagger, but the locker room noticed the change."`, `effects: { chemistry: 12, confidence: -3 }`
- b: `result: "You held your ground. The tension in the locker room didn't clear — it just went quiet, and stayed quiet for weeks."`, `effects: { confidence: 8, chemistry: -12, reputation: 2 }`
- c: `result: "The coaching staff mediated it. The issue faded on the surface, but you and your teammate never quite got back to how things were before."`, `effects: { chemistry: -4 }`

`teammate_friend`:
- a: `result: "The two-man game became a real weapon on the floor — defenses started game-planning around the two of you specifically."`, `effects: { chemistry: 14 }`
- b: `result: "You kept it easy and social. The friendship held on your own terms, without ever turning into anything the front office had to manage."`, `effects: { chemistry: 7, confidence: 3 }`

`teammate_challenge`:
- a: `result: "You made your point in practice, hard. The kid backed off for now, but he remembers exactly how that day went — and so does the rest of the roster."`, `effects: { confidence: 9, chemistry: -6, fatigue: 5 }`
- b: `result: "You took him under your wing instead. The locker room noticed the leadership, and it changed how the young guys talked about you when you weren't in the room."`, `effects: { chemistry: 12, reputation: 5 }`

`teammate_trade_request`:
- a: `result: "You backed him publicly. It cost you a little standing with the front office, who don't love players speaking for the organization."`, `effects: { reputation: 4, chemistry: 5 }`
- b: `result: "You put the team first, publicly. The organization noticed the professionalism — and quietly filed it away for the next time they needed someone to trust."`, `effects: { chemistry: -3, reputation: 2 }`
- c: `result: "You said nothing. The story moved on without you in it, which is exactly what you wanted."`, `effects: { reputation: -1, chemistry: 2 }`

`teammate_pass_more`:
- a: `result: "You got everyone involved, and the offense opened back up. Your own numbers dipped a little, but the team's record didn't."`, `effects: { chemistry: 10 }`
- b: `result: "You kept attacking. The ball-movement complaints never fully went away, and a couple of teammates started keeping their distance in the locker room."`, `effects: { confidence: 6, chemistry: -8 }`

**LEGENDS**

`legend_mentor`:
- a: `result: "The summer with him changed how you see the game — not through any single lesson, but through six weeks of watching someone who'd already solved problems you were still running into."`, `effects: { fatigue: 8 }`
- b: `result: "You took what you could without handing over your whole summer. It wasn't the transformation he offered, but it was still yours."`, `effects: { confidence: 3 }`

`legend_compare`:
- a: `result: "You embraced the comparison publicly. It bought you headlines — and a standard everyone now expected you to chase every single night."`, `effects: { confidence: 10, reputation: 6 }`
- b: `result: "You deflected it gracefully. People respected the humility, and the pressure that would have come with owning the comparison never quite landed on you."`, `effects: { reputation: 4, confidence: 3 }`

`legend_criticism`:
- a: `result: "You fired back publicly. It got you attention — some of it the kind that follows you into every postgame interview for the rest of the season."`, `effects: { confidence: 8, reputation: 5, chemistry: -3 }`
- b: `result: "You said nothing and let your game answer instead. By spring, the same analysts were bringing up different names."`, `effects: { confidence: 4 }`

**MEDIA**

`media_viral`:
- a: `result: "You leaned into the spotlight — the sponsors, the interviews, all of it. The attention followed you for the rest of the season, and so did a wider audience that hadn't been paying attention before."`, `effects: { reputation: 8, confidence: 6, fatigue: 5, fanLove: 6 }`
- b: `result: "You kept your head down. The moment passed, and most of the noise passed with it — though the clip itself never really stopped circulating."`, `effects: { reputation: 3, fanLove: 2 }`

`media_overrated`:
- a: `result: "You used it as fuel all season, taped to the inside of your locker. By the time the panel ran their next list, they'd quietly dropped your name from it."`, `effects: { confidence: 8, fatigue: 4 }`
- b: `result: "You laughed it off in public. Nobody brought it up again — which, in the league, is its own kind of statement."`, `effects: { reputation: 4, confidence: 4 }`
- c: `result: "It got into your head more than you let on. A few too many possessions that season looked like a player trying to prove a point instead of just playing."`, `effects: { confidence: -10 }`

`media_bad_interview`:
- a: `result: "You apologized quickly and specifically. The story died within a week, and the people in the locker room appreciated that you didn't make them defend you."`, `effects: { reputation: -2, chemistry: 6 }`
- b: `result: "You stood by what you said. It followed you into every road arena for months, but it also told people exactly where they stood with you."`, `effects: { reputation: 5, chemistry: -8, confidence: 6 }`

`media_next_great`:
- a: `result: "You accepted the weight of the label. Every game got treated like an audition for it, all season long."`, `effects: { confidence: 9, reputation: 8, fatigue: 4 }`
- b: `result: "You deflected the hype. People respected the perspective, and the locker room relaxed a little knowing you weren't chasing a magazine cover."`, `effects: { reputation: 3, chemistry: 4 }`

`media_fans_turn`:
- a: `result: "You played your way back into the crowd's good graces. By the final homestand, the boos had turned into something closer to relief every time you scored."`, `effects: { confidence: 6, fatigue: 8, reputation: 3, fanLove: 5 }`
- b: `result: "You called the fans out at a podium, in exact words that made the local papers the next morning. It didn't land the way you hoped, and the boos got louder before they got quieter."`, `effects: { confidence: 5, reputation: -5, chemistry: -4, fanLove: -8 }`

**RIVAL**

`rival_trash_talk`:
- a: `result: "You fired back publicly. What was a podcast comment turned into a real rivalry storyline the media wouldn't let go of all season."`, `effects: { confidence: 8, reputation: 5 }`
- b: `result: "You stayed quiet and let it build. The next time you two shared a court, everyone in the building remembered exactly why."`, `effects: { confidence: 3 }`

`rival_award`:
- a: `result: "You used it as motivation heading into next season, and it showed in how you trained through the whole offseason."`, `effects: { confidence: 6, fatigue: 4 }`
- b: `result: "You congratulated him publicly. People noticed the class — though it stung more than the interview let on."`, `effects: { reputation: 6, chemistry: 3, confidence: -2 }`

`rival_signs_contender`:
- a: `result: "You welcomed the challenge publicly. It sharpened your focus heading into every matchup with that team on the schedule."`, `effects: { confidence: 7, reputation: 4 }`
- b: `result: "You stayed focused on your own team's business. The front office appreciated not having to manage a public reaction."`, `effects: { chemistry: 6 }`

`rival_public_challenge`:
- a: `result: "You accepted, right there in front of the cameras. However it goes when you actually play him, that clip is already part of both your careers now."`, `effects: { confidence: 9, reputation: 7, chemistry: -3 }`
- b: `result: "You declined. Some people called it the smart move. Some called it something else, and {RIVAL} made sure that version got repeated."`, `effects: { reputation: -4 }`

**CONTRACT**

`contract_early_extension`:
- a: `result: "You signed for security. The front office appreciated the ease of it, though a few analysts wondered aloud if you'd left money on the table."`, `effects: { chemistry: 8, reputation: -3 }`
- b: `result: "You bet on yourself. The extension offer is gone now — whatever you make of this season is what the market decides you're worth next summer."`, `effects: { confidence: 10 }`

`contract_lowball`:
- a: `result: "You let it get public. The pressure worked — quietly, over the following weeks, the front office's tone in negotiations changed."`, `effects: { reputation: 4, confidence: 5 }`
- b: `result: "You kept it professional, behind closed doors. The numbers moved, slowly, without either side ever having to walk anything back publicly."`, `effects: { chemistry: 4 }`

`contract_homecoming`:
- a: `result: "You let the idea sit. It's not going away — and your current teammates can tell something's occupying a corner of your head."`, `effects: { confidence: 7, chemistry: -5 }`
- b: `result: "You shut it down. There's unfinished business here first — and the organization noticed you meant it."`, `effects: { chemistry: 8 }`

`contract_year_pressure`:
- a: `result: "You chased the numbers all year. The stats went up, and so did a quiet resentment in the locker room from guys who noticed exactly what you were doing."`, `effects: { confidence: 6, chemistry: -8, fatigue: 6 }`
- b: `result: "You played winning basketball instead of chasing a stat line. It paid off in ways a box score doesn't show — and in the way rival front offices talked about you."`, `effects: { chemistry: 8 }`

**INJURY / FATIGUE**

`injury_minor`:
- a: `result: "You sat and let it heal properly. It cost you two weeks of games, but the ankle never bothered you again that season."`, `effects: { injuryRisk: -14, fatigue: -12 }`
- b: `result: "You taped it and played through it. It held up this time — but the trainers noted exactly how close it came to not holding up."`, `effects: { injuryRisk: 16 }`

`injury_serious`:
- a: `result: "The full rehab took months, no shortcuts. You came back a step slower than before, but genuinely whole — and your body thanked you for it in the years that followed."`, `effects: { injuryRisk: -25, athleticism: -2, fatigue: -20 }`
- b: `result: "You rushed the return. The team got you back sooner than your body wanted, and it never quite forgave you for it."`, `effects: { injuryRisk: 25, athleticism: -3 }`

`fatigue_grind`:
- a: `result: "You took the night off. One missed game, and you were noticeably sharper for the rest of the trip."`, `effects: { fatigue: -18 }`
- b: `result: "You played every minute. Nobody remembers a player who sat out a road game — your body, on the other hand, remembers everything."`, `effects: { fatigue: 14, injuryRisk: 8 }`

`injury_setback`:
- a: `result: "You studied the game from the sideline, unable to do anything else. It sharpened how you read the floor once you were finally back on it."`, `effects: { confidence: -4 }`
- b: `result: "You pushed the medical staff. They didn't love it, but they moved your timeline up — and made sure you knew exactly whose decision that was if it went wrong."`, `effects: { injuryRisk: 12, confidence: 5 }`

**NCAA**

`ncaa_transfer_interest`:
- a: `result: "You took the call. Word got back to your coach within days — programs talk, and now every practice has a slightly different edge to it."`, `effects: { confidence: 5, reputation: 3 }`
- b: `result: "You shut it down fast. Your coach heard about that too, and it bought you a level of trust that doesn't come from box scores."`, `effects: { chemistry: 8 }`

`ncaa_scouts`:
- a: `result: "You played for the cameras. The tape looked good on the stat sheet, but a couple of teammates noticed exactly who you were playing for."`, `effects: { confidence: 7, chemistry: -7 }`
- b: `result: "You played for the team. Winning turned out to be the better audition — scouts wrote down more about your game by watching you make others better."`, `effects: { chemistry: 9 }`

`ncaa_one_and_done`:
- a: `result: "You told your coach the truth. He appreciated not being blindsided, even if it changed how he used you down the stretch."`, `effects: { reputation: 3, chemistry: -4 }`
- b: `result: "You kept it open. It kept everyone — teammates, coaches, reporters — guessing all season, which is exactly what you wanted."`, `effects: { confidence: 3 }`

`ncaa_expectations`:
- a: `result: "You accepted the pressure and let it drive you. Every practice that season felt like it mattered a little more than it should have."`, `effects: { confidence: 6, fatigue: 5 }`
- b: `result: "You lowered the temperature publicly. The team played looser for it, and looser turned out to matter more than fired-up."`, `effects: { chemistry: 6 }`

**OLYMPIC**

`olympic_callup`:
- a: `result: "You answered the call. The whole country was watching — a different kind of attention than anything the league gives you."`, `effects: { reputation: 9, confidence: 6, fatigue: 12, fanLove: 6 }`
- b: `result: "You rested instead. Your club season benefited from it, but a segment of fans back home didn't love watching someone else wear the jersey."`, `effects: { fatigue: -18, injuryRisk: -8, reputation: -5, fanLove: -3 }`

`olympic_expectation`:
- a: `result: "You carried the weight of the country and never publicly blinked, even when the tournament got tight."`, `effects: { confidence: 5, fatigue: 5 }`
- b: `result: "You blocked out the noise and just played. It wasn't the story anyone wanted to write, but it was the one that got you through."`, `effects: { confidence: 3 }`

**AGING**

`aging_athleticism`:
- a: `result: "You rebuilt your game around the jumper. It's not the player you used to be, but it's a real answer to a problem that wasn't going away."`, `effects: { confidence: 3 }`
- b: `result: "You trained harder to keep the legs. It's a battle you're still fighting every single morning, and your body sends you the bill for it regularly."`, `effects: { fatigue: 12, injuryRisk: 10 }`
- c: `result: "You slowed the game down and let your reads carry you instead of your legs. It's a different kind of effective, and it's real."`, `effects: { confidence: 3 }`

`aging_veteran_role`:
- a: `result: "You accepted the bench role for the team. It stung more than you let on, but it earned you a kind of respect that a starting job wouldn't have."`, `effects: { chemistry: 12, reputation: 4, confidence: -5 }`
- b: `result: "You pushed back and kept your starting spot. Not everyone in the locker room loved watching you fight for it."`, `effects: { confidence: 8, chemistry: -6 }`

`aging_reinvent`:
- a: `result: "You tore your game down and rebuilt it — a whole offseason of unlearning habits that used to be automatic. It's a different game now, deliberately."`, `effects: { confidence: 5 }`
- b: `result: "You stuck with what worked. It still works, for now — though everyone around you can see the shot clock on that starting to run."`, `effects: { confidence: 4 }`

`aging_retirement_thoughts`:
- a: `result: "You pushed the thought away and kept playing like it wasn't there. Nobody in the locker room brought it up either."`, `effects: { confidence: 7, fatigue: 6 }`
- b: `result: "You started planning quietly, without telling anyone — a few calls, nothing official. It comes for everyone eventually."`, `effects: { confidence: -3, fatigue: -8 }`

**LUCK / FUN**

`lucky_hot_streak`:
- a: `result: "You rode it as long as it lasted. For two unbelievable weeks, every shot looked like it was already in before it left your hand."`, `effects: { confidence: 12 }`
- b: `result: "You stayed within the offense. The streak evened out on its own, but the disciplined habits it built stuck around after it did."`, `effects: { chemistry: 6, confidence: 5 }`

`fun_kid_meeting`:
- a: `result: "He'll be telling that story for the rest of his life — and by the time it made local news, so was everyone else who heard it."`, `effects: { reputation: 6, confidence: 6, chemistry: 3, fanLove: 4 }`
- b: `result: "He got to see it up close, and so did everyone who watched the clip afterward — a small moment that traveled a lot further than you expected."`, `effects: { reputation: 8, confidence: 5, fanLove: 5 }`

`fun_charity`:
- a: `result: "The whole community showed up for the opening. It's the kind of thing that outlives every box score you'll ever post."`, `effects: { reputation: 10, confidence: 5, fanLove: 6 }`
- b: `result: "You helped quietly, no headline attached. The people who needed to know, knew."`, `effects: { reputation: 5, fanLove: 2 }`

`luck_gym_rat`:
- a: `result: "The extra work in an empty gym at midnight is invisible to everyone except the people who show up early enough to see the lights already on."`, `effects: { fatigue: 10 }`
- b: `result: "You built in real recovery instead of just grinding. It's a smarter approach than stubborn, even if nobody writes articles about it."`, `effects: { fatigue: -12, injuryRisk: -8 }`

**FOLLOW-UPS**

`coach_role_followup`:
- a: `result: "You adapted as defenses caught up to what you were doing, staying one step ahead of the coverages built specifically to stop you."`, `effects: {}`
- b: `result: "You forced the issue anyway. It worked, eventually, but a few possessions down the stretch made the bench visibly uneasy."`, `effects: { confidence: 6, chemistry: -5 }`
- c: `result: "You gave the scoring load up for a season and let someone else carry it. The team was genuinely better for it, even if your own numbers weren't."`, `effects: { chemistry: 10, confidence: -5 }`

`legend_followup`:
- a: `result: "He didn't soften it. What he told you stung for about a week, and then it started showing up in exactly the situations he'd warned you about."`, `effects: {}`
- b: `result: "You told him you had it from here. He respected that too — mentors, the good ones, know when to step back."`, `effects: { confidence: 8, reputation: 3 }`

`injury_followup`:
- a: `result: "You changed how you play around it — less pounding, more angles. It costs you a step, but the old injury stopped talking back."`, `effects: { athleticism: -1, injuryRisk: -12 }`
- b: `result: "You ignored it again. It held up, mostly — but 'mostly' is doing a lot of work in that sentence, and the training staff knows it."`, `effects: { injuryRisk: 16, reputation: 3 }`

`rival_followup`:
- a: `result: "You returned the respect publicly. The rivalry got a little less bitter, without losing any of what made it worth watching."`, `effects: { reputation: 6, confidence: 4 }`
- b: `result: "You kept the edge. Some rivalries aren't meant to soften, and the next matchup between you two got circled on every schedule in the league."`, `effects: { confidence: 7, chemistry: -3 }`

`media_followup`:
- a: `result: "You let them all the way in. The piece made you more human to people who'd only ever seen the highlights — and a lot of them said so."`, `effects: { reputation: 9, confidence: 4, chemistry: -3, fanLove: 6 }`
- b: `result: "You kept it about basketball. The piece ran shorter than the writer wanted, and so did the conversation about it afterward."`, `effects: { reputation: 4 }`

`team_rebuild`:
- a: `result: "You committed to growing with the young core, publicly and without hesitation. The front office noticed exactly what that signaled."`, `effects: { chemistry: 8, reputation: -3 }`
- b: `result: "You asked out. The front office understood, even if it stung — and it changed how the fanbase talked about you for the rest of the season."`, `effects: { reputation: 5, chemistry: -8, fanLove: -6 }`
- c: `result: "You waited quietly to see who they'd bring in. It's not a statement, but silence read as one anyway."`, `effects: { confidence: 2 }`

`team_contender`:
- a: `result: "You embraced the pressure publicly. This is what you signed up for when you committed to a winning roster."`, `effects: { confidence: 6, fatigue: 5 }`
- b: `result: "You put in the work on fitting together. Two stars only works if it actually works, and by midseason, it was starting to."`, `effects: { chemistry: 12 }`

`coach_new_arrival`:
- a: `result: "You bought into the new system before asking for anything from it. The staff noticed, and it bought you real patience for the adjustment period."`, `effects: {}`
- b: `result: "You told him what you do best early. It took some real negotiating over the first few weeks, but the system eventually bent to fit you too."`, `effects: { confidence: 6 }`

`personal_routine`:
- a: `result: "The overhaul — sleep, food, recovery, all of it — showed up exactly where they said it would: in how your legs felt in the fourth quarter."`, `effects: { athleticism: 2, injuryRisk: -12, fatigue: -12 }`
- b: `result: "You kept doing what worked. Mostly, it still does — though the training staff keeps a slightly closer eye on you than they used to."`, `effects: { confidence: 4, injuryRisk: 6 }`

`personal_fame`:
- a: `result: "You leaned into it. It comes with what you wanted, and the city has started to feel less like a place you play in and more like a place you belong."`, `effects: { reputation: 7, fatigue: 4, fanLove: 5 }`
- b: `result: "You pulled your life back — a smaller circle, quieter nights. The city still knows your name, just a little less of the rest of you."`, `effects: { confidence: 6, fatigue: -8, reputation: -3, fanLove: -2 }`

`teammate_injured`:
- a: `result: "You carried the load every single night. By the time your teammate was back, the whole league had noticed exactly how much you could shoulder."`, `effects: { confidence: 7, fatigue: 14, reputation: 6 }`
- b: `result: "You spread it around instead of trying to do it all. The team held together because of it, and everyone in that locker room knows it."`, `effects: { chemistry: 10 }`

`ncaa_first_start`:
- a: `result: "You came out swinging in your first start. The building remembers exactly what that looked like — some of your teammates remember it a little less fondly."`, `effects: { confidence: 8, chemistry: -2 }`
- b: `result: "You let the game come to you instead of forcing it. It came — quietly, patiently, exactly the way a coach hopes a rookie's first start goes."`, `effects: { chemistry: 4 }`

- [ ] **Step 2: Fix `coach_lost_confidence`'s `when` predicate**

Its current gate, `when: (c) => c.coachTrust < 45`, depended on the now-removed field. Replace with a fully public, already-visible signal — the event is about minutes getting cut, which shows up in role:

```ts
when: (c) => (c.role === "BENCH" || c.role === "ROTATION") && c.ovr >= 65,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`. Expect ZERO errors in `events.ts` now. Errors may remain in `bigdecision.ts`/`threads.ts`/`decisions.ts` (Tasks 4-5) — confirm those are the only remaining locations.

- [ ] **Step 4: Run the existing coverage test**

Run: `npm test -- events.test.ts`. Expect all 3 tests still passing (56 events, every title/result populated, every result distinct from label/detail — the new deeper `result` strings all satisfy this).

- [ ] **Step 5: Commit**

```bash
git add src/engine/events.ts
git commit -m "content: prune narrative decisions to physical-only attribute effects, deepen every consequence

Every option's result now describes a specific, believable outcome instead
of restating the choice. Skill-attribute grants removed everywhere except
where a legitimate physical/injury consequence justifies athleticism/strength.
coach_lost_confidence's gate moved off the removed coachTrust field onto role."
```

---

### Task 4: Rewrite `bigdecision.ts` content

**Files:**
- Modify: `src/engine/bigdecision.ts`
- Test: `src/engine/bigdecision.test.ts` (existing coverage test — should still pass unchanged)

**Interfaces:**
- Consumes: `NarrativeEffects` (Task 2).
- Produces: `CALLS` and `generateTeamOffers`'s `TeamOption` effects/copy fully consistent with the same rules as Task 3.

- [ ] **Step 1: Fix `generateTeamOffers`'s "stay" option**

Change the bullet text (remove the literal words "coach trust", which no longer exists as a concept) and effects:

```ts
opts.push({
  id: `stay_${currentTeam.id}`,
  team: currentTeam,
  headline: d.headline,
  bullets: [...d.bullets, "Continuity with the coaching staff"],
  salary: league === "NBA" ? salaryFor(playerOvr, currentTeam, rng) : undefined,
  years: league === "NBA" ? (rng.next() > 0.5 ? 3 : 2) : undefined,
  effects: { chemistry: 8 },
});
```

(was `bullets: [...d.bullets, "Continuity and coach trust"]` and `effects: { coachTrust: 8, chemistry: 8 }`.)

- [ ] **Step 2: Fix the "join" option's effects**

```ts
// A move costs chemistry — you're the new guy again.
effects: { chemistry: -18, confidence: 4, reputation: 3 },
```

(was `effects: { chemistry: -18, coachTrust: -10, confidence: 4, reputation: 3 }`; update the comment above it too since it no longer mentions trust.)

- [ ] **Step 3: Replace `CALLS`' 5 prompts' options**

Apply exactly:

```ts
const CALLS: { prompt: string; options: CallOption[] }[] = [
  {
    prompt: "The coaching staff wants to redefine your role for next season.",
    options: [
      { id: "a", label: "Ask to be the primary option", detail: "More shots, more blame when it doesn't fall.", result: "More shots came your way, and so did more of the blame on nights it didn't fall — the price of being the first name in the offense.", effects: { confidence: 8, reputation: 4 } },
      { id: "b", label: "Become the defensive anchor", detail: "The dirty work nobody puts on a highlight reel.", result: "The coaching staff leaned on you every single night for the matchups nobody wanted. It built a different kind of trust than a scoring title does.", effects: { fatigue: 8 } },
      { id: "c", label: "Run the offense", detail: "The ball starts and ends with your reads.", result: "The offense started running through your reads. The team's ball movement changed noticeably by midseason, and it started with you.", effects: { chemistry: 10 } },
      { id: "d", label: "Do whatever the team needs", detail: "No ego. Fill the gaps.", result: "You filled every gap the team asked of you all season. Nobody put your name on a highlight reel for it, but the people who mattered noticed exactly what you were doing.", effects: { chemistry: 6 } },
    ],
  },
  {
    prompt: "A veteran superstar offers to take you under his wing — on his terms.",
    options: [
      { id: "a", label: "Accept and learn from him", detail: "You defer this season. You come back sharper.", result: "You deferred for a season under his terms. It cost you some shine, but you came back the next year noticeably sharper for it.", effects: { chemistry: 12, confidence: -3 } },
      { id: "b", label: "Decline — this is your team", detail: "You didn't come here to wait your turn.", result: "You held your ground. It cost you real chemistry with a veteran who could have opened doors for you, but you kept your own identity intact.", effects: { confidence: 12, reputation: 5, chemistry: -12 } },
      { id: "c", label: "Take the advice, keep your role", detail: "Listen without stepping back.", result: "You listened without stepping back from your own role. It was the balance you wanted, and he respected that you didn't just fold into his shadow.", effects: { chemistry: 4, confidence: 2 } },
    ],
  },
  {
    prompt: "Your body is sending warnings. The medical staff wants a full shutdown.",
    options: [
      { id: "a", label: "Shut it down and heal properly", detail: "You'll miss games. You'll come back whole.", result: "You missed real time, but you came back to the floor genuinely whole instead of managing something all season.", effects: { injuryRisk: -22, fatigue: -25 } },
      { id: "b", label: "Play through everything", detail: "They'll remember that you never sat.", result: "You never sat, and everyone noticed. Your body is still paying the bill for a decision the highlight reels will never show the cost of.", effects: { injuryRisk: 22, fatigue: 14, reputation: 7 } },
      { id: "c", label: "Manage the load with the staff", detail: "Fewer minutes, smarter minutes.", result: "Fewer minutes, smarter minutes. It worked, even if it meant a few nights on a limited role that didn't feel like you.", effects: { injuryRisk: -9, fatigue: -12 } },
    ],
  },
  {
    prompt: "The offseason is yours. What do you build?",
    options: [
      { id: "a", label: "An unguardable jumper", detail: "Thousands of reps until it's automatic.", result: "Thousands of reps, alone, until the shot became automatic in your own head — whether it translates to the scoreboard is a different question than whether it felt automatic in July.", effects: { confidence: 5, fatigue: 5 } },
      { id: "b", label: "A body nobody can move", detail: "Strength, conditioning, durability.", result: "You spent the summer on strength and conditioning instead of skill work. You're noticeably harder to move off your spot, and your body held up better through the grind of the season for it.", effects: { strength: 3, athleticism: 2, injuryRisk: -10, fatigue: 6 } },
      { id: "c", label: "Ice in your veins", detail: "Late-game situations, over and over.", result: "You spent the summer running late-game situations over and over, alone in an empty gym. Whether it shows up when it matters is still an open question — but you believe it will.", effects: { confidence: 4 } },
      { id: "d", label: "A complete game", detail: "No holes for anyone to attack.", result: "You spent the summer trying to sand down every rough edge in your game instead of sharpening one specific thing. It's the kind of offseason nobody writes about, win or lose.", effects: { confidence: 3 } },
    ],
  },
  {
    prompt: "The locker room has split, and both sides are waiting to see where you stand.",
    options: [
      { id: "a", label: "Take control of the room", detail: "You say it out loud, in front of everyone.", result: "You said it out loud, in front of everyone. The room fell in line behind you — and it was clear, from that day forward, whose room it actually was.", effects: { reputation: 8, chemistry: 12, fatigue: 5 } },
      { id: "b", label: "Stay out of it and produce", detail: "Let the numbers speak.", result: "You let the numbers speak instead of getting involved. The room sorted itself out eventually, but not before a few relationships cooled off for good.", effects: { confidence: 5, chemistry: -8 } },
      { id: "c", label: "Handle it privately, one by one", detail: "No headlines. Just conversations.", result: "No headlines, just one-on-one conversations. It worked quietly, and nobody outside the locker room ever knew there'd been a problem.", effects: { chemistry: 9 } },
    ],
  },
];
```

Note on the 4th prompt (offseason training): options A, C, and D deliberately carry **no skill-attribute effects** even though they read as skill-focused — the development system already owns skill growth, and letting this Big Decision hand out `shooting`/`clutch`/multi-attribute bonuses would be exactly the redundant, invisible second progression channel this whole plan exists to remove. Only option B keeps `strength`/`athleticism`, because a conditioning-focused offseason having a direct physical conditioning payoff is the legitimate case the allowlist exists for.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`. Expect ZERO errors in `bigdecision.ts`. Errors may remain in `decisions.ts`/`threads.ts` (Task 5) — confirm those are the only remaining locations.

- [ ] **Step 3: Run the existing coverage test**

Run: `npm test -- bigdecision.test.ts`. Expect all tests still passing.

- [ ] **Step 4: Commit**

```bash
git add src/engine/bigdecision.ts
git commit -m "content: prune Big Decision effects to physical-only attributes, deepen consequences

Removes the offseason-training prompt's redundant skill-attribute grants
(shooting/clutch/multi-skill) — the development system already owns skill
growth. Keeps the one legitimate physical-conditioning case."
```

---

### Task 5: Rewrite `threads.ts` and `decisions.ts` content

**Files:**
- Modify: `src/engine/threads.ts`
- Modify: `src/engine/decisions.ts`

**Interfaces:**
- Consumes: `NarrativeEffects` (Task 2, for `threads.ts` only — `decisions.ts` is exempt per Global Constraints).

- [ ] **Step 1: Prune `THREADS`' effects**

In `src/engine/threads.ts`, apply exactly these `effects` replacements (leave every `text` string, `label`, `trigger`, `goodChance`, and `echo` unchanged — threads aren't part of the "Decisions This Season" recap, so their existing text doesn't need the same depth pass as events.ts):

- `injury_played_through`: good `effects: { reputation: 5, confidence: 6 }` (was `{ clutch: 3, reputation: 5, confidence: 6 }` — drop `clutch`, a skill attribute). bad `effects: { athleticism: -3, injuryRisk: 14, confidence: -8 }` — **unchanged**, this is the legitimate case (an injury played through getting worse).
- `injury_recovered`: good `effects: { athleticism: 2, injuryRisk: -12, confidence: 6 }` — **unchanged**, legitimate (recovery genuinely paying off physically). bad `effects: { injuryRisk: 6, confidence: -4 }` — unchanged.
- `mentor_accepted`: good `effects: {}` (was `{ basketballIQ: 5, defense: 3, clutch: 2 }` — all three are skill attributes, drop all). bad `effects: { confidence: -2 }` (was `{ basketballIQ: 1, confidence: -2 }` — drop `basketballIQ`).
- `mentor_declined`: good `effects: { confidence: 9, reputation: 5 }` — unchanged. bad `effects: { confidence: -6 }` (was `{ basketballIQ: -1, confidence: -6 }` — drop `basketballIQ`).
- `role_accepted`: good `effects: { confidence: 9, reputation: 6 }` (was `{ confidence: 9, coachTrust: 8, reputation: 6 }` — drop `coachTrust`). bad `effects: { confidence: -8 }` (was `{ confidence: -8, coachTrust: -6 }` — drop `coachTrust`).
- `role_refused`: good `effects: { chemistry: 10 }` (was `{ chemistry: 10, coachTrust: 7 }` — drop `coachTrust`). bad `effects: { confidence: -5 }` (was `{ coachTrust: -10, confidence: -5 }` — drop `coachTrust`).
- `coach_conflict`: good `effects: { reputation: 8, confidence: 7 }` — unchanged. bad `effects: { reputation: -6 }` (was `{ reputation: -6, coachTrust: -4 }` — drop `coachTrust`).
- `media_outspoken`: good `effects: { reputation: 10, confidence: 8 }` (was `{ reputation: 10, confidence: 8, clutch: 2 }` — drop `clutch`). bad `effects: { reputation: -4, chemistry: -6 }` — unchanged.
- `media_quiet`: good `effects: { chemistry: 6 }` (was `{ coachTrust: 8, chemistry: 6, basketballIQ: 2 }` — drop `coachTrust` and `basketballIQ`). bad `effects: { reputation: -5 }` — unchanged.
- `risk_taken`: good `effects: { confidence: 10, reputation: 8 }` (was `{ confidence: 10, reputation: 8, clutch: 3 }` — drop `clutch`). bad `effects: { confidence: -9, injuryRisk: 10 }` — unchanged, legitimate (a risk that went wrong physically).

- [ ] **Step 2: Narrow the iteration arrays**

Already covered in Task 2 Step 3 (`attrKeys` narrowed to `["athleticism", "strength"]`, `coachTrust` dropped from the hidden-keys array) — confirm those edits are present; this task only supplies the content that makes them meaningful.

- [ ] **Step 3: Remove `coachTrust` from `decisions.ts`**

In `src/engine/decisions.ts`, `DECISIONS`' content (the rival-only bank) currently sets `coachTrust` in roughly 15 option effects across its templates. Find every `coachTrust: <number>` key inside an `effects: {...}` object in this file and delete just that key (leaving every other key in the same object, and every `label`/`tags`, untouched). Do NOT touch any attribute keys here (`shooting`, `defense`, `basketballIQ`, etc.) — this file is exempt from the skill-attribute restriction per the plan's Global Constraints, since it only feeds the rival's own invisible simulation.

Also in `applyDecisionEffects` (same file), remove `coachTrust` from the `hiddenKeys` array:

```ts
const hiddenKeys: (keyof Omit<Hidden, "developmentRate">)[] = [
  "confidence", "reputation", "chemistry", "fatigue", "injuryRisk",
];
```

(was `["confidence", "coachTrust", "reputation", "chemistry", "fatigue", "injuryRisk"]`.)

- [ ] **Step 4: Remove the blanket Fan Love auto-derivation**

Still in `applyDecisionEffects` (`decisions.ts`), delete this block entirely (it's the "renamed copy of reputation" behavior the plan replaces with the three-layer model in Task 6):

```ts
// Fan affection is a livelier, correlated echo of reputation — it moves
// whenever reputation does, at about half the magnitude, without needing
// every decision/event to author a separate fanLove effect by hand.
if (option.effects.reputation !== undefined) {
  hidden.fanLove = clamp(hidden.fanLove + (option.effects.reputation as number) * 0.5, 0, 100);
}
```

Apply the identical removal to `applyThreadEffects` in `src/engine/threads.ts` (the matching block there).

From this point on, `fanLove` only moves via: (a) an explicit `fanLove` key an event/CallOption's `effects` object sets directly (already authored into specific events/CallOptions in Tasks 3-4 — the loop in `applyDecisionEffects`/`applyThreadEffects` that copies any key present in `hiddenKeys`... note `fanLove` needs to be in that copy loop still, since it's a legitimate direct effect now, just no longer auto-derived from reputation. Check: is `fanLove` in the `hiddenKeys` array currently? If not, add it — the direct `fanLove: X` effects authored in Tasks 3-4 need this loop to actually apply them.

- [ ] **Step 5: Confirm `fanLove` is a directly-applicable effect key**

In both `decisions.ts`'s `applyDecisionEffects` and `threads.ts`'s `applyThreadEffects`, check whether `fanLove` is included in the hidden-keys iteration array. If it is not, add it:

`decisions.ts`: `const hiddenKeys: (keyof Omit<Hidden, "developmentRate">)[] = ["confidence", "reputation", "fanLove", "chemistry", "fatigue", "injuryRisk"];`

`threads.ts`: `for (const k of ["confidence", "reputation", "fanLove", "chemistry", "fatigue", "injuryRisk"] as const) {`

This is what makes the explicit `fanLove: 6` (etc.) effects authored directly into specific events in Task 3 actually take effect.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`. Expect ZERO errors across the entire project — this is the convergence point for Tasks 1-5.

- [ ] **Step 7: Run tests**

Run: `npm test`. Expect the full suite passing at its prior rate (the one pre-existing, already-known `simulation.test.ts` failure aside — confirm no NEW failures).

- [ ] **Step 8: Commit**

```bash
git add src/engine/threads.ts src/engine/decisions.ts
git commit -m "refactor: prune thread effects to physical-only attributes, remove coachTrust from the rival bank, remove the blanket Fan Love auto-derivation from reputation

Fan Love now only moves via explicit effects (authored per-event) and the
season-level baseline/big-moment system landing in the next task — never
as an automatic echo of every reputation change."
```

---

### Task 6: Fan Love — the three-layer model

**Files:**
- Create: `src/engine/fanlove.ts`
- Test: `src/engine/fanlove.test.ts` (new)
- Modify: `src/engine/career.ts` (`finishSeason`'s awards loop, `resolveTournamentRound`, the pending-challenge block, `finishOlympics`, `applyBigDecision`'s TEAM_OFFER branch)
- Modify: `src/ui/components/FanLove.tsx` (new threshold text)

**Interfaces:**
- Produces: `seasonsOnCurrentTeam(teamIds: (string | undefined)[], currentTeamId: string): number`, `computeFanLoveTarget(role: Role, awards: Award[], seasonsOnTeam: number): number` (both exported from `fanlove.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/engine/fanlove.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeFanLoveTarget, seasonsOnCurrentTeam } from "./fanlove";
import { Award } from "./types";

describe("seasonsOnCurrentTeam", () => {
  it("counts trailing consecutive seasons on the current team, plus this one", () => {
    expect(seasonsOnCurrentTeam(["a", "a", "b", "b", "b"], "b")).toBe(4); // 3 trailing + this season
    expect(seasonsOnCurrentTeam([], "b")).toBe(1); // rookie season, no history yet
    expect(seasonsOnCurrentTeam(["a", "b", "a"], "a")).toBe(2); // most recent run only
  });
});

describe("computeFanLoveTarget", () => {
  it("gives a rookie prospect a low target", () => {
    const t = computeFanLoveTarget("PROSPECT", [], 1);
    expect(t).toBeLessThan(15);
  });

  it("gives an established starter a moderate target even with zero awards", () => {
    const t = computeFanLoveTarget("STARTER", [], 3);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(45);
  });

  it("gives a multi-time All-Star, All-NBA, champion a high target", () => {
    const awards: Award[] = [
      { type: "ALL_STAR", season: 1 }, { type: "ALL_STAR", season: 2 }, { type: "ALL_STAR", season: 3 },
      { type: "ALL_NBA", season: 2, team: 1 }, { type: "ALL_NBA", season: 3, team: 1 },
      { type: "CHAMPION", season: 3 },
    ];
    const t = computeFanLoveTarget("STAR", awards, 3);
    expect(t).toBeGreaterThan(60);
  });

  it("never exceeds 100", () => {
    const awards: Award[] = Array.from({ length: 10 }, (_, i) => ({ type: "MVP" as const, season: i }));
    const t = computeFanLoveTarget("FRANCHISE", awards, 15);
    expect(t).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- fanlove.test.ts` — expect FAIL (module doesn't exist yet).

- [ ] **Step 3: Implement `fanlove.ts`**

Create `src/engine/fanlove.ts`:

```ts
import { Award } from "./types";
import { Role } from "./overall";

// ============================================================
// FAN LOVE — BASELINE TARGET
//
// Fan Love has three independent layers, kept deliberately separate so a
// single formula never has to carry all of it:
//   1. BASELINE (this file) — a slow-moving "how known should you be by
//      now" number from role, career awards, and team tenure. Fan Love
//      eases toward this every season (see career.ts's finishSeason) — it
//      is never set directly from this target.
//   2. BIG MOMENTS — large, fixed, immediate additive bumps applied the
//      season they happen (career.ts: tournament win, title, first MVP,
//      first All-Star, first All-NBA, Olympic gold) — sized so a player who
//      just became a star or won a title FEELS it immediately, regardless
//      of where the slow-moving baseline currently sits.
//   3. PERSONAL DECISIONS — a curated few event/CallOption effects that
//      explicitly touch fanLove because the choice is genuinely about how
//      fans perceive the player (see events.ts/bigdecision.ts). Never a
//      blanket auto-derivation from reputation.
// ============================================================

/** Consecutive seasons (including this one) the player has been on `currentTeamId`. */
export function seasonsOnCurrentTeam(teamIds: (string | undefined)[], currentTeamId: string): number {
  let count = 0;
  for (let i = teamIds.length - 1; i >= 0; i--) {
    if (teamIds[i] !== currentTeamId) break;
    count++;
  }
  return count + 1; // + this season, which hasn't been appended to the timeline yet
}

const ROLE_BASELINE: Record<Role, number> = {
  PROSPECT: 0, BENCH: 4, ROTATION: 10, STARTER: 22, STAR: 42, FRANCHISE: 60,
};

/** The target Fan Love eases toward each season — never set directly. */
export function computeFanLoveTarget(role: Role, awards: Award[], seasonsOnTeam: number): number {
  const allStars = awards.filter((a) => a.type === "ALL_STAR").length;
  const allNba = awards.filter((a) => a.type === "ALL_NBA").length;
  const mvps = awards.filter((a) => a.type === "MVP").length;
  const titles = awards.filter((a) => a.type === "CHAMPION").length;
  const finalsMvps = awards.filter((a) => a.type === "FINALS_MVP").length;
  const rookieOfYear = awards.some((a) => a.type === "ROOKIE_OF_YEAR") ? 5 : 0;

  const awardScore =
    Math.min(allStars * 4, 24) +
    Math.min(allNba * 6, 24) +
    Math.min(mvps * 10, 30) +
    Math.min(titles * 8, 24) +
    Math.min(finalsMvps * 6, 18) +
    rookieOfYear;

  const tenureScore = Math.min(seasonsOnTeam * 1.5, 15);

  return Math.min(100, ROLE_BASELINE[role] + awardScore + tenureScore);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- fanlove.test.ts` — expect PASS.

- [ ] **Step 5: Wire the baseline into `finishSeason`'s awards loop**

In `src/engine/career.ts`, add the import: `import { computeFanLoveTarget, seasonsOnCurrentTeam } from "./fanlove";`.

Replace the existing awards loop (currently reading, approximately):

```ts
const isRookie = lg === "NBA" && state.nbaSeasonsPlayed === 0;
const awards = rollSeasonAwards(rng, stats, isRookie);
const hadMvp = player.awards.some((a) => a.type === "MVP");
player = { ...player, awards: [...player.awards, ...awards] };
for (const a of awards) {
  if (a.type === "MVP") {
    player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + 10, 0, 100) } };
  } else if (a.type === "ALL_STAR") {
    player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + 4, 0, 100) } };
  }
  if (a.type === "MVP" && !hadMvp) {
    events.push(makeMilestone({ season: state.season, type: "award", narrative: "You are named MVP for the first time.", flags: [MILESTONE_FLAGS.FIRST_MVP] }));
  } else if (a.type === "ALL_STAR") {
    events.push({ id: `as_${state.season}`, season: state.season, type: "award", narrative: "Selected as an All-Star.", flags: ["award_all_star"] });
  }
}
```

with:

```ts
const isRookie = lg === "NBA" && state.nbaSeasonsPlayed === 0;
const awards = rollSeasonAwards(rng, stats, isRookie);
const hadMvp = player.awards.some((a) => a.type === "MVP");
const hadAllStar = player.awards.some((a) => a.type === "ALL_STAR");
const hadAllNba = player.awards.some((a) => a.type === "ALL_NBA");
player = { ...player, awards: [...player.awards, ...awards] };
for (const a of awards) {
  // Big-moment spikes: large, fixed, and immediate — a first MVP or a first
  // All-Star nod should visibly move Fan Love THIS season, not wait for the
  // slower baseline below to catch up.
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
  if (a.type === "MVP" && !hadMvp) {
    events.push(makeMilestone({ season: state.season, type: "award", narrative: "You are named MVP for the first time.", flags: [MILESTONE_FLAGS.FIRST_MVP] }));
  } else if (a.type === "ALL_STAR") {
    events.push({ id: `as_${state.season}`, season: state.season, type: "award", narrative: "Selected as an All-Star.", flags: ["award_all_star"] });
  }
}

// Fan Love baseline: eases toward a target built transparently from role,
// career awards, and tenure with the current team — never set directly.
// This is what keeps a player who's clearly become a star from reading as
// unknown to fans even between big moments.
const seasonsOnTeam = seasonsOnCurrentTeam(state.timeline.map((t) => t.teamId), state.team.id);
const fanLoveTarget = computeFanLoveTarget(state.role, player.awards, seasonsOnTeam);
player = {
  ...player,
  hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + (fanLoveTarget - player.hidden.fanLove) * 0.3, 0, 100) },
};
```

- [ ] **Step 6: Increase the tournament-win and pending-challenge Fan Love spikes**

In `resolveTournamentRound`, change:

```ts
player = {
  ...player,
  hidden: {
    ...player.hidden,
    confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
    reputation: clamp(player.hidden.reputation + magnitude * 0.7, 0, 100),
    fanLove: clamp(player.hidden.fanLove + magnitude * 0.6, 0, 100),
  },
};
```

to:

```ts
player = {
  ...player,
  hidden: {
    ...player.hidden,
    confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
    reputation: clamp(player.hidden.reputation + magnitude * 0.7, 0, 100),
    fanLove: clamp(player.hidden.fanLove + (wonTournament ? 32 : ratio >= 0.6 ? 10 : -8), 0, 100),
  },
};
```

(`confidence`/`reputation` keep the existing `magnitude`-based formula unchanged — only `fanLove` decouples into its own bigger, fixed values, since a title run is a "big moment" that shouldn't be diluted through the same multiplier used for confidence swings.)

In `finishSeason`'s pending-challenge block, change:

```ts
const magnitude = wonTitle ? 26 : -22;
const hidden: Hidden = {
  ...player.hidden,
  confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
  reputation: clamp(player.hidden.reputation + magnitude * 0.8, 0, 100),
  fanLove: clamp(player.hidden.fanLove + magnitude * 0.6, 0, 100),
};
```

to:

```ts
const magnitude = wonTitle ? 26 : -22;
const hidden: Hidden = {
  ...player.hidden,
  confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
  reputation: clamp(player.hidden.reputation + magnitude * 0.8, 0, 100),
  fanLove: clamp(player.hidden.fanLove + (wonTitle ? 32 : -10), 0, 100),
};
```

- [ ] **Step 7: Increase the Olympics Fan Love spike**

In `finishOlympics`, change `fanLove: clamp(state.player.hidden.fanLove + (won ? 18 : 6), 0, 100)` to `fanLove: clamp(state.player.hidden.fanLove + (won ? 25 : 8), 0, 100)`.

- [ ] **Step 8: Adjust the Big Decision loyalty nudge slightly**

In `applyBigDecision`'s `TEAM_OFFER` branch, change `fanLove: clamp(player.hidden.fanLove + (moved ? -5 : 3), 0, 100)` to `fanLove: clamp(player.hidden.fanLove + (moved ? -5 : 4), 0, 100)` (a small, deliberate nudge — this is a personal-decision-tier effect, not a big-moment spike, so it stays modest).

- [ ] **Step 9: New Fan Love narrative thresholds**

In `src/ui/components/FanLove.tsx`, replace `fanLoveLine`:

```ts
function fanLoveLine(v: number, teamName: string): string {
  if (v >= 88) return `You're one of the faces of the league. ${teamName} sells out because of nights like the ones you're having.`;
  if (v >= 72) return `You're becoming one of the recognizable players in the league — people outside ${teamName}'s market know your name now.`;
  if (v >= 52) return `Fans around the league know who you are. ${teamName} has started to feel like it's built around you.`;
  if (v >= 32) return `You're becoming a familiar face around the city. ${teamName} is starting to feel like it belongs to you a little.`;
  if (v >= 14) return `The fans are still learning your name, but they're paying attention.`;
  return `The fans barely know your name yet.`;
}
```

- [ ] **Step 10: Typecheck and test**

Run: `npx tsc --noEmit` — must be clean. Run: `npm test` — full suite, confirm no new failures.

- [ ] **Step 11: Commit**

```bash
git add src/engine/fanlove.ts src/engine/fanlove.test.ts src/engine/career.ts src/ui/components/FanLove.tsx
git commit -m "feat: three-layer Fan Love — baseline target (role/awards/tenure) + big-moment spikes + curated personal-decision nudges

Replaces the blanket auto-derivation from reputation. A title, a first MVP,
or a first All-Star selection now moves Fan Love by a large, fixed amount
immediately, independent of where the slower baseline sits — so an established
star can no longer read as unknown to fans."
```

---

### Task 7: Development story text

**Files:**
- Modify: `src/engine/development.ts` (new `ATTR_FLAVOR`)
- Modify: `src/ui/screens/SeasonComplete.tsx` (render it under each development row)

**Interfaces:**
- Produces: `ATTR_FLAVOR: Record<keyof Attributes, string>`, exported from `development.ts`, alongside the existing `ATTR_LABEL`.

- [ ] **Step 1: Add `ATTR_FLAVOR`**

In `src/engine/development.ts`, right after the existing `ATTR_LABEL` export, add:

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

- [ ] **Step 2: Render it in `SeasonComplete.tsx`'s Development section**

In `src/ui/screens/SeasonComplete.tsx`, add `ATTR_FLAVOR` to the existing `import { DevelopmentResult, ATTR_LABEL } from "../../engine/development";` line. Change the Development section's row rendering from:

```tsx
{development.changes.map((c) => (
  <div key={String(c.attribute)} className="flex justify-between text-sm">
    <span className="text-mute">{ATTR_LABEL[c.attribute]}</span>
    <span className="stat-num" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
      {c.delta > 0 ? "+" : ""}{c.delta}
    </span>
  </div>
))}
```

to:

```tsx
{development.changes.map((c) => (
  <div key={String(c.attribute)} className="py-1.5">
    <div className="flex justify-between text-sm">
      <span className="text-mute">{ATTR_LABEL[c.attribute]}</span>
      <span className="stat-num" style={{ color: c.delta > 0 ? "#E8A33D" : "#FF4D3D" }}>
        {c.delta > 0 ? "+" : ""}{c.delta}
      </span>
    </div>
    {c.delta > 0 && (
      <p className="text-[12px] text-mute mt-0.5 leading-snug">{ATTR_FLAVOR[c.attribute]}</p>
    )}
  </div>
))}
```

(the flavor line is gated on `c.delta > 0` — a REGRESSION-tier decline doesn't get an upbeat "why it felt like part of the season" sentence; the existing amber/red delta coloring already communicates the decline case clearly on its own.)

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/engine/development.ts src/ui/screens/SeasonComplete.tsx
git commit -m "feat: add a short contextual sentence under each development attribute in Season Complete

Purely additive — the exact locked +delta values and the roll mechanic are untouched."
```

---

### Task 8: League news respects the player's timeline

**Files:**
- Modify: `src/engine/rival.ts` (`buildRivalStatUpdate` exported, `generateRivalContextEvent` gains a `revealResolvedOutcomes` param)
- Modify: `src/engine/career.ts` (`runSeason` stops revealing resolved outcomes early, `finishSeason` generates the deferred reveal)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `generateRivalContextEvent(rng, rival, player, season, phase, revealResolvedOutcomes: boolean)` — signature gains a required 6th param. `buildRivalStatUpdate` becomes exported (was private).

- [ ] **Step 1: Export `buildRivalStatUpdate` and gate `generateRivalContextEvent`'s priority branches**

In `src/engine/rival.ts`, add `export` to `function buildRivalStatUpdate(...)`.

Change `generateRivalContextEvent`'s signature and its rings/MVP priority branches:

```ts
export function generateRivalContextEvent(
  rng: RNG,
  rival: Rival,
  player: Person,
  season: number,
  phase: "NCAA" | "NBA",
  revealResolvedOutcomes: boolean
): CareerEvent | null {
  const last = rival.seasonStats[rival.seasonStats.length - 1];
  if (!last) return null;

  const rivalMvps = rival.awards.filter((a) => a.type === "MVP" && a.season === season).length;
  const rivalRings = rival.awards.filter((a) => a.type === "CHAMPION" && a.season === season).length;

  // Priority events reveal a RESOLVED outcome — only safe once the player's
  // own playoffs are done (see career.ts: runSeason calls this with `false`,
  // finishSeason calls it with `true` after the player's own season is over).
  if (revealResolvedOutcomes) {
    if (rivalRings > 0) {
      return {
        id: `rival_ctx_ring_${season}`, season, type: "rival_update",
        narrative: `${rival.name.toUpperCase()} WINS THE TITLE — ${rival.team} are champions.`,
        flags: ["rival_championship", "rival_involved"],
      };
    }
    if (rivalMvps > 0) {
      return {
        id: `rival_ctx_mvp_${season}`, season, type: "rival_update",
        narrative: `${rival.name} has been named MVP after averaging ${last.ppg} PPG.`,
        flags: ["rival_mvp", "rival_involved"],
      };
    }
  }

  const roll = rng.next();
  // ...the rest of the function (MVP race speculation, contract signing,
  // trade rumor branches) is UNCHANGED — none of those reveal a resolved
  // outcome, so they stay safe to fire regardless of this flag.
```

(Only the function signature and the two `if` blocks around the rings/MVP checks change — wrap the existing two `return` blocks inside `if (revealResolvedOutcomes) { ... }`. Everything from `const roll = rng.next();` onward is untouched.)

- [ ] **Step 2: `runSeason` stops revealing resolved outcomes**

In `src/engine/career.ts`, `runSeason`, change:

```ts
const events: CareerEvent[] = [];

// Rival's own season — untouched by ours.
const rivalDecision = generateSeasonDecision(rng, state.season, [], lg);
const rivalSim = simulateRivalSeason(rng, state.rival, state.season, lg, rivalDecision);
const rivalAwards = rollSeasonAwards(rng, rivalSim.stats, false);
let rival: Rival = { ...rivalSim.rival, awards: [...rivalSim.rival.awards, ...rivalAwards] };
events.push(...rivalSim.events);
```

to:

```ts
const events: CareerEvent[] = [];

// Rival's own season is fully resolved here (including their playoffs) so
// state stays deterministic and in lockstep with the player's — but the
// PLAYER hasn't reached their own playoffs yet, so nothing that reveals a
// resolved outcome for the rival is shown until finishSeason (see below).
const rivalDecision = generateSeasonDecision(rng, state.season, [], lg);
const rivalSim = simulateRivalSeason(rng, state.rival, state.season, lg, rivalDecision);
const rivalAwards = rollSeasonAwards(rng, rivalSim.stats, false);
let rival: Rival = { ...rivalSim.rival, awards: [...rivalSim.rival.awards, ...rivalAwards] };
// Only genuinely time-safe rival events surface now — an injury announcement
// is current news; a resolved stat-line/playoff recap is not, since it may
// already describe a title the player hasn't reached their own bracket for.
events.push(...rivalSim.events.filter((e) => e.flags.includes("rival_injury")));
```

Then find the existing `const ctx = generateRivalContextEvent(rng, rival, player, state.season, lg);` line further down in the same function and change it to:

```ts
const ctx = generateRivalContextEvent(rng, rival, player, state.season, lg, false);
```

- [ ] **Step 3: `finishSeason` generates the deferred reveal**

In `src/engine/career.ts`, `finishSeason`, find the existing block:

```ts
const ru = rivalryStateUpdate(rng, player, rival, state.season);
events.push(ru.event);
rival = { ...rival, narrativeState: ru.state };
```

Insert the deferred reveal immediately before it:

```ts
// Now that the player's own season (including their playoffs) is fully
// resolved, it's finally safe to reveal what happened to the rival —
// including their playoff outcome, which was computed back in runSeason
// but withheld from the player until this point in the timeline.
const rivalLastStats = rival.seasonStats[rival.seasonStats.length - 1];
if (rivalLastStats) {
  events.push({
    id: `rival_reveal_${state.season}`, season: state.season, type: "rival_update",
    narrative: buildRivalStatUpdate(rng, rival, rivalLastStats, lg),
    flags: ["rival_season_result", "rival_involved"],
  });
}
const ctxReveal = generateRivalContextEvent(rng, rival, player, state.season, lg, true);
if (ctxReveal) { rival = applyRivalTeamChange(rival, ctxReveal); events.push(ctxReveal); }

const ru = rivalryStateUpdate(rng, player, rival, state.season);
events.push(ru.event);
rival = { ...rival, narrativeState: ru.state };
```

Add `buildRivalStatUpdate`, `generateRivalContextEvent`, `applyRivalTeamChange` to the existing rival-related import line at the top of `career.ts` if not already present (check the current import — `generateRivalContextEvent`/`applyRivalTeamChange` are almost certainly already imported since `runSeason` uses them; add `buildRivalStatUpdate`).

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 5: Run the full test suite**

Run: `npm test` — confirm no new failures (the pre-existing `simulation.test.ts` OVR-spread failure aside). If any test directly constructs a call to `generateRivalContextEvent` with the old 5-arg signature, update it to pass the 6th `revealResolvedOutcomes` argument.

- [ ] **Step 6: Commit**

```bash
git add src/engine/rival.ts src/engine/career.ts
git commit -m "fix: defer revealing the rival's resolved season/playoff outcome until after the player's own playoffs

runSeason no longer surfaces buildRivalStatUpdate's playoff-outcome text or
generateRivalContextEvent's championship/MVP priority branches before the
player has played their own tournament. finishSeason (which only ever runs
after the player's own season, including their playoffs, is fully resolved)
now generates that reveal instead — using data already computed in runSeason,
just shown at the correct point in the player's timeline. Flows automatically
into the existing SeasonResultScreen, which already renders rival_update
events with the right framing — no new UI needed."
```

---

### Task 9: Final verification

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread failure is expected and unrelated to this plan — confirm it's the ONLY failure, and confirm the simulator still runs to completion across all 6 playstyles without crashing, since `rollDevelopment`/`rollTier`'s signature changed in Task 1).

- [ ] **Step 2: Real browser smoke test**

Start the dev server and play through a real career via `claude-in-chrome` (or hand off to the user if they'd rather do it themselves, matching this session's established pattern). Specifically confirm:

1. No "Coach trust" card anywhere in the UI; the Team tab shows "Role" instead.
2. A development card still shows the exact locked `from → to / +delta` (Task 1-2 didn't touch this mechanic, just removed one small formula input).
3. Season Complete's Development section shows a short flavor sentence under each positive attribute change.
4. Trigger at least 2-3 season events — confirm their `result` text (visible in that season's "Decisions This Season" recap) reads as a genuine consequence, not a restatement of the choice, and confirm no console errors from any effects object.
5. Fan Love: create a player, note the starting value; play through to a role change (e.g., become a STARTER) and confirm Fan Love visibly rises over a season or two even without a dramatic single moment; if a big moment happens (tournament win, first All-Star), confirm Fan Love jumps by a large, clearly-noticeable amount that same season.
6. Play a full regular season through to the "Around the League" update — confirm it does NOT reveal the rival's playoff/championship outcome before the player has played their own tournament. Then finish the player's own playoffs and confirm the deferred "Around the League" reveal (on the restored `SeasonResultScreen`) DOES show the rival's full season outcome, including their title if they won one.

Report exactly what was visually verified, the same rigor as prior smoke tests in this codebase's history.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify steps 1-2, and commit. If clean, no further commit needed.

---

## Self-review notes (already applied above)

- **Spec coverage:** every one of the user's 7 points (plus the two follow-up refinements on athleticism/strength discipline and the three-layer Fan Love split) maps to a task: coachTrust removal (Task 1), consequence depth (Task 3), no hidden skill-attribute effects (Tasks 2-5, applied with the athleticism/strength physical-consequence discipline throughout, e.g. dropping it from `coach_defense_demand`'s "study film" option and the Big Decision's jumper/clutch/complete-game options, while keeping it for `injury_played_through`/`injury_recovered`/`personal_routine`'s conditioning), development story text (Task 7), three-layer Fan Love (Task 6), league-news timing (Task 8), no numeric nerfing (nothing in this plan touches `TIER_BUDGET`, `playstyle.ts`, or attribute/OVR ranges — confirmed absent from every task's File Structure).
- **"Not every consequence needs a number" applied throughout Task 3:** `coach_defense_demand`'s option c, `coach_role_followup`'s option a, `legend_followup`'s option a, and `coach_new_arrival`'s option a all land on `effects: {}` — pure narrative, no stat change.
- **Placeholder scan:** every `result`/`effects` pair in Tasks 3-5 is a concrete, final value — no "TBD," no "similar to above."
- **Type consistency:** `NarrativeEffects` (Task 2) is defined once in `types.ts` and consumed identically by `events.ts`, `threads.ts`, and `bigdecision.ts`; `fanlove.ts`'s exports (`computeFanLoveTarget`, `seasonsOnCurrentTeam`) are used with matching signatures in Task 6's `career.ts` edit; `generateRivalContextEvent`'s new 6th parameter is threaded consistently through both its Task 8 call sites (`runSeason` with `false`, `finishSeason` with `true`).
