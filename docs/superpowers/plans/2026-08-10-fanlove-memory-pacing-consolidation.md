# Fan Love Memory, Event Pacing, Team Offer Logos & Season Complete Consolidation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four playtest-identified problems in the just-shipped consequence/Fan Love revision — (1) Fan Love behaves like a per-season recomputed rating instead of a cumulative career reputation with memory, (2) team offer cards show bare team names with no visual identity, (3) the post-season flow shows up to 4 screens that repeat the same conclusions, (4) up to 3 season-event decisions get queued back-to-back before the season even starts instead of feeling organically paced through the season.

**Architecture:** No changes to `playstyle.ts`, the locked development-roll mechanic, `TIER_BUDGET`, or the `NarrativeEffects` skill-attribute restriction from the prior plan — those are working correctly and untouched. This plan: (a) replaces Fan Love's "ease toward a per-season recomputed target" model with a permanent, tiered, achievement-based bump system that never erodes past accomplishment; (b) adds team crests to `BigDecisionScreen`'s offer cards using the existing `TeamLogo`/`getTeamIdentity` system; (c) merges `SeasonResultScreen`'s unique content (the signature-moment headline and the deferred rival reveal) into `SeasonComplete` and removes `SeasonResultScreen` from the normal club-season flow (it remains for the unrelated Olympics-finish path); (d) splits season-event selection into two capped, disjoint category buckets — one "sports" event offered before the season, one "personal" event offered after the regular season resolves (before playoffs) — replacing the current up-to-3-events-in-a-row pre-season queue.

**Note on development flavor text:** the user's request #3 ("a short sentence under each development improvement") is **already fully implemented** — `ATTR_FLAVOR` (`development.ts`) and its render in `SeasonComplete.tsx`'s Development section shipped in the prior plan and were verified working in a live browser smoke test. No task in this plan touches it.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- `src/engine/playstyle.ts`'s weight values are locked — never touched by this plan.
- The locked-development-reward mechanic and `TIER_BUDGET` are never touched.
- The `NarrativeEffects` type and the skill-attribute-free content authored in the prior plan (events.ts/bigdecision.ts/threads.ts `result`/`effects`) are **not rewritten** by this plan — Task 2 only changes *which* events are eligible to be drawn into which of two buckets (via each event's already-existing `category` field), never their `effects`, `result`, or narrative content.
- Fan Love must never be computed by "ease toward a recomputed target" again — every season's change must be a bounded, explainable, mostly-permanent delta driven by what happened THIS season (playoff depth reached, awards earned, personal decisions, tenure), not a mean-reversion toward a freshly derived number.
- A single bad season (early elimination, missed playoffs) must never cost more than a small, fixed amount of Fan Love — regardless of how high it currently is.
- `SeasonResultScreen` (component) stays in the codebase — it is still used by the Olympics-finish path (`finishRound`'s `OLYMPICS` branch in App.tsx), which this plan does not touch.
- `tsc --noEmit`, `npm test`, `npx vite build`, and `npm run simulate` must all be clean at the end of this plan (the one known, already-reported exception: `simulation.test.ts`'s OVR-spread statistical test, unrelated to and not to be "fixed" by this plan).

---

## File Structure

**Modified:** `src/engine/fanlove.ts`, `src/engine/fanlove.test.ts`, `src/engine/career.ts`, `src/engine/events.ts`, `src/ui/screens/SeasonFlow.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/App.tsx`.

**Not touched:** `playstyle.ts`, `development.ts` (already correct), `bigdecision.ts`'s content, `threads.ts`, `decisions.ts`, `awards.ts`, `overall.ts`, `rival.ts`, `tournament.ts`, `identity.ts`, `TeamLogo.tsx`, `FanLove.tsx` (bands/text confirmed already correct — see Task 1's self-review note).

---

### Task 1: Fan Love — permanent, tiered, memory-based model

**Files:**
- Modify: `src/engine/fanlove.ts`
- Modify: `src/engine/fanlove.test.ts`
- Modify: `src/engine/career.ts` (`resolveTournamentRound`, `finishSeason`'s pending-challenge block, `finishSeason`'s new centralized bump)

**Interfaces:**
- Removes: `computeFanLoveTarget` (deleted entirely).
- Produces: `playoffTier(result: PlayoffResult): 0 | 1 | 2 | 3 | 4 | 5`, `playoffOutcomeFanLoveBump(result: PlayoffResult, priorResults: PlayoffResult[]): number` (both exported from `fanlove.ts`). `seasonsOnCurrentTeam` is unchanged (already correct from the prior plan's fix).

- [ ] **Step 1: Rewrite `fanlove.ts`**

Read the current file first (it's short — `seasonsOnCurrentTeam`, `ROLE_BASELINE`, `computeFanLoveTarget`). Replace `ROLE_BASELINE` and `computeFanLoveTarget` with:

```ts
import { PlayoffResult } from "./types";

// ============================================================
// FAN LOVE — PERMANENT ACHIEVEMENT MODEL
//
// Fan Love is a CUMULATIVE record of career fame, not a per-season rating.
// It moves in three ways, all additive, never a recomputed target:
//   1. PLAYOFF-DEPTH BUMPS (this file) — how far you went THIS season, mapped
//      to a fixed tier. Reaching a new personal-best depth is a big, mostly
//      permanent-feeling reward; matching a depth you've already reached
//      before is a smaller (but still non-negative unless you missed the
//      playoffs) one. Missing the playoffs is the only source of a penalty,
//      and it's small and fixed — never proportional to how much you've
//      already earned, so a title from two seasons ago can't be "clawed
//      back" by an average season now.
//   2. AWARD BUMPS (career.ts's finishSeason) — MVP/All-Star/All-NBA, already
//      first-vs-repeat aware, unchanged from the prior plan.
//   3. PERSONAL-DECISION NUDGES (events.ts/bigdecision.ts, authored per
//      event) and the small team-tenure tick below — unchanged.
// There is no per-season "target" this eases toward. What happened stays.
// ============================================================

/** Consecutive seasons (including this one) the player has been on `currentTeamId`. */
export function seasonsOnCurrentTeam(teamIds: (string | undefined)[], currentTeamId: string): number {
  let count = 0;
  for (let i = teamIds.length - 1; i >= 0; i--) {
    if (teamIds[i] === undefined) continue; // national-team rows aren't club seasons, don't break the streak
    if (teamIds[i] !== currentTeamId) break;
    count++;
  }
  return count + 1; // + this season, which hasn't been appended to the timeline yet
}

/** 0 = missed/pending, 1 = first-round exit, ... 5 = champion. */
export type PlayoffTier = 0 | 1 | 2 | 3 | 4 | 5;

export function playoffTier(result: PlayoffResult): PlayoffTier {
  switch (result) {
    case "CHAMPION": return 5;
    case "FINALS_LOSS": return 4;
    case "CONF_FINALS": return 3;
    case "CONF_SEMIS": return 2;
    case "FIRST_ROUND": return 1;
    default: return 0; // MISSED_PLAYOFFS | PENDING
  }
}

const TIER_BUMP_FIRST: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 3, 3: 8, 4: 16, 5: 30 };
const TIER_BUMP_REPEAT: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 1, 3: 4, 4: 8, 5: 15 };

/**
 * Fan Love's response to how this season's playoff run ended. A genuinely
 * new career-best depth (never reached before) gets the bigger, first-time
 * bump; matching or falling short of a depth already reached gets the
 * smaller, repeat-tier bump — but it's still never negative unless the
 * playoffs were missed entirely (tier 0), and that penalty is always -4,
 * regardless of how much Fan Love has already been earned. Purely a
 * function of this season's result and career history — no state, no RNG.
 */
export function playoffOutcomeFanLoveBump(result: PlayoffResult, priorResults: PlayoffResult[]): number {
  const tier = playoffTier(result);
  const bestPrior = priorResults.reduce((best, r) => Math.max(best, playoffTier(r)), 0 as PlayoffTier);
  const isCareerBest = tier > bestPrior;
  return isCareerBest ? TIER_BUMP_FIRST[tier] : TIER_BUMP_REPEAT[tier];
}
```

- [ ] **Step 2: Update `fanlove.test.ts`**

Read the current file first (it has `describe("seasonsOnCurrentTeam", ...)` — keep unchanged — and `describe("computeFanLoveTarget", ...)` — replace with tests for the new functions). Replace the `computeFanLoveTarget` describe block with:

```ts
describe("playoffTier", () => {
  it("maps every PlayoffResult to the expected tier", () => {
    expect(playoffTier("CHAMPION")).toBe(5);
    expect(playoffTier("FINALS_LOSS")).toBe(4);
    expect(playoffTier("CONF_FINALS")).toBe(3);
    expect(playoffTier("CONF_SEMIS")).toBe(2);
    expect(playoffTier("FIRST_ROUND")).toBe(1);
    expect(playoffTier("MISSED_PLAYOFFS")).toBe(0);
    expect(playoffTier("PENDING")).toBe(0);
  });
});

describe("playoffOutcomeFanLoveBump", () => {
  it("gives a big bump for a first-ever championship", () => {
    expect(playoffOutcomeFanLoveBump("CHAMPION", ["CONF_FINALS", "FIRST_ROUND"])).toBe(30);
  });

  it("gives a smaller bump for a repeat championship", () => {
    expect(playoffOutcomeFanLoveBump("CHAMPION", ["CHAMPION", "CONF_FINALS"])).toBe(15);
  });

  it("gives a moderate first-time bump for reaching the Conference Finals", () => {
    expect(playoffOutcomeFanLoveBump("CONF_FINALS", ["FIRST_ROUND", "MISSED_PLAYOFFS"])).toBe(8);
  });

  it("does NOT punish a season that falls short of a career-best already reached — this is the exact bug this plan fixes", () => {
    // Won a title last season, then only reaches the second round this season.
    const bump = playoffOutcomeFanLoveBump("CONF_SEMIS", ["CHAMPION"]);
    expect(bump).toBe(1);
    expect(bump).toBeGreaterThan(-5); // nowhere near the old -8, and never negative here
  });

  it("caps the only negative case (missing the playoffs) at a small, fixed penalty regardless of history", () => {
    expect(playoffOutcomeFanLoveBump("MISSED_PLAYOFFS", ["CHAMPION", "FINALS_LOSS"])).toBe(-4);
    expect(playoffOutcomeFanLoveBump("MISSED_PLAYOFFS", [])).toBe(-4);
  });

  it("gives a neutral (zero) result for a first-round exit — a fine, unremarkable season", () => {
    expect(playoffOutcomeFanLoveBump("FIRST_ROUND", [])).toBe(0);
  });
});
```

Remove the `import { computeFanLoveTarget, ... }` line and replace with `import { playoffTier, playoffOutcomeFanLoveBump, seasonsOnCurrentTeam } from "./fanlove";` (check the exact current import line first).

- [ ] **Step 3: Run, confirm the new tests pass and old ones don't linger**

Run: `npm test -- fanlove.test.ts` — expect all tests passing, none referencing `computeFanLoveTarget` (which no longer exists — confirm `tsc` would catch any leftover reference, covered in Step 6 below).

- [ ] **Step 4: Remove the old fanLove line from `resolveTournamentRound`**

In `src/engine/career.ts`, find:

```ts
  const ratio = outcome.roundsTotal ? outcome.roundsSurvived / outcome.roundsTotal : 0;
  const magnitude = wonTournament ? 24 : ratio >= 0.6 ? 6 : -18;
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

Remove ONLY the `fanLove: clamp(...)` line — `confidence`/`reputation`/`magnitude`/`ratio` stay completely unchanged:

```ts
  const ratio = outcome.roundsTotal ? outcome.roundsSurvived / outcome.roundsTotal : 0;
  const magnitude = wonTournament ? 24 : ratio >= 0.6 ? 6 : -18;
  player = {
    ...player,
    hidden: {
      ...player.hidden,
      confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
      reputation: clamp(player.hidden.reputation + magnitude * 0.7, 0, 100),
    },
  };
```

(This tournament's outcome still feeds into Fan Love — via the new centralized computation in Step 6 below, using `stats.playoffResult`, which this function's caller (`finishSeason`) derives from `state.tournament.cleared` after this round resolves. Removing the line here just stops it from being double-applied.)

- [ ] **Step 5: Remove the old fanLove line from `finishSeason`'s pending-challenge block**

Find:

```ts
    const magnitude = wonTitle ? 26 : -22;
    const hidden: Hidden = {
      ...player.hidden,
      confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
      reputation: clamp(player.hidden.reputation + magnitude * 0.8, 0, 100),
      fanLove: clamp(player.hidden.fanLove + (wonTitle ? 32 : -10), 0, 100),
    };
    player = { ...player, hidden };
```

Remove only the `fanLove` line:

```ts
    const magnitude = wonTitle ? 26 : -22;
    const hidden: Hidden = {
      ...player.hidden,
      confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
      reputation: clamp(player.hidden.reputation + magnitude * 0.8, 0, 100),
    };
    player = { ...player, hidden };
```

- [ ] **Step 6: Replace the baseline-easing block with the new centralized, tiered computation**

Find (this block currently sits right after the awards loop, before the "Consequences of past decisions" comment):

```ts
  // Fan Love baseline: eases toward a target built transparently from role,
  // career awards, and tenure with the current team — never set directly.
  // This is what keeps a player who's clearly become a star from reading as
  // unknown to fans even between big moments.
  const seasonsOnTeam = seasonsOnCurrentTeam(state.timeline.map((e) => e.teamId), state.team.id);
  const fanLoveTarget = computeFanLoveTarget(state.role, player.awards, seasonsOnTeam);
  player = {
    ...player,
    hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + (fanLoveTarget - player.hidden.fanLove) * 0.3, 0, 100) },
  };
```

Replace with (moved earlier in the function — see the note below on placement):

```ts
  // Fan Love's playoff-depth bump: permanent, tiered, and driven by THIS
  // season's actual result against career history — never a recomputed
  // target. A new career-best depth pays big; matching or falling short of
  // a depth already reached pays small (never negative unless the playoffs
  // were missed entirely, which always costs a fixed, small -4). This is
  // what keeps a title from two seasons ago from being erodable by an
  // average season now.
  const priorPlayoffResults = player.seasonStats.slice(0, -1).map((s) => s.playoffResult);
  const playoffBump = playoffOutcomeFanLoveBump(stats.playoffResult, priorPlayoffResults);
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

**Placement matters**: this new block must run AFTER `stats.playoffResult` is finalized (i.e., after both the `if (t) {...}` tournament block and the `if (pending && outcome) {...}` block, which both already write `stats = {...stats, playoffResult: result}` and sync it into `player.seasonStats`'s last entry) — but it does NOT need to run after the awards loop, since it no longer reads `player.awards`. Move it to sit **immediately after** the `if (pending && outcome) {...}` block closes (i.e., right before the `// Minigames are a SECONDARY development source` comment), rather than after the awards loop where the old block was. Read the current file to confirm the exact surrounding lines before making this move — you are relocating the block, not just editing in place.

Update the import line at the top of `career.ts`: change `import { computeFanLoveTarget, seasonsOnCurrentTeam } from "./fanlove";` to `import { playoffOutcomeFanLoveBump, seasonsOnCurrentTeam } from "./fanlove";`.

- [ ] **Step 7: Typecheck and test**

Run: `npx tsc --noEmit` — must be clean (0 errors) — this confirms no leftover reference to the deleted `computeFanLoveTarget`/`ROLE_BASELINE`. Run: `npm test` (full suite) — confirm only the one known pre-existing `simulation.test.ts` failure, no new failures.

- [ ] **Step 8: Self-review note — `FanLove.tsx`'s bands need no change**

`src/ui/components/FanLove.tsx`'s six threshold bands (88/72/52/32/14, with text like "You're one of the faces of the league" down to "The fans barely know your name yet") were already reviewed and approved in the prior plan. The bug was never the text or the breakpoints — it was that the old formula could put a decorated player's *number* into a low band. With Fan Love now monotonically accumulating from permanent tiered bumps (a player who's reached the Conference Finals, made an All-Star team, and stayed on one team for a few seasons will comfortably sit in the 40-60+ range and never crash back down from a single average season), the existing bands will now be reached — and stay reached — appropriately. **Do not edit this file in this task.**

- [ ] **Step 9: Commit**

```bash
git add src/engine/fanlove.ts src/engine/fanlove.test.ts src/engine/career.ts
git commit -m "feat: replace Fan Love's per-season target-recompute with a permanent, tiered playoff-achievement model

A season that falls short of a career-best already reached (e.g. a second-
round exit the year after winning a title) now costs at most a few points,
never the ~20-point crash the old ease-toward-a-recomputed-target model
could produce. Confidence/reputation formulas at both tournament-outcome
call sites are untouched — only fanLove's contribution was removed and
recentralized."
```

---

### Task 2: Season events — capped at one sports + one personal, organically paced

**Files:**
- Modify: `src/engine/events.ts` (`pickEvent` gains an optional category filter)
- Modify: `src/engine/career.ts` (replace `seasonEventCount`/`getSeasonEvent` with `getPreseasonEvent`/`getMidseasonEvent`)
- Modify: `src/App.tsx` (split the pre-season event queue into a pre-season single event + a new post-regular-season single event)

**Interfaces:**
- Removes: `seasonEventCount`, the queue-based `getSeasonEvent(state, index)`.
- Produces: `pickEvent(rng, ctx, recentIds, usedCategories, allowedCategories?)` (5th optional param). `getPreseasonEvent(state: CareerState): SeasonEventView | null`, `getMidseasonEvent(state: CareerState): SeasonEventView | null` (both exported from `career.ts`).

- [ ] **Step 1: Add an optional category filter to `pickEvent`**

Read the current `pickEvent` in `src/engine/events.ts` first. Change its signature and the `valid` filter:

```ts
export function pickEvent(
  rng: RNG,
  ctx: EventContext,
  recentIds: string[],
  /** Categories already used THIS season — keeps one season varied. */
  usedCategories: string[] = [],
  /** When set, only events whose category is in this list are eligible. */
  allowedCategories?: string[]
): GameEvent | null {
  const valid = EVENT_POOL.filter((e) => {
    if (!e.when(ctx)) return false;
    if (e.once && ctx.seen.includes(e.id)) return false;
    if (allowedCategories && !allowedCategories.includes(e.category)) return false;
    return true;
  });
  if (valid.length === 0) return null;
  // ...rest of the function (fresh-category preference, weighting, cooldown) unchanged...
```

Only the function signature and the `valid` filter's added `if` line change — everything below (`fresh`, `pool`, `entries`, `weighted(rng, entries)`) stays exactly as it is.

- [ ] **Step 2: Replace `seasonEventCount`/`getSeasonEvent` with two bucketed functions**

In `src/engine/career.ts`, find `seasonEventCount` and `getSeasonEvent` (they sit together, right before `applySeasonEvent`). Replace both with:

```ts
const SPORTS_EVENT_CATEGORIES = ["COACH", "TEAMMATE", "INJURY", "TEAM", "NCAA"];
const PERSONAL_EVENT_CATEGORIES = ["LEGEND", "MEDIA", "RIVAL", "CONTRACT", "OLYMPIC", "AGING", "LUCK", "PERSONAL"];

/**
 * Whether a season-event slot fires at all. Two independent rolls per
 * season (one per bucket, see below) replace the old single 0-3 count —
 * capping the season at exactly one sports decision and one personal
 * decision, at most, so nothing is ever queued three-deep before a single
 * game has been played.
 */
function shouldFireBucketEvent(state: CareerState, salt: number): boolean {
  const rng = rngFor(state, salt);
  const prominence = clamp((state.player.hidden.reputation - 35) / 65, 0, 1);
  return rng.next() < 0.5 + prominence * 0.15;
}

/** The sports-side decision, offered BEFORE the season begins — coaching
 * role, teammate dynamics, injuries, team direction, or (NCAA) draft-stock
 * storylines. At most one per season. */
export function getPreseasonEvent(state: CareerState): SeasonEventView | null {
  if (!shouldFireBucketEvent(state, 49)) return null;
  const ctx = buildEventContext(state);
  const ev = pickEvent(rngFor(state, 50), ctx, state.recentEventIds, state.seasonEventCategories, SPORTS_EVENT_CATEGORIES);
  if (!ev) return null;
  return { event: ev, prompt: renderPrompt(ev.prompt, ctx) };
}

/** The personal-side decision, offered AFTER the regular season resolves
 * (before playoffs) — media, rivalry, contract, Olympics, aging, luck, or
 * personal-life storylines. At most one per season. Firing here instead of
 * bundled pre-season is what makes the season's decisions feel like they
 * happened DURING it rather than all at once before it started. */
export function getMidseasonEvent(state: CareerState): SeasonEventView | null {
  if (!shouldFireBucketEvent(state, 53)) return null;
  const ctx = buildEventContext(state);
  const ev = pickEvent(rngFor(state, 54), ctx, state.recentEventIds, state.seasonEventCategories, PERSONAL_EVENT_CATEGORIES);
  if (!ev) return null;
  return { event: ev, prompt: renderPrompt(ev.prompt, ctx) };
}
```

`buildEventContext`, `pickEvent`, `renderPrompt`, `rngFor`, `SeasonEventView`, `clamp` are all already imported/defined in this file — no new imports needed. Note that `getMidseasonEvent` is called with `state` AFTER `runSeason` has already updated `state.lastStats` to this season's just-finished numbers — this is intentional and correct: a post-regular-season event should react to how the season just went, not to last season's stats.

- [ ] **Step 3: Rewire `App.tsx`'s event flow**

Read the current file's `proceedToSeasonEvents`, `chooseEvent`, `afterSeasonReport`, `pickFocus`, `finishWorkout`, and `restart` in full before editing — you're restructuring how these functions call each other.

Remove the `eventQueue` state entirely: delete `const [eventQueue, setEventQueue] = useState(0);` and its two references in `restart()` (`setEventQueue(0);`) — just remove that one line from `restart`, don't touch anything else there.

Add a new state var right next to the other event-related state: `const [eventPhase, setEventPhase] = useState<"pre" | "mid" | null>(null);`

Update the import line pulling from `./engine/career` to include `getPreseasonEvent` and `getMidseasonEvent` in place of `seasonEventCount` and the old `getSeasonEvent` usage pattern (keep `getSeasonEvent`'s import only if nothing else references it — check first; if it's now unused, remove it from the import list, and same for `seasonEventCount`).

Replace `proceedToSeasonEvents`:

```ts
  const proceedToSeasonEvents = (s: CareerState) => {
    const ev = getPreseasonEvent(s);
    if (ev) { setSeasonEvent(ev); setEventPhase("pre"); setStage("event"); return; }
    playSeason(s);
  };
```

Replace `chooseEvent`:

```ts
  const chooseEvent = (optionId: string) => {
    if (!state || !seasonEvent) return;
    const s2 = applySeasonEvent(state, seasonEvent.event, optionId);
    setState(s2);
    setSeasonEvent(null);
    if (eventPhase === "mid") {
      setEventPhase(null);
      if (s2.tournament) { setStage("tournament"); return; }
      completeSeason(s2);
      return;
    }
    setEventPhase(null);
    playSeason(s2);
  };
```

Replace `afterSeasonReport`:

```ts
  // After the regular-season report: a personal-side decision may be due
  // now that the season is actually underway, THEN enter the bracket or
  // wrap the season.
  const afterSeasonReport = () => {
    if (!state) return;
    const ev = getMidseasonEvent(state);
    if (ev) { setSeasonEvent(ev); setEventPhase("mid"); setStage("event"); return; }
    if (state.tournament) { setStage("tournament"); return; }
    completeSeason();
  };
```

`pickFocus`/`finishWorkout` already call `proceedToSeasonEvents(s2)` — no change needed there, they automatically pick up the new single-event pre-season behavior.

Add `setEventPhase(null);` to `restart()`'s reset list, alongside the other state resets there.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 5: Manual trace check (no dedicated automated test for this UI flow — App.tsx has none, matching the rest of this file)**

Read back through `proceedToSeasonEvents` → `chooseEvent` (pre-season path) → `playSeason` → `afterSeasonReport` → `chooseEvent` (mid-season path) → tournament/`completeSeason`, confirming: a season with BOTH a sports and a personal event due shows exactly two separate `"event"` stage screens, never both queued back to back before `playSeason` runs; a season with neither due skips straight through; `eventPhase` is always reset to `null` after each event resolves so a stray leftover value can't misroute a later season's single event.

- [ ] **Step 6: Commit**

```bash
git add src/engine/events.ts src/engine/career.ts src/App.tsx
git commit -m "feat: cap season events to one sports + one personal decision, paced across the season

Replaces the old 0-3-events-queued-before-the-season-starts model. Sports
decisions (coach/teammate/injury/team/NCAA) fire before the season; personal
decisions (media/rivalry/contract/Olympics/aging/luck/personal) fire after
the regular season resolves, before playoffs — so decisions read as things
that happened DURING the season, not a pile shown on day one."
```

---

### Task 3: Team crests on offer cards

**Files:**
- Modify: `src/ui/screens/SeasonFlow.tsx` (`BigDecisionScreen`'s `TEAM_OFFER` rendering)

**Interfaces:**
- Consumes: `TeamLogo` (`../components/TeamLogo`), `getTeamIdentity` (`../../engine/identity`) — both already used elsewhere in the codebase with this exact pattern (`SeasonComplete.tsx`, `CareerHub.tsx`, `PlayerStatusPanel.tsx`).

- [ ] **Step 1: Add the imports**

In `src/ui/screens/SeasonFlow.tsx`, check the current top-of-file imports and add (if not already present): `import { TeamLogo } from "../components/TeamLogo";` and `import { getTeamIdentity } from "../../engine/identity";`.

- [ ] **Step 2: Render a crest on every `TEAM_OFFER` card**

In `BigDecisionScreen`, find the `TEAM_OFFER` branch's card header:

```tsx
              <button key={o.id} className="btn" onClick={() => onChoose(o.id)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display uppercase text-[21px] leading-tight tracking-wide">{o.headline}</span>
                  <span className="stat-num text-sm text-amber shrink-0">TEAM OVR {o.team.ovr}</span>
                </div>
```

Change to:

```tsx
              <button key={o.id} className="btn" onClick={() => onChoose(o.id)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamLogo identity={getTeamIdentity(o.team)} size={28} />
                    <span className="font-display uppercase text-[21px] leading-tight tracking-wide truncate">{o.headline}</span>
                  </div>
                  <span className="stat-num text-sm text-amber shrink-0">TEAM OVR {o.team.ovr}</span>
                </div>
```

(Changed the outer flex from `items-baseline` to `items-center` so the logo aligns vertically with the text; wrapped the logo+headline in their own flex row with `min-w-0`/`truncate` so a long team name can't push the OVR badge off-card. This applies uniformly to every `TeamOption`, including `"Stay where you are"` — its `o.team` is the player's current team, same as any other option, so no special-casing is needed.)

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SeasonFlow.tsx
git commit -m "feat: show each team's crest on Big Decision team-offer cards

Reuses the existing TeamLogo/getTeamIdentity system already used elsewhere
— no new asset pipeline. Applies uniformly, including the 'stay' option."
```

---

### Task 4: Consolidate the season-end flow into one Season Complete screen

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx` (`SeasonComplete` gains an `events` prop, folds in the signature-moment headline and the deferred rival reveal)
- Modify: `src/App.tsx` (pass `events` into `SeasonComplete`, remove the `"result"` stage from the normal club-season path)

**Interfaces:**
- `SeasonComplete`'s props gain `events: CareerEvent[]`.
- `SeasonResultScreen` (`SeasonFlow.tsx`) is **not modified or removed** — it stays for the Olympics-finish path.

- [ ] **Step 1: Fold `SeasonResultScreen`'s unique content into `SeasonComplete`**

Read the current `SeasonComplete.tsx` in full first. Add `CareerEvent` to its type imports (check the current import line — it likely needs `import { CareerEvent } from "../../engine/types";` added). Change the component's signature and add the two new derived values:

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
  const s = conclusion.stats;
  const stockTone =
    conclusion.draftStock === "RISING" ? "#E8A33D"
    : conclusion.draftStock === "FALLING" ? "#FF4D3D" : "#8A99B8";
  // The exact "what happened" text for a title, Game 7 win, etc. — more
  // specific and dramatic than the algorithmic headline, so prefer it when
  // one exists this season rather than showing both and repeating the point.
  const signatureMoment = events.find((e) => e.type === "signature_moment");
  // The rival's resolved outcome this season, deferred until now (see
  // career.ts's finishSeason / rival.ts) so it's never seen before the
  // player's own playoffs are done. This is the ONLY place it's shown.
  const leagueNews = events.filter((e) => e.type === "rival_update");
```

Change the headline block from:

```tsx
      <div className="mt-6 rise rise-1">
        <p className="font-display uppercase text-[26px] leading-[1.02]">{conclusion.headline}</p>
```

to:

```tsx
      <div className="mt-6 rise rise-1">
        <p className="font-display uppercase text-[26px] leading-[1.02]">
          {signatureMoment ? signatureMoment.narrative : conclusion.headline}
        </p>
```

(everything else in that block — `conclusion.lines.map(...)` — is unchanged.)

Add a new "Around the League" section, placed after the existing "Draft stock" block and before the final "What's next" button:

```tsx
      {leagueNews.length > 0 && (
        <div className="mt-6 rise rise-3">
          <Divider label="Around the League" />
          <div className="space-y-2">
            {leagueNews.map((e) => (
              <div key={e.id} className="card px-3 py-2.5 border-l-2 border-l-cool">
                <p className="text-[13px] whitespace-pre-line leading-snug">{e.narrative}</p>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Wire `events` into the `SeasonComplete` call site and remove `"result"` from the normal club flow**

In `src/App.tsx`, find the render switch's `"season_complete"` case:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete state={state} conclusion={conclusion} development={development} onNext={afterSeasonComplete} />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

Add `events={resultEvents}` to the `<SeasonComplete .../>` call (leave the `conclusion ? ... : <SeasonResultScreen .../>` fallback structure exactly as it is — that fallback is a defensive edge case, not part of the normal flow, and `SeasonResultScreen` still needs to exist for it and for the Olympics path):

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete state={state} conclusion={conclusion} development={development} events={resultEvents} onNext={afterSeasonComplete} />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

Find `afterDecisionResult` (currently `setStage("result")` after the Big Decision's consequence screen — this is what routes through the now-redundant `SeasonResultScreen` in the normal club flow):

```ts
  const afterDecisionResult = () => {
    setDecisionResultText(null);
    setStage("result");
  };
```

Change it back to calling `afterResult()` directly, skipping the `"result"` stage for the normal club-season path:

```ts
  const afterDecisionResult = () => {
    setDecisionResultText(null);
    afterResult();
  };
```

Do **not** remove the `"result"` case from the render switch, the `SeasonResultScreen` import, or the `resultEvents` state — `finishRound`'s Olympics branch (`if (res.state.phase === "OLYMPICS") { ... setStage("result"); ... }`) still uses all three, unchanged.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx src/App.tsx
git commit -m "feat: consolidate the season-end flow into one Season Complete screen

Folds SeasonResultScreen's unique content (the signature-moment headline,
the deferred 'Around the League' rival reveal) into SeasonComplete and
removes the extra 'result' stage from the normal club-season path — the
flow is now Season Complete -> Big Decision -> consequence -> offseason,
with no repeated conclusion screens. SeasonResultScreen itself is untouched
and still used by the Olympics-finish path."
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

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread failure is expected and unrelated to this plan — confirm it's the ONLY failure, and confirm the simulator still runs to completion across all 6 playstyles without crashing, since Task 1 changed how `finishSeason` computes fanLove and Task 2 changed how season events are selected — `scripts/simulate-careers.ts` drives full careers through both).

- [ ] **Step 2: Real browser smoke test**

Start the dev server and play through a real career via `claude-in-chrome`. Specifically confirm:

1. **Fan Love memory**: play far enough to reach at least the Conference Finals or better in one season, note the Fan Love value and its narrative line. Play a following season with an early exit (round 1 or 2) — confirm Fan Love drops by only a small amount (a handful of points, not a large crash), and confirm the narrative text still reflects an established/known player if the accumulated value is high, never "The fans barely know your name yet" for a decorated, multi-season player.
2. **Team offer logos**: reach a Big Decision with a `TEAM_OFFER` prompt — confirm every option, including "Stay where you are," shows a team crest next to its name, and the card layout doesn't look cramped or broken.
3. **One Season Complete screen**: play a full season through to its end — confirm you see exactly ONE conclusion screen (Season Complete, now showing playoff result/signature-moment headline, Fan Love, stats, Decisions This Season, development, awards, and — if applicable — an "Around the League" section) before reaching the Big Decision, and confirm there is NO additional "Result" screen repeating awards/milestones/rival info after the Big Decision's own consequence screen.
4. **Event pacing**: confirm at most one event screen appears before the season starts (not several in a row), and — if a second event fires that season — confirm it appears AFTER the regular season simulates (between the season report and the tournament, or before Season Complete if there's no tournament), not bundled with the first.
5. **League news timing still holds**: confirm no rival playoff/championship outcome is revealed before the player's own playoffs are done — the "Around the League" section should only appear once, inside the single Season Complete screen, after the player's own postseason concludes.

Report exactly what was visually verified.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify steps 1-2, and commit. If clean, no further commit needed.

---

## Self-review notes (already applied above)

- **Spec coverage:** all 5 numbered points from the user's request map to tasks: Fan Love memory (Task 1), decision consequences staying non-attribute and capped at one-sports-plus-one-personal-per-season (Task 2 — note the "no hidden attribute boosts" part was already fully solved by the prior plan's `NarrativeEffects` restriction and is not re-touched here), development flavor text (already shipped, explicitly called out as no-task-needed in the plan header), team offer logos (Task 3), one Season Complete screen (Task 4).
- **Placeholder scan:** every code block above is the actual, final content to write — no "TBD," no "similar to Task N."
- **Type consistency:** `playoffOutcomeFanLoveBump`/`playoffTier`/`seasonsOnCurrentTeam` (Task 1) are defined once and consumed with matching signatures in `career.ts`. `getPreseasonEvent`/`getMidseasonEvent` (Task 2) share the exact `SeasonEventView | null` return type the removed `getSeasonEvent` used, so `App.tsx`'s existing `seasonEvent` state and `SeasonEventScreen` component need no prop-shape changes. `SeasonComplete`'s new `events: CareerEvent[]` prop (Task 4) is fed the same `resultEvents` value `SeasonResultScreen` already consumed, so no new state or data plumbing is needed in `App.tsx` beyond the one prop addition.
- **Cross-task ordering:** Task 1 and Task 2 both touch `career.ts` but in disjoint regions (Fan Love bump vs. event-selection functions) — no line-level conflict expected, but Task 2's implementer should re-read the file fresh rather than assuming Task 1's exact line numbers, since Task 1 relocates a block.
