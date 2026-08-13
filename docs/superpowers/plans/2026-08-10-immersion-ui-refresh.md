# Immersion + UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Fan Love's team-transition bug (it currently carries the exact numeric value across draft/trade/free-agency instead of resetting per-team), give the game a unified narrative "status" signal, extend two existing narrative surfaces to be status-aware, and compact Season Complete + the Career Hub by removing duplicated identity/development blocks.

**Architecture:** No changes to the development reveal/lock/RNG mechanic, the 1-sports+1-personal event pacing cap, `NarrativeEffects`, the tiered playoff Fan Love model, `Role`/`determineRole`, or the consolidated single-Season-Complete-screen structure from prior plans — all untouched. This plan: (a) adds `initialFanLoveForTeamChange` to `fanlove.ts` and wires it into the two (and only two) places a player's team changes; (b) adds a new, small `status.ts` deriving a narrative "how known/accomplished" signal from awards/reputation, kept fully separate from the existing roster-relative `Role`; (c) makes `FanLove.tsx`'s band text and two existing narrative-generation call sites (the draft-night reveal screen, the Big Decision consequence text) status-aware, with zero new event types or screens for the "new city" reaction; (d) adds one genuinely new `CareerEvent` type (`fanlove_milestone`) that reuses the existing "Around the League" filter-by-type mechanism; (e) removes duplicated identity/development content from `SeasonComplete.tsx` and `CareerHub.tsx`.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest.

## Global Constraints

- The development card-reveal/lock/RNG mechanic (`development.ts`) is never touched — values (`DevChange`, `DevelopmentResult`) are read, never rerolled or recalculated.
- Event pacing (`getPreseasonEvent`/`getMidseasonEvent`, the 1-sports+1-personal cap) is never touched.
- `NarrativeEffects`'s attribute-grant restriction is never touched or bypassed.
- The tiered playoff Fan Love model (`playoffOutcomeFanLoveBump`, `TIER_BUMP_FIRST`/`TIER_BUMP_REPEAT`) from the prior plan is never touched — this plan only adds a NEW function (`initialFanLoveForTeamChange`) alongside it, for a different trigger (team change, not playoff outcome).
- `Role`/`determineRole`/`ROLE_LABEL` (`overall.ts`) are never touched — the new `PlayerStatus` type is a separate, additional signal, never a replacement.
- No new `CareerEvent` type may require carrying an event across the season boundary (from `signDraftPick`/`applyBigDecision`, which fire between seasons, into the *next* season's `SeasonComplete`) — verified during design that `SeasonComplete`'s `events` prop is exactly `finishSeason`'s own transient output and nothing bridges that gap today. The "new city" reaction is implemented by enriching the two screens already shown at the moment of the transition instead.
- `tsc --noEmit`, `npm test`, `npx vite build`, and `npm run simulate` must all be clean at the end of this plan (the one known, already-reported exception: `simulation.test.ts`'s OVR-spread statistical test, unrelated to and not to be "fixed" by this plan).

---

## File Structure

**New:**
- `src/engine/status.ts` — `PlayerStatus` type + `playerStatus()`, the single source of truth for "how known/accomplished is this player" narrative status.
- `src/engine/status.test.ts`

**Modified:** `src/engine/fanlove.ts`, `src/engine/fanlove.test.ts`, `src/engine/types.ts`, `src/engine/career.ts`, `src/engine/career.test.ts`, `src/engine/bigdecision.ts`, `src/engine/bigdecision.test.ts`, `src/ui/components/FanLove.tsx`, `src/ui/components/CareerHeader.tsx`, `src/ui/screens/DraftAndTournament.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/ui/screens/CareerHub.tsx`, `src/App.tsx`.

**Not touched:** `development.ts`, `events.ts`, `decisions.ts`, `threads.ts`, `playstyle.ts`, `overall.ts`, `rival.ts`, `awards.ts`, `tournament.ts`, `playoffs.ts`, `teams.ts`, `identity.ts`, `TeamLogo.tsx`, `PlayerStatusPanel.tsx` (kept as-is for its other consumer, `SeasonFlow.tsx`), `Shell.tsx`, `draft.ts`.

---

### Task 1: Player status derivation

**Files:**
- Create: `src/engine/status.ts`
- Create: `src/engine/status.test.ts`

**Interfaces:**
- Produces: `PlayerStatus = "UNKNOWN" | "ROOKIE" | "ROTATION" | "STARTER" | "ALL_STAR" | "MVP_LEVEL" | "LEGEND"`, `playerStatus(reputation: number, awards: Award[], nbaSeasonsPlayed: number): PlayerStatus`, both exported from `status.ts`.

- [ ] **Step 1: Write `status.ts`**

```ts
import { Award } from "./types";

// ============================================================
// PLAYER STATUS
//
// A single narrative signal answering "how known/accomplished is this
// player right now" — derived from awards (career-long, never reset) and
// reputation (Hidden.reputation — sticky, long-term, survives team
// changes). Deliberately separate from overall.ts's Role, which answers a
// different question (how good is this player RELATIVE TO THIS ROSTER) and
// is never touched by this file. Consumed by narrative text (Fan Love band
// text, the draft-night reveal, the Big Decision consequence text) so an
// accomplished player's story never contradicts their actual career state.
// ============================================================

export type PlayerStatus =
  | "UNKNOWN"
  | "ROOKIE"
  | "ROTATION"
  | "STARTER"
  | "ALL_STAR"
  | "MVP_LEVEL"
  | "LEGEND";

export function playerStatus(reputation: number, awards: Award[], nbaSeasonsPlayed: number): PlayerStatus {
  const hasMvp = awards.some((a) => a.type === "MVP");
  const hasChampion = awards.some((a) => a.type === "CHAMPION");
  const allStars = awards.filter((a) => a.type === "ALL_STAR").length;

  if (hasMvp && (hasChampion || allStars >= 2)) return "LEGEND";
  if (hasMvp) return "MVP_LEVEL";
  if (allStars > 0 || hasChampion) return "ALL_STAR";
  if (nbaSeasonsPlayed === 0) return reputation >= 40 ? "ROTATION" : "ROOKIE";
  if (reputation >= 45) return "STARTER";
  if (reputation >= 20) return "ROTATION";
  return "UNKNOWN";
}
```

- [ ] **Step 2: Write `status.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { playerStatus } from "./status";
import { Award } from "./types";

describe("playerStatus", () => {
  it("returns LEGEND for an MVP who has also won a title", () => {
    const awards: Award[] = [{ type: "MVP", season: 3 }, { type: "CHAMPION", season: 3 }];
    expect(playerStatus(80, awards, 3)).toBe("LEGEND");
  });

  it("returns LEGEND for an MVP with 2+ All-Star nods, even without a title", () => {
    const awards: Award[] = [
      { type: "MVP", season: 4 },
      { type: "ALL_STAR", season: 2 },
      { type: "ALL_STAR", season: 3 },
    ];
    expect(playerStatus(75, awards, 4)).toBe("LEGEND");
  });

  it("returns MVP_LEVEL for a single MVP with no title and fewer than 2 All-Star nods, regardless of a temporarily low reputation", () => {
    const awards: Award[] = [{ type: "MVP", season: 2 }];
    expect(playerStatus(5, awards, 2)).toBe("MVP_LEVEL");
  });

  it("returns ALL_STAR for a player with an All-Star nod or a title but no MVP", () => {
    expect(playerStatus(30, [{ type: "ALL_STAR", season: 1 }], 1)).toBe("ALL_STAR");
    expect(playerStatus(10, [{ type: "CHAMPION", season: 1 }], 1)).toBe("ALL_STAR");
  });

  it("returns ROOKIE for a brand-new player with no awards and low reputation, never ALL_STAR", () => {
    expect(playerStatus(5, [], 0)).toBe("ROOKIE");
  });

  it("returns ROTATION for a hyped rookie (high reputation, no awards yet, zero NBA seasons)", () => {
    expect(playerStatus(50, [], 0)).toBe("ROTATION");
  });

  it("falls back to reputation thresholds for an awardless veteran", () => {
    expect(playerStatus(50, [], 3)).toBe("STARTER");
    expect(playerStatus(25, [], 3)).toBe("ROTATION");
    expect(playerStatus(5, [], 3)).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- status.test.ts` — expect 7/7 passing.

- [ ] **Step 4: Commit**

```bash
git add src/engine/status.ts src/engine/status.test.ts
git commit -m "feat: add playerStatus — a narrative status signal from awards and reputation

Separate from overall.ts's roster-relative Role. Feeds Fan Love's band
text and the draft/trade narrative surfaces added in later tasks, so an
All-Star or MVP's story never reads as if nobody knows them."
```

---

### Task 2: Fan Love resets per team change — the reported bug fix

**Files:**
- Modify: `src/engine/fanlove.ts`
- Modify: `src/engine/fanlove.test.ts`
- Modify: `src/engine/career.ts` (`signDraftPick`, `applyBigDecision`'s `TEAM_OFFER` branch)
- Modify: `src/engine/career.test.ts`

**Interfaces:**
- Produces: `FAN_LOVE_BAND_THRESHOLDS: readonly [14, 32, 52, 72, 88]` and `initialFanLoveForTeamChange(reputation: number, awards: Award[], nbaSeasonsPlayed: number): number`, both exported from `fanlove.ts`. `FAN_LOVE_BAND_THRESHOLDS` is consumed by Task 3 (`FanLove.tsx`'s band selection) and Task 4 (`finishSeason`'s milestone-crossing check) — defining it once here is what keeps those two from drifting out of sync.

- [ ] **Step 1: Add `Award` to `fanlove.ts`'s import and fix the stale header comment**

Read the current file first. Change the top import line from:

```ts
import { PlayoffResult } from "./types";
```

to:

```ts
import { Award, PlayoffResult } from "./types";
```

Replace the file's header comment block (currently describes only the playoff-bump/award-bump/personal-nudge model) with:

```ts
// ============================================================
// FAN LOVE — PERMANENT ACHIEVEMENT MODEL
//
// Fan Love is a CUMULATIVE record of fame WITH THE PLAYER'S CURRENT TEAM,
// not a per-season rating and not a career-wide number. It moves in four
// ways, all additive, never a recomputed target:
//   1. PLAYOFF-DEPTH BUMPS (this file) — how far you went THIS season with
//      THIS team, mapped to a fixed tier (see playoffOutcomeFanLoveBump).
//   2. AWARD BUMPS (career.ts's finishSeason) — MVP/All-Star/All-NBA,
//      first-vs-repeat aware.
//   3. PERSONAL-DECISION NUDGES (events.ts/bigdecision.ts, authored per
//      event) and the small team-tenure tick (career.ts's finishSeason).
//   4. TEAM-CHANGE RESET (this file, initialFanLoveForTeamChange) — fired
//      whenever the player's team changes (draft, trade, free agency).
//      Fan Love does NOT carry over 1:1 from the old team — it restarts
//      from a level driven by Hidden.reputation (a separate, persistent
//      "how known is this player, period" signal that DOES survive team
//      changes) and any awards already earned. A total unknown starts low;
//      a proven All-Star or MVP starts recognizably higher, but never as
//      high as a legacy built over years on one team.
// There is no per-season "target" this eases toward. What happened stays —
// scoped to the team it happened with.
// ============================================================
```

- [ ] **Step 2: Add `FAN_LOVE_BAND_THRESHOLDS` and `initialFanLoveForTeamChange`**

Append to the end of `fanlove.ts` (after the existing `playoffOutcomeFanLoveBump` function):

```ts
/**
 * Ascending Fan Love thresholds that mark a narrative tier change. Shared
 * by FanLove.tsx's band text and finishSeason's milestone-crossing check
 * (career.ts) — defined once here so the two can never drift apart.
 */
export const FAN_LOVE_BAND_THRESHOLDS = [14, 32, 52, 72, 88] as const;

/**
 * Fan Love's value the moment a player's team changes (draft, trade, free
 * agency). Never a straight carry-over from the old team: reputation (a
 * separate, persistent "how known is this player, period" signal) sets a
 * base, and already-earned awards add a bonus on top — but the whole thing
 * is clamped well below reputation's own range, so a transfer can never
 * out-value a legacy built by staying on one team. Pure — no RNG, no state.
 */
export function initialFanLoveForTeamChange(
  reputation: number,
  awards: Award[],
  nbaSeasonsPlayed: number
): number {
  // A player who's already logged real NBA time is never a total unknown
  // to a new market, even at low reputation — the floor scales gently with
  // experience.
  const tenureFloor = nbaSeasonsPlayed >= 5 ? 12 : nbaSeasonsPlayed >= 2 ? 10 : 8;
  const base = Math.min(35, Math.max(tenureFloor, Math.round(reputation * 0.35)));

  const hasMvp = awards.some((a) => a.type === "MVP");
  const hasChampion = awards.some((a) => a.type === "CHAMPION");
  const allStars = awards.filter((a) => a.type === "ALL_STAR").length;
  const allNba = awards.filter((a) => a.type === "ALL_NBA").length;

  let bonus = 0;
  if (hasMvp) bonus += 25;
  else if (hasChampion) bonus += 15;
  bonus += Math.min(allStars * 10, 20);
  bonus += Math.min(allNba * 6, 12);

  return Math.min(70, Math.max(5, base + bonus));
}
```

- [ ] **Step 3: Update `fanlove.test.ts`**

Read the current file first (import line at the top will need `initialFanLoveForTeamChange` added). Change the import line to:

```ts
import { playoffTier, playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange } from "./fanlove";
```

Add this new `describe` block at the end of the file:

```ts
describe("initialFanLoveForTeamChange", () => {
  it("gives an unknown prospect with no reputation a low starting value", () => {
    const v = initialFanLoveForTeamChange(5, [], 0);
    expect(v).toBeGreaterThanOrEqual(8);
    expect(v).toBeLessThanOrEqual(15);
  });

  it("gives a high-reputation prospect with no NBA awards yet a moderate starting value", () => {
    const v = initialFanLoveForTeamChange(60, [], 0);
    expect(v).toBeGreaterThanOrEqual(20);
    expect(v).toBeLessThanOrEqual(30);
  });

  it("gives a high-reputation All-Star a notably higher starting value", () => {
    const v = initialFanLoveForTeamChange(70, [{ type: "ALL_STAR", season: 2 }], 3);
    expect(v).toBeGreaterThanOrEqual(35);
    expect(v).toBeLessThanOrEqual(50);
  });

  it("gives a very-high-reputation MVP/champion the highest starting value, still below the hard cap", () => {
    const v = initialFanLoveForTeamChange(
      85,
      [{ type: "MVP", season: 4 }, { type: "CHAMPION", season: 4 }],
      5
    );
    expect(v).toBeGreaterThanOrEqual(50);
    expect(v).toBeLessThanOrEqual(65);
  });

  it("never exceeds the 70 ceiling even for a maximal reputation/award profile", () => {
    const v = initialFanLoveForTeamChange(
      100,
      [
        { type: "MVP", season: 5 }, { type: "CHAMPION", season: 5 },
        { type: "ALL_STAR", season: 1 }, { type: "ALL_STAR", season: 2 }, { type: "ALL_STAR", season: 3 },
        { type: "ALL_NBA", season: 5, team: 1 }, { type: "ALL_NBA", season: 4, team: 1 },
      ],
      8
    );
    expect(v).toBe(70);
  });
});
```

- [ ] **Step 4: Run, confirm the new tests pass**

Run: `npm test -- fanlove.test.ts` — expect all tests passing.

- [ ] **Step 5: Wire into `signDraftPick`**

In `src/engine/career.ts`, find (search for `export function signDraftPick`):

```ts
export function signDraftPick(state: CareerState, slot: DraftSlot): CareerState {
  const rng = rngFor(state, 40);
  const event = makeMilestone({
    season: state.season, type: "signature_moment",
    narrative: `DRAFT NIGHT — Selected #${slot.pick} overall by the ${slot.team.name}.`,
    flags: ["draft_night", slot.pick <= 5 ? "lottery_pick" : "later_pick"],
  });
  const next: CareerState = {
    ...state,
    phase: "NBA",
    team: slot.team,
    salary: rookieSalary(slot.pick),
    contractYearsLeft: 3,
    draftBoard: null,
    log: [...state.log, event],
    moments: [...state.moments, event],
  };
  const { roster, role } = refreshRoster(next, rng);
  return { ...next, roster, role };
}
```

Replace with:

```ts
export function signDraftPick(state: CareerState, slot: DraftSlot): CareerState {
  const rng = rngFor(state, 40);
  const event = makeMilestone({
    season: state.season, type: "signature_moment",
    narrative: `DRAFT NIGHT — Selected #${slot.pick} overall by the ${slot.team.name}.`,
    flags: ["draft_night", slot.pick <= 5 ? "lottery_pick" : "later_pick"],
  });
  // Fan Love does not carry over from college — it restarts for the new team.
  const newFanLove = initialFanLoveForTeamChange(
    state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed
  );
  const next: CareerState = {
    ...state,
    phase: "NBA",
    team: slot.team,
    salary: rookieSalary(slot.pick),
    contractYearsLeft: 3,
    draftBoard: null,
    log: [...state.log, event],
    moments: [...state.moments, event],
    player: { ...state.player, hidden: { ...state.player.hidden, fanLove: newFanLove } },
  };
  const { roster, role } = refreshRoster(next, rng);
  return { ...next, roster, role };
}
```

Update the import line at the top of `career.ts` — find:

```ts
import { playoffOutcomeFanLoveBump, seasonsOnCurrentTeam } from "./fanlove";
```

Replace with:

```ts
import { playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange } from "./fanlove";
```

- [ ] **Step 6: Wire into `applyBigDecision`'s `TEAM_OFFER` branch**

In `src/engine/career.ts`, find:

```ts
  if (decision.kind === "TEAM_OFFER") {
    const opt = decision.options.find((o) => o.id === optionId) as TeamOption;
    const moved = opt.team.id !== state.team.id;
    team = opt.team;
    player = applyDecisionEffects(player, { id: opt.id, label: opt.headline, effects: opt.effects, tags: [] });
    // Staying loyal earns a little fan affection; leaving costs a little —
    // fans notice commitment (or the lack of it) independent of reputation.
    player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + (moved ? -5 : 4), 0, 100) } };
```

Replace with:

```ts
  if (decision.kind === "TEAM_OFFER") {
    const opt = decision.options.find((o) => o.id === optionId) as TeamOption;
    const moved = opt.team.id !== state.team.id;
    team = opt.team;
    player = applyDecisionEffects(player, { id: opt.id, label: opt.headline, effects: opt.effects, tags: [] });
    // Leaving resets Fan Love for the new team (reputation/awards carry
    // over, the raw number never does). Staying loyal earns a little fan
    // affection on top of the current value — no reset, nothing lost.
    player = {
      ...player,
      hidden: {
        ...player.hidden,
        fanLove: moved
          ? initialFanLoveForTeamChange(player.hidden.reputation, player.awards, state.nbaSeasonsPlayed)
          : clamp(player.hidden.fanLove + 4, 0, 100),
      },
    };
```

(Everything below this block — `if (opt.years) {...}`, the `events.push(makeMilestone({...}))` call, and the `else` branch for `CAREER_CALL` — is unchanged.)

- [ ] **Step 7: Fix `types.ts`'s stale `Hidden.fanLove` comment**

In `src/engine/types.ts`, find:

```ts
  fanLove: number; // 0-100, how much the fanbase/media loves the player RIGHT NOW —
  // a livelier, faster-moving cousin of reputation. Driven by three separate
  // layers (see engine/fanlove.ts): a slow baseline target from role/awards/
  // tenure, large fixed spikes at big moments, and a curated few narrative
  // decisions authored to touch it directly — never a blanket echo of reputation.
```

Replace with:

```ts
  fanLove: number; // 0-100, how much the CURRENT team's fanbase/media loves the
  // player right now — scoped to the current team, unlike reputation. Driven by
  // four layers (see engine/fanlove.ts's header comment): tiered playoff-depth
  // bumps, award bumps, personal-decision nudges, and a reset whenever the
  // player's team changes — never a blanket echo of reputation, and never a
  // straight carry-over from a previous team.
```

- [ ] **Step 8: Write regression tests in `career.test.ts`**

Read the current file's imports first. Add `signDraftPick`, `applyBigDecision` to the imports from `./career` if not already present, `NBA_TEAMS` from `./teams`, and `BigDecision` (type-only) from `./bigdecision`:

```ts
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, hasWorkoutOpportunity,
  runSeason, finishSeason, applySeasonEvent, buildEventContext,
  signDraftPick, applyBigDecision,
} from "./career";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { pickEvent } from "./events";
import { createRNG } from "./rng";
import { NBA_TEAMS } from "./teams";
import { BigDecision } from "./bigdecision";
import { DraftSlot } from "./draft";
```

Add this new `describe` block at the end of the file:

```ts
describe("Fan Love resets on a team change — the reported bug fix", () => {
  it("signDraftPick does not carry college Fan Love straight into the NBA", () => {
    let state = initCareer(1, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    state = {
      ...state,
      player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 71, reputation: 20 } },
    };
    const slot: DraftSlot = {
      pick: 12, team: NBA_TEAMS[0], interested: true, expectedRole: "Rotation",
      championshipWindow: 1, competition: "Medium", market: "Medium",
    };
    const next = signDraftPick(state, slot);
    expect(next.player.hidden.fanLove).not.toBe(71);
    expect(next.player.hidden.fanLove).toBeLessThan(30); // low reputation, no NBA awards yet
  });

  it("applyBigDecision resets Fan Love (not a flat nudge) when the player moves teams", () => {
    let state = initCareer(2, { name: "T", country: "USA", position: "PF", height: 205, playstyle: "INTERIOR" });
    state = {
      ...state,
      phase: "NBA",
      team: NBA_TEAMS[0],
      player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 78, reputation: 15 } },
    };
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test", season: state.season, prompt: "Where next?",
      options: [
        { id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} },
        { id: "move", team: NBA_TEAMS[1], headline: "Move", bullets: [], effects: {} },
      ],
    };
    const next = applyBigDecision(state, "move", decision);
    expect(next.team.id).toBe(NBA_TEAMS[1].id);
    expect(next.player.hidden.fanLove).not.toBe(73); // NOT the old flat "78 - 5" behavior
    expect(next.player.hidden.fanLove).toBeLessThan(30); // low reputation, no awards
  });

  it("applyBigDecision's stayed branch still applies its existing +4 loyalty nudge, unaffected", () => {
    let state = initCareer(3, { name: "T", country: "USA", position: "C", height: 210, playstyle: "TWO_WAY" });
    state = {
      ...state,
      phase: "NBA",
      team: NBA_TEAMS[0],
      player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 50 } },
    };
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test2", season: state.season, prompt: "Where next?",
      options: [{ id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} }],
    };
    const next = applyBigDecision(state, "stay", decision);
    expect(next.player.hidden.fanLove).toBe(54);
  });
});
```

- [ ] **Step 9: Typecheck and test**

Run: `npx tsc --noEmit` — must be clean. Run: `npm test` — confirm only the one known pre-existing `simulation.test.ts` failure.

- [ ] **Step 10: Commit**

```bash
git add src/engine/fanlove.ts src/engine/fanlove.test.ts src/engine/career.ts src/engine/career.test.ts src/engine/types.ts
git commit -m "fix: Fan Love resets per team change instead of carrying over 1:1

Draft night and every free-agency/trade move now call
initialFanLoveForTeamChange, which restarts Fan Love from a level driven
by the player's persistent reputation and already-earned awards — never
a straight copy of the old team's number. A 71-Fan-Love college star
drafted by an NBA team now starts meaningfully lower with that team, not
at 71. Staying with the current team is unaffected (still the existing
+4 loyalty nudge on top of the current value, no reset)."
```

---

### Task 3: Fan Love band text becomes status-aware

**Files:**
- Modify: `src/ui/components/FanLove.tsx`
- Modify: `src/ui/screens/SeasonComplete.tsx` (one line — the `<FanLove>` call site)
- Modify: `src/ui/screens/CareerHub.tsx` (one line — the `<FanLove>` call site in `SeasonTab`)

**Interfaces:**
- Consumes: `PlayerStatus` (`../../engine/status`, Task 1), `FAN_LOVE_BAND_THRESHOLDS` (`../../engine/fanlove`, Task 2).
- Produces: `FanLove`'s prop shape changes to `{ value: number; teamName: string; status: PlayerStatus }` — both call sites must be updated in this same task or `tsc` fails.

- [ ] **Step 1: Rewrite `FanLove.tsx`**

Read the current file first. Replace its entire contents with:

```tsx
import { FAN_LOVE_BAND_THRESHOLDS } from "../../engine/fanlove";
import { PlayerStatus } from "../../engine/status";

// ============================================================
// FAN LOVE
// A living reaction to the career, not another stat to skim past. Reacts to
// wins, awards, playoff moments, loyalty, and team changes (see
// engine/fanlove.ts for the full model) — this component only renders it.
// Band text also respects `status`: an accomplished player (All-Star or
// above) never reads as a total unknown, even at a temporarily low number
// right after a trade — see floorBandIndex below.
// ============================================================

const BAND_TEXT: ((teamName: string) => string)[] = [
  (t) => `You're one of the faces of the league. ${t} sells out because of nights like the ones you're having.`,
  (t) => `You're becoming one of the recognizable players in the league — people outside ${t}'s market know your name now.`,
  (t) => `Fans around the league know who you are. ${t} has started to feel like it's built around you.`,
  (t) => `You're becoming a familiar face around the city. ${t} is starting to feel like it belongs to you a little.`,
  () => `The fans are still learning your name, but they're paying attention.`,
  () => `The fans barely know your name yet.`,
];

/** BAND_TEXT[0] = best (>= the highest threshold), BAND_TEXT[last] = worst (< the lowest threshold). */
function bandIndex(v: number): number {
  let idx = FAN_LOVE_BAND_THRESHOLDS.length;
  for (const t of FAN_LOVE_BAND_THRESHOLDS) {
    if (v >= t) idx--;
  }
  return idx;
}

/** The worst band index a given status is still allowed to read as. */
function floorBandIndex(status: PlayerStatus): number {
  if (status === "LEGEND" || status === "MVP_LEVEL") return 2; // never worse than "fans around the league know who you are"
  if (status === "ALL_STAR") return 3; // never worse than "becoming a familiar face"
  return BAND_TEXT.length - 1; // no floor
}

function fanLoveLine(v: number, teamName: string, status: PlayerStatus): string {
  const index = Math.min(bandIndex(v), floorBandIndex(status));
  return BAND_TEXT[index](teamName);
}

export function FanLove({ value, teamName, status }: { value: number; teamName: string; status: PlayerStatus }) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Fan Love</span>
        <span className="stat-num text-sm text-amber">{v} / 100</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-line rounded-sm overflow-hidden">
        <div className="h-full" style={{ width: `${v}%`, background: "#E8A33D" }} />
      </div>
      <p className="mt-2 text-[13px] text-mute leading-snug">{fanLoveLine(v, teamName, status)}</p>
    </div>
  );
}
```

- [ ] **Step 2: Update `SeasonComplete.tsx`'s `<FanLove>` call site**

Read the current file's `<FanLove value={state.player.hidden.fanLove} teamName={state.team.name} />` line. Add the import `import { playerStatus } from "../../engine/status";` near the top (alongside the other engine imports), and change the call to:

```tsx
<FanLove
  value={state.player.hidden.fanLove}
  teamName={state.team.name}
  status={playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed)}
/>
```

- [ ] **Step 3: Update `CareerHub.tsx`'s `<FanLove>` call site**

In `SeasonTab`, read the current `<FanLove value={state.player.hidden.fanLove} teamName={state.team.name} />` line. Add the import `import { playerStatus } from "../../engine/status";` near the top, and change the call the same way as Step 2.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — must be clean (confirms both call sites were updated correctly).

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/FanLove.tsx src/ui/screens/SeasonComplete.tsx src/ui/screens/CareerHub.tsx
git commit -m "feat: Fan Love band text respects playerStatus

An All-Star or MVP-level player can no longer read as 'the fans barely
know your name yet' even at a temporarily low Fan Love value right after
a trade — status sets a floor on which band text is selectable."
```

---

### Task 4: Fan Love milestone reactions + persistent last-development data

**Files:**
- Modify: `src/engine/types.ts` (`CareerState` gains `lastDevelopment`)
- Modify: `src/engine/career.ts` (`initCareer`, `finishSeason`)
- Modify: `src/engine/career.test.ts`
- Modify: `src/ui/screens/SeasonComplete.tsx` (`leagueNews` filter — one line)

**Interfaces:**
- `CareerState` gains `lastDevelopment: DevelopmentResult | null`.
- New `CareerEvent` type value: `"fanlove_milestone"`.
- Produces: `state.lastDevelopment`, consumed by Task 8 (Career Hub's STATS tab).

- [ ] **Step 1: Add `lastDevelopment` to `CareerState`**

In `src/engine/types.ts`... actually `CareerState` lives in `career.ts`, not `types.ts` — read `src/engine/career.ts` first to confirm (search for `export type CareerState`). Find:

```ts
  /** Result of this season's offseason workout — an opportunity, never a risk. */
  workout: WorkoutResult;
  /** Open and resolved consequence threads — the career's memory. */
  threads: ActiveThread[];
  /** Memorable moments for the legacy screen. */
  moments: CareerEvent[];
};
```

Replace with:

```ts
  /** Result of this season's offseason workout — an opportunity, never a risk. */
  workout: WorkoutResult;
  /** Open and resolved consequence threads — the career's memory. */
  threads: ActiveThread[];
  /** Memorable moments for the legacy screen. */
  moments: CareerEvent[];
  /** This season's development result, kept around (not just transient
   * finishSeason output) so screens reached after Season Complete — like
   * the Career Hub's Stats tab — can still show "what changed this season." */
  lastDevelopment: DevelopmentResult | null;
};
```

- [ ] **Step 2: Initialize the field in `initCareer`**

In `src/engine/career.ts`, find `initCareer`'s returned object (search for `lastDevNote: null,`):

```ts
    lastAgeReport: [],
    lastDevNote: null,
    tournament: null,
```

Replace with:

```ts
    lastAgeReport: [],
    lastDevNote: null,
    lastDevelopment: null,
    tournament: null,
```

- [ ] **Step 3: Capture the pre-season Fan Love value at the top of `finishSeason`**

Find (search for `export function finishSeason`):

```ts
export function finishSeason(
  state: CareerState,
  outcome: GauntletOutcome | null
): SeasonEnd {
  const rng = rngFor(state, 4);
  const lg = league(state);
  let player = state.player;
  let rival = state.rival;
  const events: CareerEvent[] = [];
  let wonTitle = false;
```

Replace with:

```ts
export function finishSeason(
  state: CareerState,
  outcome: GauntletOutcome | null
): SeasonEnd {
  const rng = rngFor(state, 4);
  const lg = league(state);
  let player = state.player;
  let rival = state.rival;
  const events: CareerEvent[] = [];
  let wonTitle = false;
  const fanLoveBeforeThisSeason = state.player.hidden.fanLove;
```

- [ ] **Step 4: Push a `fanlove_milestone` event when a band threshold is crossed**

Find the end of the awards loop (search for the block starting `for (const a of awards) {` — it ends with a `}` closing brace, immediately followed by a blank line and `// ---- Consequences of past decisions land here ----`):

```ts
    if (a.type === "MVP" && !hadMvp) {
      events.push(makeMilestone({ season: state.season, type: "award", narrative: "You are named MVP for the first time.", flags: [MILESTONE_FLAGS.FIRST_MVP] }));
    } else if (a.type === "ALL_STAR") {
      events.push({ id: `as_${state.season}`, season: state.season, type: "award", narrative: "Selected as an All-Star.", flags: ["award_all_star"] });
    }
  }

  // ---- Consequences of past decisions land here ----
```

Replace with:

```ts
    if (a.type === "MVP" && !hadMvp) {
      events.push(makeMilestone({ season: state.season, type: "award", narrative: "You are named MVP for the first time.", flags: [MILESTONE_FLAGS.FIRST_MVP] }));
    } else if (a.type === "ALL_STAR") {
      events.push({ id: `as_${state.season}`, season: state.season, type: "award", narrative: "Selected as an All-Star.", flags: ["award_all_star"] });
    }
  }

  // A genuinely new Fan Love narrative tier this season is "Around the
  // League" content, same mechanism rival_update/rivalry_narrative already
  // use — one event, filtered by type, no new plumbing.
  const crossedThresholds = FAN_LOVE_BAND_THRESHOLDS.filter(
    (t) => fanLoveBeforeThisSeason < t && player.hidden.fanLove >= t
  );
  if (crossedThresholds.length > 0) {
    const topThreshold = crossedThresholds[crossedThresholds.length - 1];
    events.push({
      id: `fanlove_milestone_${state.season}`, season: state.season, type: "fanlove_milestone",
      narrative: FAN_LOVE_MILESTONE_TEXT[topThreshold](state.team.name),
      flags: ["fanlove_milestone"],
    });
  }

  // ---- Consequences of past decisions land here ----
```

Add this constant near the top of the file, right after the imports (before the first exported function):

```ts
const FAN_LOVE_MILESTONE_TEXT: Record<number, (teamName: string) => string> = {
  14: (t) => `${t} fans are starting to learn the new name on the roster.`,
  32: (t) => `${t} fans are warming up to their guy.`,
  52: (t) => `Around the league, people are starting to know who plays for ${t}.`,
  72: (t) => `${t} fans are turning out because of nights like this one.`,
  88: (t) => `The league is talking about ${t}'s newest face.`,
};
```

Update the import line at the top of `career.ts`:

```ts
import { playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange } from "./fanlove";
```

becomes:

```ts
import {
  playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange, FAN_LOVE_BAND_THRESHOLDS,
} from "./fanlove";
```

- [ ] **Step 5: Store `lastDevelopment` on the returned `CareerState`**

Find, in `finishSeason` (search for `const next: CareerState = {` — it's the one that includes `timeline: [...state.timeline, entry],`):

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
  };
```

- [ ] **Step 6: Extend `SeasonComplete.tsx`'s `leagueNews` filter**

Find:

```tsx
  const leagueNews = events.filter((e) => e.type === "rival_update" || e.type === "rivalry_narrative");
```

Replace with:

```tsx
  const leagueNews = events.filter(
    (e) => e.type === "rival_update" || e.type === "rivalry_narrative" || e.type === "fanlove_milestone"
  );
```

- [ ] **Step 7: Write tests in `career.test.ts`**

Add this `describe` block at the end of the file:

```ts
describe("fanlove_milestone event", () => {
  it("never fires more than once per season, and only ever reflects an actual upward threshold crossing", () => {
    // Full tournament/RNG simulation makes the exact playoff outcome (and
    // therefore the exact Fan Love delta) uncontrollable from the test —
    // so this runs many seeds and checks the INVARIANT instead of forcing
    // one specific outcome: at most one event, and whenever one appears,
    // it must correspond to a real before/after crossing.
    let sawAtLeastOne = false;
    for (let seed = 0; seed < 60; seed++) {
      let state = initCareer(seed, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
      state = chooseFocus(state, "shooting");
      const fanLoveBefore = state.player.hidden.fanLove;
      const run = runSeason(state);
      const end = finishSeason(run.state, null);
      const milestones = end.events.filter((e) => e.type === "fanlove_milestone");
      expect(milestones.length).toBeLessThanOrEqual(1);
      if (milestones.length === 1) {
        sawAtLeastOne = true;
        const fanLoveAfter = end.state.player.hidden.fanLove;
        const crossedSomeThreshold = [14, 32, 52, 72, 88].some((t) => fanLoveBefore < t && fanLoveAfter >= t);
        expect(crossedSomeThreshold).toBe(true);
      }
    }
    expect(sawAtLeastOne).toBe(true); // the feature actually fires across 60 seeds, not dead code
  });

  it("does not fire when Fan Love starts the season already above every threshold", () => {
    let state = initCareer(11, { name: "T", country: "USA", position: "PG", height: 190, playstyle: "PLAYMAKER" });
    state = { ...state, player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 95 } } };
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    // 95 is already >= every threshold in FAN_LOVE_BAND_THRESHOLDS, so no
    // "before < threshold" condition can ever be true this season,
    // regardless of what the simulated season/playoff outcome turns out to be.
    expect(end.events.filter((e) => e.type === "fanlove_milestone").length).toBe(0);
  });
});

describe("lastDevelopment persists on CareerState", () => {
  it("finishSeason sets state.lastDevelopment to this season's development result", () => {
    let state = initCareer(12, { name: "T", country: "USA", position: "SF", height: 200, playstyle: "SLASHER" });
    state = chooseFocus(state, "finishing");
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.state.lastDevelopment).not.toBeNull();
    expect(end.state.lastDevelopment).toBe(end.development);
  });
});
```

- [ ] **Step 8: Typecheck and test**

Run: `npx tsc --noEmit` — must be clean. Run: `npm test` — confirm only the one known pre-existing failure.

- [ ] **Step 9: Commit**

```bash
git add src/engine/career.ts src/engine/career.test.ts src/ui/screens/SeasonComplete.tsx
git commit -m "feat: add fanlove_milestone Around the League reactions + persist lastDevelopment

Crossing a Fan Love narrative tier upward this season now surfaces a
third-person 'around the league' line, reusing the exact
filter-by-event-type mechanism rival_update/rivalry_narrative already
use — no new UI, no new plumbing. CareerState also now keeps this
season's development result (lastDevelopment) so screens reached after
Season Complete can still show what changed."
```

---

### Task 5: Status-aware draft reveal + Big Decision consequence text

**Files:**
- Modify: `src/engine/bigdecision.ts`
- Modify: `src/engine/bigdecision.test.ts`
- Modify: `src/ui/screens/DraftAndTournament.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PlayerStatus`/`playerStatus` (Task 1).
- `bigDecisionConsequence`'s signature gains a `status: PlayerStatus` parameter.
- `DraftNight`'s prop shape gains `status: PlayerStatus`.

- [ ] **Step 1: Make `bigDecisionConsequence` status-aware**

Read the current `src/engine/bigdecision.ts` in full first. Add the import at the top:

```ts
import { PlayerStatus } from "./status";
```

Find:

```ts
/** The text shown on the Big Decision's own consequence screen, right after the player chooses. */
export function bigDecisionConsequence(
  decision: BigDecision,
  optionId: string,
  moved: boolean,
  teamName: string
): string {
  if (decision.kind === "CAREER_CALL") {
    const opt = decision.options.find((o) => o.id === optionId);
    return opt?.result ?? "";
  }
  const opt = decision.options.find((o) => o.id === optionId);
  if (!opt) return "";
  if (!moved) return `You committed to ${teamName}. The organization built the next chapter around you.`;
  return `You signed with ${teamName}. It's a fresh start, and everyone there is watching to see what you do with it.`;
}
```

Replace with:

```ts
/** The text shown on the Big Decision's own consequence screen, right after the player chooses. */
export function bigDecisionConsequence(
  decision: BigDecision,
  optionId: string,
  moved: boolean,
  teamName: string,
  status: PlayerStatus
): string {
  if (decision.kind === "CAREER_CALL") {
    const opt = decision.options.find((o) => o.id === optionId);
    return opt?.result ?? "";
  }
  const opt = decision.options.find((o) => o.id === optionId);
  if (!opt) return "";
  if (!moved) return `You committed to ${teamName}. The organization built the next chapter around you.`;
  if (status === "LEGEND" || status === "MVP_LEVEL" || status === "ALL_STAR") {
    return `You signed with ${teamName}. Fans there already know exactly who they're getting.`;
  }
  if (status === "STARTER" || status === "ROTATION") {
    return `You signed with ${teamName}. It's a fresh start, and there's already some buzz about what you bring.`;
  }
  return `You signed with ${teamName}. It's a fresh start, and everyone there is watching to see what you do with it.`;
}
```

- [ ] **Step 2: Update `bigdecision.test.ts`**

Read the current file first — it calls `bigDecisionConsequence` three times (per the earlier grep: lines around 25, 34, 35). Add the import `import { PlayerStatus } from "./status";` if not already present, then update each existing call site to pass a fifth argument. For the "stays" call, use `"UNKNOWN"`; for the "moved" call, use `"UNKNOWN"` too (to preserve the exact pre-existing assertion, which expects the generic "fresh start... everyone there is watching" line). Find:

```ts
    const text = bigDecisionConsequence(call, call.options[0].id, false, "");
```

Replace with:

```ts
    const text = bigDecisionConsequence(call, call.options[0].id, false, "", "UNKNOWN");
```

Find:

```ts
    const stayed = bigDecisionConsequence(decision, "stay", false, "Boston Celtics");
```

Replace with:

```ts
    const stayed = bigDecisionConsequence(decision, "stay", false, "Boston Celtics", "UNKNOWN");
```

Find:

```ts
    const moved = bigDecisionConsequence(decision, "join", true, "Miami Heat");
```

Replace with:

```ts
    const moved = bigDecisionConsequence(decision, "join", true, "Miami Heat", "UNKNOWN");
```

Add this new test at the end of the `describe("bigDecisionConsequence", ...)` block (read the file to find its exact closing brace and insert before it — matches the existing test's own convention of `team: {} as any` for a fixture that doesn't need a real `Team`):

```ts
  it("gives a status-aware line for an accomplished player who moves teams", () => {
    const decision = { kind: "TEAM_OFFER" as const, id: "t", season: 5, prompt: "p", options: [
      { id: "join", team: {} as any, headline: "h", bullets: [], effects: {} },
    ] };
    const text = bigDecisionConsequence(decision, "join", true, "Miami Heat", "ALL_STAR");
    expect(text).toContain("already know exactly who they're getting");
  });
```

- [ ] **Step 3: Run, confirm tests pass**

Run: `npm test -- bigdecision.test.ts` — expect all tests passing.

- [ ] **Step 4: Make `DraftNight`'s REVEAL screen status-aware**

Read `src/ui/screens/DraftAndTournament.tsx` in full first. Add the import at the top:

```ts
import { PlayerStatus } from "../../engine/status";
```

Find:

```tsx
export function DraftNight({
  board, onSign,
}: { board: DraftBoard; onSign: (slot: DraftSlot, wasRandom: boolean) => void }) {
```

Replace with:

```tsx
export function DraftNight({
  board, status, onSign,
}: { board: DraftBoard; status: PlayerStatus; onSign: (slot: DraftSlot, wasRandom: boolean) => void }) {
```

Find, in the REVEAL branch:

```tsx
          <h1 className="mt-5 font-display uppercase text-[38px] leading-[0.95]">{revealed.team.name}</h1>
          <p className="mt-4 text-mute text-sm">
            {revealed.expectedRole} · TEAM OVR {revealed.team.ovr} · {revealed.market} market
          </p>
          <p className="mt-6 font-display uppercase text-[26px] text-amber">Welcome to the NBA.</p>
```

Replace with:

```tsx
          <h1 className="mt-5 font-display uppercase text-[38px] leading-[0.95]">{revealed.team.name}</h1>
          <p className="mt-4 text-mute text-sm">
            {revealed.expectedRole} · TEAM OVR {revealed.team.ovr} · {revealed.market} market
          </p>
          <p className="mt-2 text-mute text-[13px]">{draftNightReactionLine(status, revealed.team.name)}</p>
          <p className="mt-6 font-display uppercase text-[26px] text-amber">Welcome to the NBA.</p>
```

Add this function right above the `DraftNight` export:

```tsx
function draftNightReactionLine(status: PlayerStatus, teamName: string): string {
  if (status === "ALL_STAR" || status === "MVP_LEVEL" || status === "LEGEND") {
    return `The lottery buzz followed him all night — ${teamName} fans already know the name.`;
  }
  if (status === "ROTATION" || status === "STARTER") {
    return `A recognizable name on draft boards all year — ${teamName} fans have been watching for this pick.`;
  }
  return `Barely a footnote on draft boards — ${teamName} will be introducing him to their fans from scratch.`;
}
```

- [ ] **Step 5: Wire both call sites in `App.tsx`**

Read `src/App.tsx` in full first. Add the import `import { playerStatus } from "./engine/status";` near the top, alongside the other engine imports.

Find (the `chooseDecision` function):

```ts
  const chooseDecision = (id: string) => {
    if (!state || !decision) return;
    const beforeTeamId = state.team.id;
    const s2 = applyBigDecision(state, id, decision);
    setState(s2);
    const moved = decision.kind === "TEAM_OFFER" && s2.team.id !== beforeTeamId;
    setDecisionResultText(bigDecisionConsequence(decision, id, moved, s2.team.name));
    setStage("decision_result");
  };
```

Replace with:

```ts
  const chooseDecision = (id: string) => {
    if (!state || !decision) return;
    const beforeTeamId = state.team.id;
    const s2 = applyBigDecision(state, id, decision);
    setState(s2);
    const moved = decision.kind === "TEAM_OFFER" && s2.team.id !== beforeTeamId;
    const status = playerStatus(s2.player.hidden.reputation, s2.player.awards, s2.nbaSeasonsPlayed);
    setDecisionResultText(bigDecisionConsequence(decision, id, moved, s2.team.name, status));
    setStage("decision_result");
  };
```

Find (the `case "draft":` render):

```tsx
    case "draft":
      return state.draftBoard ? <DraftNight board={state.draftBoard} onSign={draftSigned} /> : null;
```

Replace with:

```tsx
    case "draft":
      return state.draftBoard ? (
        <DraftNight
          board={state.draftBoard}
          status={playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed)}
          onSign={draftSigned}
        />
      ) : null;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 7: Commit**

```bash
git add src/engine/bigdecision.ts src/engine/bigdecision.test.ts src/ui/screens/DraftAndTournament.tsx src/App.tsx
git commit -m "feat: status-aware draft reveal and Big Decision consequence text

Deliberately not a new event type or screen — both the draft-night reveal
and the Big Decision's existing consequence text now read differently for
an already-recognized player vs. a total unknown, right at the moment of
the transition, reusing the exact screens already shown there."
```

---

### Task 6: CareerHeader gains Role — the single source of identity/status

**Files:**
- Modify: `src/ui/components/CareerHeader.tsx`

**Interfaces:**
- No new exports; internal rendering change only.

- [ ] **Step 1: Add Role to the header's identity line**

Read the current file first. Add the import:

```tsx
import { ROLE_LABEL } from "../../engine/overall";
```

Find:

```tsx
          <div className="eyebrow mt-1 truncate">
            {teamName} · {state.player.position} · {state.age}
          </div>
```

Replace with:

```tsx
          <div className="eyebrow mt-1 truncate">
            {teamName} · {state.player.position} · {ROLE_LABEL[state.role]} · {state.age}
          </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — must be clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/CareerHeader.tsx
git commit -m "feat: show Role in CareerHeader — the single identity source of truth

Removing duplicated identity blocks from Season Complete and the Career
Hub (next two tasks) depends on the header actually carrying every field
those blocks showed — Role was the one piece missing."
```

---

### Task 7: Season Complete — compact Stats block, remove Development section and redundant team row

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx`

**Interfaces:**
- No prop-shape changes — `SeasonComplete`'s own signature is unchanged from Task 3/4's edits.

- [ ] **Step 1: Read the current file in full**

Confirm the current top-to-bottom order (Header → redundant team row → headline → Fan Love → Season stats → Decisions → Development → Awards → Draft stock → Around the League → What's next) and the exact current imports before editing — Tasks 3 and 4 already touched this file, so re-read it fresh rather than assuming line numbers from the original plan draft.

- [ ] **Step 2: Rewrite the `SeasonComplete` function**

Replace the entire `SeasonComplete` function (from `export function SeasonComplete({` through its closing `}`) with:

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
  // The rival's resolved outcome this season, Fan Love narrative-tier
  // crossings, and the rivalry line — all deferred until now so nothing is
  // seen before the player's own playoffs are done. This is the ONLY place
  // any of it is shown.
  const leagueNews = events.filter(
    (e) => e.type === "rival_update" || e.type === "rivalry_narrative" || e.type === "fanlove_milestone"
  );
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Eyebrow>Season {state.season} · age {state.age}</Eyebrow>
        <Title size="xl">Season<br />complete</Title>
      </div>

      <div className="mt-6 rise rise-1">
        <p className="font-display uppercase text-[26px] leading-[1.02]">
          {signatureMoment ? signatureMoment.narrative : conclusion.headline}
        </p>
        {conclusion.lines.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {conclusion.lines.map((l) => (
              <p key={l} className="text-[14px] text-mute leading-snug">{l}</p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rise rise-2">
        <Eyebrow>Stats</Eyebrow>
        <div className="mt-2">
          <StatLine items={[{ label: "PPG", value: s.ppg }, { label: "RPG", value: s.rpg }, { label: "APG", value: s.apg }]} />
        </div>
        <div className="flex justify-between py-2.5 text-sm border-b border-line">
          <span className="text-mute">Record</span>
          <span className="stat-num">{s.teamWins}–{s.teamLosses}</span>
        </div>
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
        <div className="mt-4">
          <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} status={status} />
        </div>
        {conclusion.awards.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {conclusion.awards.map((a) => (
              <span key={a} className="px-2.5 py-1 border border-amber/60 text-amber rounded-sm eyebrow">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      {conclusion.decisions.length > 0 && (
        <div className="mt-6 rise rise-2">
          <Divider label="Decisions This Season" />
          <div className="space-y-4">
            {conclusion.decisions.map((d, i) => (
              <div key={`${d.title}-${i}`} className="card px-3 py-2.5">
                <div className="eyebrow">{d.title}</div>
                <p className="text-[14px] mt-1">
                  <span className="text-mute">You chose: </span>{d.choice}
                </p>
                <p className="text-[13px] text-mute mt-1.5 leading-snug">{d.result}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {conclusion.draftStock && (
        <div className="mt-6 rise rise-3 flex items-center justify-between py-2.5 border-y border-line">
          <span className="eyebrow">Draft stock</span>
          <span className="font-display uppercase text-xl" style={{ color: stockTone }}>
            {conclusion.draftStock}
          </span>
        </div>
      )}

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

      <div className="mt-8 rise rise-3">
        <button className="btn-primary" onClick={onNext}>What's next</button>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 3: Update the file's imports**

Read the current import block. Remove `getTeamIdentity` (`../../engine/identity`), `TeamLogo` (`../components/TeamLogo`), and `ATTR_FLAVOR` — none are referenced anywhere else in this file (`DevelopmentScreen`, the other export in this file, doesn't use them either — confirm by re-reading it before deleting). Add `playerStatus` from `../../engine/status` (unless Task 3 already added it — check first, don't duplicate the import). The resulting import block should be:

```tsx
import { CareerState, SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL } from "../../engine/development";
import { playerStatus } from "../../engine/status";
import { Screen, Eyebrow, Title, StatLine, Divider } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { FanLove } from "../components/FanLove";
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx
git commit -m "refactor: compact Season Complete — remove redundant team row and the standalone Development section

Attribute deltas now live inside a single Stats block alongside PPG/RPG/
APG/Record, Fan Love, and Awards — no separate 'Development' section, no
per-attribute prose, and no team logo/name repeated below the header
(CareerHeader, now showing Role too, already covers it)."
```

---

### Task 8: Career Hub — remove duplicated identity block, trim SEASON tab, add deltas to STATS, reformat CAREER

**Files:**
- Modify: `src/ui/screens/CareerHub.tsx`

**Interfaces:**
- No prop-shape changes to `CareerHub` itself.

- [ ] **Step 1: Read the current file in full**

Confirm the current structure before editing: the top-level identity block (team logo/name/role/OVR/salary, duplicating `CareerHeader`), the `OvrBadge` helper, `SeasonTab` (uses `PlayerStatusPanel`), `TeamTab`, `StatsTab`, `CareerTab`.

- [ ] **Step 2: Update imports**

Replace the import block:

```tsx
import { useState } from "react";
import { CareerState, playerOvr, supportOf, TimelineEntry } from "../../engine/career";
import { ROLE_LABEL } from "../../engine/overall";
import { Screen, Eyebrow, StatLine } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { getTeamIdentity } from "../../engine/identity";
import { TeamLogo } from "../components/TeamLogo";
import { Attributes } from "../../engine/types";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { PlayerStatusPanel } from "../components/PlayerStatusPanel";
import { FanLove } from "../components/FanLove";
```

with:

```tsx
import { useState } from "react";
import { CareerState, supportOf, TimelineEntry } from "../../engine/career";
import { ROLE_LABEL } from "../../engine/overall";
import { Screen, Eyebrow, StatLine } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { getTeamIdentity } from "../../engine/identity";
import { TeamLogo } from "../components/TeamLogo";
import { Attributes } from "../../engine/types";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { playerStatus } from "../../engine/status";
import { FanLove } from "../components/FanLove";
```

(`playerOvr` and `PlayerStatusPanel` removed — both become unused once the identity block and `SeasonTab`'s `PlayerStatusPanel` call are removed below. `getTeamIdentity`/`TeamLogo` are KEPT — still used by `CareerTab`'s timeline entries.)

- [ ] **Step 3: Delete the `OvrBadge` helper**

Find and delete this entire function:

```tsx
function OvrBadge({ ovr, size = "lg" }: { ovr: number; size?: "lg" | "sm" }) {
  const tone = ovr >= 90 ? "#E8A33D" : ovr >= 80 ? "#EDE8DE" : "#8A99B8";
  return (
    <div className="text-right leading-none">
      <div className={`stat-num font-bold ${size === "lg" ? "text-[44px]" : "text-xl"}`} style={{ color: tone }}>
        {ovr}
      </div>
      <div className="eyebrow">Player OVR</div>
    </div>
  );
}
```

- [ ] **Step 4: Remove the redundant identity block from `CareerHub`**

Find:

```tsx
export function CareerHub({ state, onContinue }: { state: CareerState; onContinue: () => void }) {
  const [tab, setTab] = useState<Tab>("SEASON");
  const ovr = playerOvr(state);
  const support = supportOf(state);
  const last = state.lastStats;
  const league = state.phase === "NCAA" ? "College" : "NBA";

  const nextEvent =
    state.phase === "NCAA" && state.ncaaSeasonsRemaining === 1
      ? "Final college season, then the draft"
      : state.phase === "NCAA"
      ? "NCAA season"
      : state.contractYearsLeft <= 0
      ? "Contract year — free agency ahead"
      : "NBA season";

  return (
    <Screen>
      <CareerHeader state={state} />
      {/* Identity block — answers where am I, who for, how old, what role */}
      <div className="rise">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Age {state.age} · Season {state.season}</Eyebrow>
          <Eyebrow>{league}</Eyebrow>
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <TeamLogo identity={getTeamIdentity(state.team)} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display uppercase text-[30px] leading-[0.92]">{state.team.name}</h1>
            <div className="mt-1.5 text-sm text-mute">
              {state.player.position} #{state.jersey} · {ROLE_LABEL[state.role]}
            </div>
          </div>
          <OvrBadge ovr={ovr} />
        </div>

        {state.salary > 0 && (
          <div className="mt-2 eyebrow">
            ${state.salary}M / yr · {state.contractYearsLeft > 0 ? `${state.contractYearsLeft} yr left` : "expiring"}
          </div>
        )}
      </div>
```

Replace with:

```tsx
export function CareerHub({ state, onContinue }: { state: CareerState; onContinue: () => void }) {
  const [tab, setTab] = useState<Tab>("SEASON");
  const support = supportOf(state);
  const league = state.phase === "NCAA" ? "College" : "NBA";

  const nextEvent =
    state.phase === "NCAA" && state.ncaaSeasonsRemaining === 1
      ? "Final college season, then the draft"
      : state.phase === "NCAA"
      ? "NCAA season"
      : state.contractYearsLeft <= 0
      ? "Contract year — free agency ahead"
      : "NBA season";

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Age {state.age} · Season {state.season}</Eyebrow>
          <Eyebrow>{league}</Eyebrow>
        </div>
      </div>
```

(Note: `const last = state.lastStats;` was already unused in the original `CareerHub` function body — `SeasonTab` computes its own `last` internally — remove it here too as part of this edit, since it's dead code exposed by this diff. If it turns out to be used elsewhere in the function on re-reading, keep it and note that in the task report.)

- [ ] **Step 5: Trim `SeasonTab`, add `status`**

Find:

```tsx
function SeasonTab({ state, nextEvent }: { state: CareerState; nextEvent: string }) {
  const last = state.lastStats;
  return (
    <div>
      <PlayerStatusPanel state={state} />

      <div className="mt-5">
        <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} />
      </div>
```

Replace with:

```tsx
function SeasonTab({ state, nextEvent }: { state: CareerState; nextEvent: string }) {
  const last = state.lastStats;
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);
  return (
    <div>
      <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} status={status} />
```

(The rest of `SeasonTab` — the `last && (...)` block, Next, Goal — is unchanged.)

- [ ] **Step 6: Add salary to `TeamTab`**

Find:

```tsx
function TeamTab({ state, support }: { state: CareerState; support: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-display uppercase text-[22px] leading-none">{state.team.name}</div>
          <div className="eyebrow mt-1">{state.team.conference}</div>
        </div>
        <div className="text-right">
          <div className="stat-num text-2xl font-bold text-amber">{state.team.ovr}</div>
          <div className="eyebrow">TEAM OVR</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
```

Replace with:

```tsx
function TeamTab({ state, support }: { state: CareerState; support: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-display uppercase text-[22px] leading-none">{state.team.name}</div>
          <div className="eyebrow mt-1">{state.team.conference}</div>
        </div>
        <div className="text-right">
          <div className="stat-num text-2xl font-bold text-amber">{state.team.ovr}</div>
          <div className="eyebrow">TEAM OVR</div>
        </div>
      </div>

      {state.salary > 0 && (
        <div className="mt-3 eyebrow">
          ${state.salary}M / yr · {state.contractYearsLeft > 0 ? `${state.contractYearsLeft} yr left` : "expiring"}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
```

- [ ] **Step 7: Add `+N` deltas to `StatsTab`**

Find:

```tsx
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

Replace with:

```tsx
function StatsTab({ state }: { state: CareerState }) {
  const a = state.player.attributes;
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const deltas = new Map((state.lastDevelopment?.changes ?? []).map((c) => [c.attribute, c.delta]));
  const rows = profile.active.map((key) => ({ key, label: ATTR_DISPLAY_LABEL[key], value: a[key], delta: deltas.get(key) }));
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
            {r.delta !== undefined && r.delta !== 0 && (
              <span
                className="stat-num text-xs w-7 text-right"
                style={{ color: r.delta > 0 ? "#E8A33D" : "#FF4D3D" }}
              >
                {r.delta > 0 ? "+" : ""}{r.delta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Reformat `CareerTab`'s stat line**

Find:

```tsx
            {t.ppg > 0 && (
              <div className="stat-num text-[13px] text-mute mt-1">
                {t.ppg} / {t.rpg} / {t.apg}
              </div>
            )}
```

Replace with:

```tsx
            {t.ppg > 0 && (
              <div className="stat-num text-[13px] text-mute mt-1">
                {t.ppg} PPG • {t.rpg} RPG • {t.apg} APG
              </div>
            )}
```

- [ ] **Step 9: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — both must be clean.

- [ ] **Step 10: Commit**

```bash
git add src/ui/screens/CareerHub.tsx
git commit -m "refactor: compact the Career Hub — remove duplicated identity block, trim SEASON tab, add deltas to STATS, reformat CAREER

CareerHeader (with the Role it gained in the prior task) is now the only
identity source at the top of the Hub. SEASON tab drops its duplicate
attribute list (PlayerStatusPanel usage removed here only — the component
itself is untouched, still used by SeasonFlow.tsx). STATS gains +N
deltas from state.lastDevelopment. CAREER's stat line gains PPG/RPG/APG
labels. TEAM gains the salary/contract line the removed block used to
show."
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

All four must be clean (the one pre-existing `simulation.test.ts` OVR-spread failure is expected and unrelated to this plan — confirm it's the ONLY failure, and confirm the simulator still runs to completion across all 6 playstyles without crashing, since Task 2 changed how `signDraftPick`/`applyBigDecision` set `fanLove` and Task 4 changed `finishSeason`'s event output — `scripts/simulate-careers.ts` drives full careers through both).

- [ ] **Step 2: Real browser smoke test**

Start the dev server and play through a real career via `claude-in-chrome`. Specifically confirm:

1. **Fan Love team-transition fix**: note Fan Love and reputation near the end of college. On draft night, confirm Fan Love with the new NBA team is NOT equal to the college value, and is in a plausible band for the player's reputation/awards at that moment (use the browser's dev tools or the STATS/SEASON tab to cross-check the number if the exact value isn't otherwise visible). If a free-agency or trade `TEAM_OFFER` is reached later in the career, confirm the same reset behavior (not a flat -5 off the old number) — and confirm staying with the current team on a `TEAM_OFFER` still only applies the existing small +4 nudge, no reset.
2. **Fan Love status-awareness**: if the career reaches All-Star/MVP status, confirm the Fan Love band text never reads as "the fans barely know your name yet," even shortly after a team change.
3. **Draft night / Big Decision reactions**: confirm the draft-night reveal screen shows a status-aware line beneath the role/OVR/market line, and that signing with a new team via the Big Decision shows a status-aware consequence line.
4. **Fan Love milestone**: if Fan Love visibly crosses one of 14/32/52/72/88 upward in a season, confirm an "Around the League" card appears on that season's Season Complete screen with a third-person reaction line.
5. **Season Complete layout**: confirm there is no team logo/name row repeated below "Season complete" (the header above it already shows the team), no separate "Development" section with prose paragraphs, and that attribute deltas appear as compact `value +N` badges inside a single "Stats" block alongside PPG/RPG/APG/Record, with Fan Love and Awards immediately following, compact.
6. **Career Hub layout**: confirm there is no team logo/name/OVR/role block repeated below the header. Confirm the SEASON tab shows only Fan Love, last-season PPG/RPG/APG, Record, Next, and Goal — no attribute list. Confirm the STATS tab shows the full attribute list with `+N` deltas visible right after a season completes. Confirm the CAREER tab's per-season line reads `X PPG • Y RPG • Z APG`. Confirm the TEAM tab shows salary/contract info.
7. **Header**: confirm `CareerHeader` now shows Role as part of its identity line, everywhere it's rendered (Hub, Season Complete, Draft Night, etc.).

Report exactly what was visually verified.

- [ ] **Step 3: Final commit if the smoke test found anything to fix**

Only if the smoke test surfaces a genuine defect — fix it, re-verify Step 1, and commit. If clean, no further commit needed.

---

## Self-review notes (already applied above)

- **Spec coverage:** Fan Love per-team reset (Task 2), unified status signal (Task 1), status-aware Fan Love bands (Task 3), Fan Love milestone reactions reusing Around the League (Task 4), status-aware new-city reactions on existing screens instead of a new event system (Task 5), header becoming the single identity source including Role (Task 6), Season Complete compaction (Task 7), Career Hub compaction (Task 8) — every numbered section of the design spec maps to a task.
- **Placeholder scan:** every code block above is final, verbatim content — no "TBD," no "similar to Task N," no bare prose describing what a step should do without showing the code.
- **Type consistency:** `PlayerStatus` (Task 1) is defined once and consumed with the identical name and import path (`../../engine/status` from UI, `./status` from engine) everywhere it's used in Tasks 3, 5, 7, 8. `initialFanLoveForTeamChange` and `FAN_LOVE_BAND_THRESHOLDS` (Task 2) are defined once in `fanlove.ts` and consumed with matching signatures in Tasks 2 (career.ts), 3 (FanLove.tsx), and 4 (career.ts again). `CareerState.lastDevelopment` (Task 4) is produced once and consumed only in Task 8 with the matching `DevelopmentResult | null` type.
- **Cross-task ordering:** Task 3 depends on Tasks 1-2 (needs `PlayerStatus` and `FAN_LOVE_BAND_THRESHOLDS`); Task 4 depends on Task 2 (`FAN_LOVE_BAND_THRESHOLDS`); Task 5 depends on Task 1 only; Tasks 7-8 depend on Tasks 3, 4, and 6 (status-aware `FanLove`, `lastDevelopment`, header Role) — all satisfied by the task ordering above. Tasks 2 and 4 both touch `career.ts`'s `finishSeason`/`signDraftPick`/`applyBigDecision` but in disjoint regions (Task 2: the two team-change sites; Task 4: the top-of-function capture, the post-awards-loop milestone check, and the final `next` object) — Task 4's implementer should re-read the file fresh rather than assuming Task 2's exact line numbers.
