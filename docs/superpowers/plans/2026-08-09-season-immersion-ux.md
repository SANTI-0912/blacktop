# Season Immersion & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the season loop feel like an actual basketball career rather than a menu simulator — development rewards are visible and locked before you pick, the Big Decision moves to a real career moment after the playoffs, every in-season mini-decision's outcome is collected into a season recap (not a permanent log), the season screen always shows current attributes and progress, and a new Fan Love system gives the world a living reaction to what the player does.

**Architecture:** Extend the existing engine (`career.ts`, `development.ts`, `events.ts`, `bigdecision.ts`, `decisions.ts`, `threads.ts`, `types.ts`) with new state fields and a locked-reward roll; reorder `App.tsx`'s stage machine so the Big Decision fires after season completion instead of before the season starts; build one new shared UI component (`PlayerStatusPanel`) reused everywhere current attributes need to show, instead of duplicating attribute-bar rendering.

**Tech Stack:** Same as the existing project — React 18 + TypeScript + Vite + Tailwind, Vitest for tests.

## Global Constraints

- `src/engine/playstyle.ts`'s weight values are locked — do not change a single number in it.
- The active-attribute-pool restriction (development, aging, OVR, performanceScore) built in the previous plan stays exactly as is — nothing in this plan touches which attributes are active per playstyle.
- Development tier budget ranges stay exactly: REGRESSION [-4,-1], POOR [0,1], NORMAL [2,4], GOOD [5,6], BREAKOUT [7,7], RARE_BREAKOUT [8,9], LEGENDARY [10,13].
- Exactly 3 development options per season — unchanged from the existing weighted-without-replacement draw.
- The offseason workout minigame's rarity (~28% via `hasWorkoutOpportunity`) is unchanged.
- Do not touch the tournament/gauntlet inactive-attribute issue identified in the previous plan's final review — still explicitly out of scope.
- No permanent decision history anywhere in the UI — season-event decisions are visible ONLY (a) during the season they happened, and (b) in that season's "Decisions This Season" recap inside Season Complete. They vanish once the next season starts, except where an existing `threads.ts` delayed-consequence thread specifically references them (that system is untouched).
- `tsc --noEmit`, `npm test`, `vite build`, and `npm run simulate` must all stay clean throughout. Run them after every task.
- Keep the deterministic seeded-RNG pattern (`rngFor`/`createRNG`) for every new random roll — never `Math.random()`.

---

## File Structure

**New:**
- `src/ui/components/PlayerStatusPanel.tsx` — OVR/age/team/role header + current active-attribute bars. Single source of truth, used by `CareerHub` and the new season-progress screen.
- `src/ui/components/FanLove.tsx` — the Fan Love bar + narrative line, used by `CareerHub` and `SeasonComplete`.

**Modified:** `src/engine/types.ts`, `src/engine/development.ts`, `src/engine/career.ts`, `src/engine/events.ts`, `src/engine/bigdecision.ts`, `src/engine/decisions.ts`, `src/engine/threads.ts`, `src/engine/player.ts`, `src/App.tsx`, `src/ui/screens/Onboarding.tsx`, `src/ui/screens/SeasonFlow.tsx`, `src/ui/screens/SeasonComplete.tsx`, `src/ui/screens/CareerHub.tsx`.

**Not touched:** everything from the previous plan's "explicitly preserved" list, plus `focus.ts`'s aging curve, `overall.ts`, `simulation.ts`, `playstyle.ts`, draft/tournament/playoffs/teams/challenge/minigame files, `rival.ts`, `awards.ts`, `history.ts`, `identity.ts`, `schedule.ts`.

---

### Task 1: Types + state plumbing

**Files:**
- Modify: `src/engine/types.ts` (`Hidden.fanLove`)
- Modify: `src/engine/development.ts` (new `LockedDevelopment` type, `DevelopmentOptionView` reshaped)
- Modify: `src/engine/events.ts` (`GameEvent.title`, `EventOption.result`, `O()` helper signature — content authored in Task 2)
- Modify: `src/engine/bigdecision.ts` (`CallOption.result` field — content authored in Task 3)
- Modify: `src/engine/player.ts` (`baseHidden` gets a starting `fanLove`)
- Test: `src/engine/development.test.ts` (append), `src/engine/player.test.ts` (new, tiny)

**Interfaces:**
- Produces: `Hidden.fanLove: number` (0-100). `LockedDevelopment = { attribute: keyof Attributes; delta: number; tier: DevTier }`. `DevelopmentOptionView = { attribute: keyof Attributes; label: string; from: number; to: number; delta: number; tier: DevTier }` (replaces the old `{ previewLow, previewHigh }` shape — every later task that reads `DevelopmentOptionView` uses this new shape). `EventOption` gains `result: string` (required, not optional). `GameEvent` gains `title: string` (required).

- [ ] **Step 1: Add `fanLove` to `Hidden`**

In `src/engine/types.ts`, add to the `Hidden` type (after `reputation`):

```ts
export type Hidden = {
  confidence: number; // 0-100, volatile, decays toward 50 each season
  coachTrust: number; // 0-100
  reputation: number; // 0-100, sticky, long-term
  fanLove: number; // 0-100, how much the fanbase/media loves the player RIGHT NOW —
  // a livelier, faster-moving cousin of reputation. Reacts to wins, big moments,
  // awards, and loyalty; drifts with reputation on every decision that touches it.
  chemistry: number; // 0-100, resets partially on team change
  fatigue: number; // 0-100, partially resets each offseason
  injuryRisk: number; // 0-100, clamped, decays over time
  developmentRate: number; // 0.6 - 1.6, EFFICIENCY of growth (not a ceiling).
  // Starts neutral (~0.9-1.1) for every player and rival. It moves up or down
  // each season based on confidence, performance, and decisions/minigames.
  // Everyone retains a real path to an elite attribute ceiling (99) — this
  // number only affects how fast a player closes the gap to it.
};
```

- [ ] **Step 2: Give `fanLove` a starting value**

In `src/engine/player.ts`, `baseHidden()` currently returns an object without `fanLove`. Add it, matching `reputation`'s "starts low, earned" framing:

```ts
function baseHidden(rng: RNG): Hidden {
  return {
    confidence: randInt(rng, 55, 70),
    coachTrust: randInt(rng, 45, 60),
    reputation: randInt(rng, 20, 35), // reputation is earned, starts low even for elite prospects
    fanLove: randInt(rng, 15, 30), // fans don't know you yet either
    chemistry: randInt(rng, 50, 65),
    fatigue: 0,
    injuryRisk: randInt(rng, 5, 15),
    developmentRate: initialDevelopmentRate(rng),
  };
}
```

- [ ] **Step 3: Reshape `DevelopmentOptionView` and add `LockedDevelopment`**

In `src/engine/development.ts`, replace the existing `DevelopmentOptionView` type:

```ts
export type LockedDevelopment = { attribute: keyof Attributes; delta: number; tier: DevTier };

export type DevelopmentOptionView = {
  attribute: keyof Attributes;
  label: string;
  from: number;
  to: number;
  delta: number;
  tier: DevTier;
};
```

Do not implement `getDevelopmentOptions`'s new body yet — that's Task 4. This step only updates the type; `getDevelopmentOptions`'s current body will fail to type-check against the new return type until Task 4, which is fine — Task 4 lands in the same PR-equivalent work session immediately after. (If executing via subagent-driven-development, Tasks 1, 3, and 4 should be treated as one atomic unit for `tsc` purposes — see the note at the end of Task 4.)

- [ ] **Step 4: Add `title`/`result` to the events engine's types**

In `src/engine/events.ts`, replace `EventOption`, `GameEvent`, and the `O()` helper:

```ts
export type EventOption = {
  id: string;
  label: string;
  detail: string;
  effects: EventEffects;
  /** What actually happened as a result of this choice — never shown at
   * choice time, only collected into that season's "Decisions This Season"
   * recap. Must be specific to this option, not a restatement of `label`. */
  result: string;
  /** Opens a career thread — a consequence that pays off seasons later. */
  thread?: string;
};

export type GameEvent = {
  id: string;
  /** Short recap heading, e.g. "New Coach" — shown in the season recap, never the long `prompt`. */
  title: string;
  category: string;
  prompt: string;
  options: EventOption[];
  when: (c: EventContext) => boolean;
  weight?: number;
  once?: boolean;
};

const always = () => true;
const O = (id: string, label: string, detail: string, result: string, effects: EventEffects, thread?: string): EventOption =>
  ({ id, label, detail, effects, result, thread });
```

Do not touch `EVENT_POOL`'s content yet — that's Task 2 (it requires adding `title:` to every event object and a 4th positional argument to every `O(...)` call, which is pure content work best done as its own reviewable unit).

- [ ] **Step 5: Add `result` to `CallOption`**

In `src/engine/bigdecision.ts`, add to `CallOption`:

```ts
export type CallOption = {
  id: string;
  label: string;
  detail: string;
  /** What happened as a result of this choice — shown on the Big Decision's own consequence screen. */
  result: string;
  effects: Partial<Attributes> & Partial<Omit<Hidden, "developmentRate">>;
};
```

Do not touch the `CALLS` array's content yet — that's Task 3.

- [ ] **Step 6: Write a tiny `player.test.ts`**

Create `src/engine/player.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { createPlayer } from "./player";

describe("createPlayer", () => {
  it("gives every new player a starting fanLove in [15, 30]", () => {
    for (let seed = 0; seed < 20; seed++) {
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      expect(player.hidden.fanLove).toBeGreaterThanOrEqual(15);
      expect(player.hidden.fanLove).toBeLessThanOrEqual(30);
    }
  });
});
```

Run: `npm test -- player.test.ts` — expect PASS.

- [ ] **Step 7: Commit**

This task will not typecheck cleanly on its own (Steps 3-5 change types that Tasks 2-4 finish wiring). Commit anyway as a checkpoint — the plan's task-review process expects Tasks 1+2+3+4 to be reviewed as a connected sequence before the next full-project `tsc` gate. State this explicitly in the commit message.

```bash
git add src/engine/types.ts src/engine/player.ts src/engine/player.test.ts src/engine/development.ts src/engine/events.ts src/engine/bigdecision.ts
git commit -m "feat: type foundation for locked development rewards, fan love, and decision recaps

Types only — getDevelopmentOptions/EVENT_POOL/CALLS bodies are updated in
the next 3 tasks. tsc is expected to be red until Task 4 lands."
```

---

### Task 2: Author `events.ts` content (title + result for all 56 events)

This is pure narrative content, not architecture — every event needs a short recap title and every option needs a specific "what happened" result distinct from its `detail` (which describes the choice, not its outcome). Use the exact content below; it has already been written and calibrated to the game's existing voice (terse, second-person, dry confidence — matching `threads.ts`'s payoff style). Apply it directly rather than re-authoring.

**Files:**
- Modify: `src/engine/events.ts` (add `title:` to every `GameEvent`, add a `result` string as the 4th argument to every `O(...)` call)
- Test: `src/engine/events.test.ts` (new)

**Interfaces:**
- Consumes: `O()`'s new 4-arg-plus signature from Task 1 Step 4.
- Produces: every entry in `EVENT_POOL` has a non-empty `title` and every option has a non-empty `result`, verified by an automated coverage test — this is the completeness gate for this task.

- [ ] **Step 1: Write the coverage test first**

Create `src/engine/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EVENT_POOL } from "./events";

describe("EVENT_POOL content completeness", () => {
  it("every event has a non-empty title, distinct from its id", () => {
    for (const e of EVENT_POOL) {
      expect(e.title, `event "${e.id}" is missing a title`).toBeTruthy();
      expect(e.title.length).toBeGreaterThan(2);
    }
  });

  it("every option has a non-empty result, distinct from its label and detail", () => {
    for (const e of EVENT_POOL) {
      for (const o of e.options) {
        expect(o.result, `event "${e.id}" option "${o.id}" is missing a result`).toBeTruthy();
        expect(o.result).not.toBe(o.label);
        expect(o.result).not.toBe(o.detail);
      }
    }
  });

  it("has exactly 56 events (sanity check against accidental deletion)", () => {
    expect(EVENT_POOL.length).toBe(56);
  });
});
```

Run: `npm test -- events.test.ts` — expect FAIL (current `EVENT_POOL` has no `title`/`result` yet).

- [ ] **Step 2: Add `title` to each event and `result` to each option**

Apply this exact mapping to `EVENT_POOL` in `src/engine/events.ts`. For each event below: add `title: "..."` as a property on the event object (next to `category`), and insert the given result string as the 4th argument to that option's `O(...)` call (before `effects`).

| Event id | title | option a result | option b result | option c result |
|---|---|---|---|---|
| coach_primary_scorer | "New Role" | "The coach rebuilt the offense around you, and it stuck." | "You kept your game intact. The coach respects it, but the offense never fully became yours." | |
| coach_defense_demand | "Defensive Assignment" | "You bought in on the defensive end, and the coaching staff noticed." | "You held your ground on offense. The defensive question didn't go away." | "You quietly fixed it in the film room. Nobody had to say anything." |
| coach_lost_confidence | "Losing Minutes" | "The conversation cleared the air. Your minutes started coming back." | "You out-worked the doubt. The coach couldn't justify sitting you anymore." | "You waited it out. It cost you more than you expected." |
| coach_more_responsibility | "Running the Offense" | "You took command of the offense, and it showed in how the team moved." | "You stayed in your lane. The ball-handling role went to someone else." | |
| coach_fired | "Coaching Change" | "You won the new staff over fast. Your spot in the rotation never wavered." | "You let your play speak. It took longer than you hoped to win them over." | |
| teammate_conflict | "Teammate Conflict" | "You heard him out, and the ball started moving more freely." | "You held your ground. The tension in the locker room didn't fully clear." | "The coaching staff mediated it. The issue faded, but so did the closeness." |
| teammate_friend | "A Real Friendship" | "The two-man game became a real weapon on the floor." | "You kept it easy and social. The friendship held, on your terms." | |
| teammate_challenge | "The Young Challenger" | "You made your point in practice. The kid backed off, for now." | "You took him under your wing instead. The locker room noticed the leadership." | |
| teammate_trade_request | "Trade Request" | "You backed him publicly. It cost you a little with the front office." | "You put the team first. The organization noticed your professionalism." | "You said nothing. The story moved on without you in it." |
| teammate_pass_more | "Stagnant Offense" | "You got everyone involved, and the offense opened back up." | "You kept attacking. The ball movement complaints didn't go away." | |
| legend_mentor | "A Legend's Offer" | "The summer with him changed how you see the game." | "You took what you could without losing your own identity." | |
| legend_compare | "The Comparison" | "You embraced the comparison publicly. The pressure of it followed you." | "You deflected it gracefully. People respected the humility." | |
| legend_criticism | "Old-School Criticism" | "You fired back publicly. It got you attention, some of it unwanted." | "You said nothing and let your game answer instead." | |
| media_viral | "Gone Viral" | "You leaned into the spotlight. The attention followed you all season." | "You kept your head down. The moment passed, and so did most of the noise." | |
| media_overrated | "Overrated" | "You used it as fuel all season." | "You laughed it off in public. Nobody brought it up again." | "It got into your head more than you let on." |
| media_bad_interview | "Bad Interview" | "You apologized quickly. The story died within a week." | "You stood by what you said. It followed you longer than expected." | |
| media_next_great | "Face of the League" | "You accepted the weight of the label. It followed you all season." | "You deflected the hype. People respected the perspective." | |
| media_fans_turn | "Booed at Home" | "You played your way back into the crowd's good graces." | "You called the fans out. It didn't land the way you hoped." | |
| rival_trash_talk | "Rival Trash Talk" | "You fired back publicly. The rivalry got personal." | "You stayed quiet and let it build for the next matchup." | |
| rival_award | "Rival Wins Award" | "You used it as motivation heading into next season." | "You congratulated him publicly. People noticed the class." | |
| rival_signs_contender | "Rival Joins a Contender" | "You welcomed the challenge. It sharpened your focus." | "You stayed focused on your own team's business." | |
| rival_public_challenge | "Public Challenge" | "You accepted, right there in front of the cameras." | "You declined. Some people called it the smart move." | |
| contract_early_extension | "Early Extension" | "You signed for security. The front office appreciated the ease of it." | "You bet on yourself. The gamble is still playing out." | |
| contract_lowball | "Lowball Offer" | "You let it get public. It applied real pressure." | "You kept it professional. The numbers moved quietly, but they moved." | |
| contract_homecoming | "Homecoming Call" | "You let the idea sit. It's not going away." | "You shut it down. There's unfinished business here first." | |
| contract_year_pressure | "Contract Year" | "You chased the numbers. The stats went up, the locker room noticed." | "You played winning basketball. It paid off in ways a stat sheet doesn't show." | |
| injury_minor | "Rolled Ankle" | "You sat and let it heal properly." | "You played through it. It held up, this time." | |
| injury_serious | "Knee Scare" | "The full rehab took months, but you came back whole." | "You rushed the return. The team got you back sooner than your body wanted." | |
| fatigue_grind | "Road Grind" | "You took the night off. You were sharper for it." | "You played every minute. Nobody remembers tired, but your body does." | |
| injury_setback | "Setback" | "You studied the game from the sideline. It sharpened how you see the floor." | "You pushed the medical staff. They didn't love it, but they moved you up." | |
| ncaa_transfer_interest | "Transfer Interest" | "You took the call. Word got back to your coach." | "You shut it down fast. Your coach heard about that too." | |
| ncaa_scouts | "Scouts Watching" | "You played for the cameras. The tape looked good, on the stat sheet." | "You played for the team. Winning turned out to be the better audition." | |
| ncaa_one_and_done | "One and Done Talk" | "You told your coach the truth. He appreciated not being blindsided." | "You kept it open. It kept everyone guessing all season." | |
| ncaa_expectations | "Championship Expectations" | "You accepted the pressure and let it drive you." | "You lowered the temperature. The team played looser for it." | |
| olympic_callup | "Olympic Call-Up" | "You answered the call. The whole country was watching." | "You rested instead. Some fans back home didn't love the choice." | |
| olympic_expectation | "Gold or Nothing" | "You carried the weight of the country and never blinked." | "You blocked out the noise and just played." | |
| aging_athleticism | "Losing a Step" | "You rebuilt your game around the jumper. It's working." | "You trained to keep the legs. It's a battle you're still fighting." | "You slowed the game down and let your reads take over." |
| aging_veteran_role | "Bench Role" | "You accepted the bench role for the team. It earned you real respect." | "You pushed back and kept your starting spot. Not everyone loved the fight." | |
| aging_reinvent | "Reinvention" | "You tore your game down and rebuilt it. It's a different game now." | "You stuck with what worked. It still works, for now." | |
| aging_retirement_thoughts | "Thinking About the End" | "You pushed the thought away and kept playing like it." | "You started planning quietly, without telling anyone." | |
| lucky_hot_streak | "Hot Streak" | "You rode it as long as it lasted." | "You stayed within the offense. The streak evened out, but the habits stuck." | |
| fun_kid_meeting | "A Young Fan" | "He'll be telling that story for the rest of his life." | "He got to see it up close. So did the people who saw you do it." | |
| fun_charity | "Hometown Court" | "The whole community showed up for the opening." | "You helped quietly, no headline attached." | |
| luck_gym_rat | "Gym Rat" | "The extra work showed up on the floor." | "You built in recovery instead. Smarter, if less dramatic." | |
| coach_role_followup | "Adjusting to the Role" | "You adapted as defenses caught up, and stayed ahead of them." | "You forced the issue. It worked, eventually." | "You gave the scoring load up for a season. The team was better for it." |
| legend_followup | "Checking In" | "He didn't soften it, and it made you better." | "You told him you had it from here. He respected that too." | |
| injury_followup | "Old Injury, New Ache" | "You changed how you play around it. Less pounding, longer career." | "You ignored it again. It held up, mostly." | |
| rival_followup | "Rival's Respect" | "You returned it. The rivalry got a little less bitter." | "You kept the edge. Some rivalries aren't meant to soften." | |
| media_followup | "The Long Profile" | "You let them all the way in. The piece made you more human to people who'd only seen the highlights." | "You kept it about basketball. The piece was shorter, and so was the conversation about it." | |
| team_rebuild | "The Rebuild" | "You committed to growing with the young core." | "You asked out. The front office understood, even if it stung." | "You waited quietly to see who they'd bring in." |
| team_contender | "New Star Arrives" | "You embraced the pressure. This is what you signed up for." | "You worked on fitting together. It's starting to click." | |
| coach_new_arrival | "New Coach, New System" | "You bought into the new system, and it bought into you." | "You told him what you do best. It took some negotiating to fit." | |
| personal_routine | "Recovery Habits" | "The overhaul showed up in the fourth quarter." | "You kept doing what worked. Mostly, it still does." | |
| personal_fame | "Living in Public" | "You leaned into it. It comes with the territory." | "You pulled your life back. Smaller circle, quieter nights." | |
| teammate_injured | "Teammate Down" | "You carried the load, every night." | "You spread it around. The team held together because of it." | |
| ncaa_first_start | "First Start" | "You came out swinging. The building remembers it." | "You let the game come to you. It came." | |

(Option "d" exists on none of the events with a `title` above — every event in `EVENT_POOL` has at most 3 options. If Step 2 finds a 4th option on any event, that means the file changed since this plan was written; add a result following the same pattern and note it in your report.)

- [ ] **Step 3: Run the coverage test**

Run: `npm test -- events.test.ts` — expect all 3 tests PASS (56 events, every title/result populated).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — this file alone should now be internally consistent; full-project clean depends on Tasks 3-4 also landing (per Task 1's note). If Task 1, 3, and 4 aren't all done yet, expect unrelated errors elsewhere — confirm none of them are in `events.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/events.ts src/engine/events.test.ts
git commit -m "content: add recap titles and result text to all 56 season events"
```

---

### Task 3: Author `bigdecision.ts` content (CallOption results + TeamOption consequence)

**Files:**
- Modify: `src/engine/bigdecision.ts` (add `result` to each `CallOption`, add `bigDecisionConsequence()` function)
- Test: `src/engine/bigdecision.test.ts` (new)

**Interfaces:**
- Consumes: `CallOption.result` field from Task 1 Step 5.
- Produces: `bigDecisionConsequence(decision: BigDecision, optionId: string, moved: boolean, teamName: string): string` — the text shown on the Big Decision's own consequence screen (App.tsx wiring happens in Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/engine/bigdecision.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateCareerCall, bigDecisionConsequence, CallOption } from "./bigdecision";
import { createRNG } from "./rng";

describe("CALLS content completeness", () => {
  it("every CallOption has a non-empty result distinct from its label and detail", () => {
    // Draw every prompt at least once by sampling many seeds.
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const call = generateCareerCall(createRNG(seed), 1);
      seen.add(call.prompt);
      // generateCareerCall always returns the CAREER_CALL variant at runtime,
      // but its declared return type is the BigDecision union — cast so
      // `.result`/`.label`/`.detail` type-check without a redundant kind check.
      for (const o of call.options as CallOption[]) {
        expect(o.result, `call "${call.prompt}" option "${o.id}" is missing a result`).toBeTruthy();
        expect(o.result).not.toBe(o.label);
        expect(o.result).not.toBe(o.detail);
      }
    }
    expect(seen.size).toBe(5); // sanity: all 5 CALLS prompts got sampled
  });
});

describe("bigDecisionConsequence", () => {
  it("returns the authored result for a CAREER_CALL", () => {
    const call = generateCareerCall(createRNG(1), 1);
    const text = bigDecisionConsequence(call, call.options[0].id, false, "");
    expect(text).toBe((call.options[0] as any).result);
  });

  it("returns a templated line for a TEAM_OFFER, distinguishing moved vs. stayed", () => {
    const decision = { kind: "TEAM_OFFER" as const, id: "x", season: 1, prompt: "p", options: [
      { id: "stay", team: {} as any, headline: "h", bullets: [], effects: {} },
      { id: "join", team: {} as any, headline: "h2", bullets: [], effects: {} },
    ] };
    const stayed = bigDecisionConsequence(decision, "stay", false, "Boston Celtics");
    const moved = bigDecisionConsequence(decision, "join", true, "Miami Heat");
    expect(stayed).toContain("Boston Celtics");
    expect(moved).toContain("Miami Heat");
    expect(stayed).not.toBe(moved);
  });
});
```

Run: `npm test -- bigdecision.test.ts` — expect FAIL.

- [ ] **Step 2: Add `result` to every `CallOption` in `CALLS`**

Apply exactly:

```ts
const CALLS: { prompt: string; options: CallOption[] }[] = [
  {
    prompt: "The coaching staff wants to redefine your role for next season.",
    options: [
      { id: "a", label: "Ask to be the primary option", detail: "More shots, more blame when it doesn't fall.", result: "More shots came your way, and so did more of the blame when they didn't fall.", effects: { shooting: 3, confidence: 8, coachTrust: -5, reputation: 4 } },
      { id: "b", label: "Become the defensive anchor", detail: "The dirty work nobody puts on a highlight reel.", result: "The coaching staff leaned on you every night, and it built real trust.", effects: { defense: 5, strength: 2, coachTrust: 12, fatigue: 6 } },
      { id: "c", label: "Run the offense", detail: "The ball starts and ends with your reads.", result: "The offense started running through your reads, and the team responded.", effects: { passing: 4, basketballIQ: 3, chemistry: 10 } },
      { id: "d", label: "Do whatever the team needs", detail: "No ego. Fill the gaps.", result: "You filled every gap asked of you. Nobody noticed, except the people who mattered.", effects: { shooting: 1, defense: 1, passing: 1, basketballIQ: 2, coachTrust: 7, chemistry: 6 } },
    ],
  },
  {
    prompt: "A veteran superstar offers to take you under his wing — on his terms.",
    options: [
      { id: "a", label: "Accept and learn from him", detail: "You defer this season. You come back sharper.", result: "You deferred for a season and came back a sharper player for it.", effects: { basketballIQ: 5, clutch: 3, chemistry: 12, confidence: -3 } },
      { id: "b", label: "Decline — this is your team", detail: "You didn't come here to wait your turn.", result: "You held your ground. It cost you some chemistry, but you kept your identity.", effects: { confidence: 12, reputation: 5, chemistry: -12, coachTrust: -4 } },
      { id: "c", label: "Take the advice, keep your role", detail: "Listen without stepping back.", result: "You listened without stepping back. It was the balance you wanted.", effects: { basketballIQ: 3, chemistry: 4, confidence: 2 } },
    ],
  },
  {
    prompt: "Your body is sending warnings. The medical staff wants a full shutdown.",
    options: [
      { id: "a", label: "Shut it down and heal properly", detail: "You'll miss games. You'll come back whole.", result: "You missed time, but you came back whole.", effects: { injuryRisk: -22, fatigue: -25, coachTrust: -6, reputation: -3 } },
      { id: "b", label: "Play through everything", detail: "They'll remember that you never sat.", result: "You never sat. Your body is still paying the bill.", effects: { injuryRisk: 22, fatigue: 14, coachTrust: 14, reputation: 7, clutch: 3 } },
      { id: "c", label: "Manage the load with the staff", detail: "Fewer minutes, smarter minutes.", result: "Fewer minutes, smarter minutes. It worked.", effects: { injuryRisk: -9, fatigue: -12, coachTrust: 3 } },
    ],
  },
  {
    prompt: "The offseason is yours. What do you build?",
    options: [
      { id: "a", label: "An unguardable jumper", detail: "Thousands of reps until it's automatic.", result: "The reps paid off. The shot looks automatic now.", effects: { shooting: 6, confidence: 5, fatigue: 5 } },
      { id: "b", label: "A body nobody can move", detail: "Strength, conditioning, durability.", result: "You're stronger and more durable than you've ever been.", effects: { strength: 5, athleticism: 3, injuryRisk: -10 } },
      { id: "c", label: "Ice in your veins", detail: "Late-game situations, over and over.", result: "The late-game reps showed up when it mattered most.", effects: { clutch: 6, basketballIQ: 3, confidence: 4 } },
      { id: "d", label: "A complete game", detail: "No holes for anyone to attack.", result: "There's no obvious hole in your game anymore.", effects: { shooting: 2, passing: 2, defense: 2, ballHandling: 2, basketballIQ: 2 } },
    ],
  },
  {
    prompt: "The locker room has split, and both sides are waiting to see where you stand.",
    options: [
      { id: "a", label: "Take control of the room", detail: "You say it out loud, in front of everyone.", result: "You said it out loud, and the room fell in line behind you.", effects: { reputation: 8, coachTrust: 6, chemistry: 12, clutch: 2, fatigue: 5 } },
      { id: "b", label: "Stay out of it and produce", detail: "Let the numbers speak.", result: "You let the numbers speak. The room sorted itself out, eventually.", effects: { confidence: 5, chemistry: -8 } },
      { id: "c", label: "Handle it privately, one by one", detail: "No headlines. Just conversations.", result: "No headlines, just conversations. It worked quietly.", effects: { chemistry: 9, basketballIQ: 2, coachTrust: 5 } },
    ],
  },
];
```

- [ ] **Step 3: Add `bigDecisionConsequence()`**

Append to `src/engine/bigdecision.ts`:

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

- [ ] **Step 4: Run tests**

Run: `npm test -- bigdecision.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/bigdecision.ts src/engine/bigdecision.test.ts
git commit -m "content: add consequence text for the Big Decision (CALLS + team offers)"
```

---

### Task 4: Locked development roll (`development.ts`, `career.ts`)

This is the core mechanical change for requirement #1: the reward shown on a development card is exact and never rerolled.

**Files:**
- Modify: `src/engine/development.ts` (`getDevelopmentOptions` body, `rollDevelopment` accepts `locked`)
- Modify: `src/engine/career.ts` (`CareerState.lockedDevelopment`, `chooseFocus`, `getSeasonDevelopmentOptions`, `finishSeason`)
- Test: `src/engine/development.test.ts` (append), `src/engine/career.test.ts` (append)

**Interfaces:**
- Produces: `getDevelopmentOptions(rng, player, recentDevAttrs, age, lastPerformance): DevelopmentOptionView[]` (signature changed — now takes `player: Person` instead of just `playstyle`, plus `age`/`lastPerformance`). `rollDevelopment(params)` gains an optional `locked?: LockedDevelopment` param. `CareerState.lockedDevelopment: LockedDevelopment | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/development.test.ts`:

```ts
describe("getDevelopmentOptions returns locked, concrete rewards", () => {
  it("every option has from/to/delta consistent with the player's current attribute", () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRNG(seed);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const options = getDevelopmentOptions(rng, player, [], 24, 0.7);
      for (const o of options) {
        expect(o.from).toBe(Math.round(player.attributes[o.attribute]));
        expect(o.to - o.from).toBe(o.delta);
        expect(o.delta).toBeGreaterThan(0);
        expect(o.to).toBeLessThanOrEqual(99);
      }
    }
  });

  it("never produces a REGRESSION-tier option (cards are always an upgrade)", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRNG(seed * 13);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "C", height: 210, playstyle: "INTERIOR",
      });
      const options = getDevelopmentOptions(rng, player, [], 33, 0.5); // old age, poor form — worst case for REGRESSION odds
      for (const o of options) expect(o.tier).not.toBe("REGRESSION");
    }
  });

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
});

describe("rollDevelopment with a locked primary", () => {
  it("applies exactly the locked attribute/delta, never re-rolling it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRNG(seed);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const locked = { attribute: "shooting" as const, delta: 3, tier: "NORMAL" as const };
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 24, performance: 0.7, locked });
      const primary = result.changes.find((c) => c.attribute === "shooting");
      expect(primary?.delta).toBe(3);
      expect(result.tier).toBe("NORMAL");
    }
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- development.test.ts` — expect FAIL (`getDevelopmentOptions`'s old signature/body, `rollDevelopment` has no `locked` param yet).

- [ ] **Step 3: Rewrite `getDevelopmentOptions`**

In `src/engine/development.ts`, add a helper and replace the function body:

```ts
/** Re-rolls up to 5 times to avoid handing the player a card that reads as a downgrade. */
function rollPositiveTier(rng: RNG, age: number, performance: number, confidence: number, coachTrust: number): DevTier {
  for (let i = 0; i < 5; i++) {
    const t = rollTier(rng, age, performance, confidence, coachTrust);
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

  const { confidence, coachTrust, developmentRate } = player.hidden;
  const rate = clamp(developmentRate, 0.75, 1.3);

  return picked.map((attribute) => {
    const tier = rollPositiveTier(rng, age, lastPerformance, confidence, coachTrust);
    const [lo, hi] = TIER_BUDGET[tier];
    const current = player.attributes[attribute];
    const rawDelta = Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
    const to = clamp(Math.round(current) + rawDelta, 30, 99);
    const from = Math.round(current);
    return { attribute, label: ATTR_LABEL[attribute], from, to, delta: to - from, tier };
  });
}
```

Remove the old `DevelopmentOptionView`-returning body entirely (this replaces it, not extends it) — the old static `previewLow`/`previewHigh` fields are gone.

- [ ] **Step 4: Add `locked` support to `rollDevelopment`**

Replace the non-REGRESSION branch's primary-selection lines in `rollDevelopment`:

```ts
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
  const { confidence, coachTrust, developmentRate } = person.hidden;
  const profile = PLAYSTYLE_PROFILES[person.playstyle];
  const rate = clamp(developmentRate, 0.75, 1.3);

  const tier = locked ? locked.tier : rollTier(rng, age, performance, confidence, coachTrust);
  const [lo, hi] = TIER_BUDGET[tier];

  if (!locked && tier === "REGRESSION") {
    // ...unchanged REGRESSION branch, exactly as it exists today...
  }

  const changes: DevChange[] = [];
  const used = new Set<string>();

  const primary = locked ? locked.attribute : (focus && profile.active.includes(focus) ? focus : pickFromActive(rng, person.playstyle, profile.active));
  const primaryDelta = locked ? locked.delta : Math.max(1, Math.round(randRange(rng, lo, hi) * rate));
  used.add(primary);
  changes.push({ attribute: primary, delta: primaryDelta });

  // SECONDARY: unchanged — still rolled fresh at season end regardless of locked.
  if (tier !== "POOR") {
    // ...unchanged secondary-nudge loop, exactly as it exists today...
  }

  return finish(tier, changes, person);
}
```

(The `REGRESSION` branch and the secondary-nudge loop are copy-pasted verbatim from the current file — only the primary-selection lines change. Do not modify their internals.)

- [ ] **Step 5: Wire `career.ts`**

Add to `CareerState` (near `focus`):

```ts
  /** Focus chosen for the CURRENT season. */
  focus: FocusKey | null;
  /** The exact, already-rolled reward for the chosen focus — set at pick time, applied at season end without re-rolling. */
  lockedDevelopment: LockedDevelopment | null;
  /** Last 1-2 seasons' chosen development attribute, for pool-variety cooldown. */
  recentDevAttrs: FocusKey[];
```

Add the import: `import { ..., getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment } from "./development";` (merge into the existing development.ts import block).

In `initCareer`'s returned object, add `lockedDevelopment: null,` next to `focus: null,`.

Replace `getSeasonDevelopmentOptions`:

```ts
export function getSeasonDevelopmentOptions(state: CareerState): DevelopmentOptionView[] {
  return getDevelopmentOptions(
    rngFor(state, 8), state.player, state.recentDevAttrs, state.age,
    state.lastStats?.performanceScore ?? 0.7
  );
}
```

Replace `chooseFocus`:

```ts
export function chooseFocus(state: CareerState, focus: FocusKey): CareerState {
  const options = getSeasonDevelopmentOptions(state);
  const chosen = options.find((o) => o.attribute === focus);
  const next = {
    ...state,
    focus,
    lockedDevelopment: chosen ? { attribute: chosen.attribute, delta: chosen.delta, tier: chosen.tier } : null,
    recentDevAttrs: [focus, ...state.recentDevAttrs].slice(0, 2),
  };
  const { roster, role } = refreshRoster(next, rngFor(state, 9));
  return { ...next, roster, role };
}
```

In `finishSeason`, find the existing call:

```ts
const baseDevelopment = rollDevelopment({
  rng, person: player, focus: state.focus, age: state.age, performance: stats.performanceScore,
});
```

Replace with:

```ts
const baseDevelopment = rollDevelopment({
  rng, person: player, focus: state.focus, age: state.age, performance: stats.performanceScore,
  locked: state.lockedDevelopment ?? undefined,
});
```

In the `next: CareerState` object built later in `finishSeason` (the one that already resets `seasonEventCategories: []`), add `lockedDevelopment: null,` to the reset — the lock only ever applies to the season it was made for.

- [ ] **Step 6: Full typecheck (this is where Tasks 1-4 converge)**

Run: `npx tsc --noEmit` — expect clean now. If not, the errors will point at any remaining caller of the old `getDevelopmentOptions`/`DevelopmentOptionView` shape — fix in place (the only remaining caller outside this task's files is `Onboarding.tsx`'s `DevelopmentSelect`, which Task 7 rewrites — if `tsc` still complains there, that's expected until Task 7 lands; confirm no OTHER file is affected).

- [ ] **Step 7: Run tests**

Run: `npm test -- development.test.ts career.test.ts` — expect all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/engine/development.ts src/engine/career.ts src/engine/development.test.ts src/engine/career.test.ts
git commit -m "feat: lock development rewards at pick time instead of rolling them at season end"
```

---

### Task 5: Season decisions recap + Fan Love updates (`career.ts`, `decisions.ts`, `threads.ts`)

**Files:**
- Modify: `src/engine/career.ts` (`CareerState.seasonDecisions`, `SeasonConclusion.decisions`, `applySeasonEvent`, `finishSeason`, big-moment fan-love bumps, Big Decision loyalty bump)
- Modify: `src/engine/decisions.ts` (`applyDecisionEffects` derives fanLove from reputation deltas)
- Modify: `src/engine/threads.ts` (`applyThreadEffects`, same derivation)
- Test: `src/engine/career.test.ts` (append), `src/engine/decisions.test.ts` (new)

**Interfaces:**
- Produces: `SeasonDecisionEntry = { title: string; choice: string; result: string }`. `CareerState.seasonDecisions: SeasonDecisionEntry[]`. `SeasonConclusion.decisions: SeasonDecisionEntry[]` — this is what Task 9's UI reads.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/career.test.ts`:

```ts
import { applySeasonEvent, buildEventContext } from "./career";
import { pickEvent } from "./events";

describe("season decisions recap", () => {
  it("accumulates a decision entry each time a season event is chosen", () => {
    let state = initCareer(1, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    state = chooseFocus(state, "shooting");
    expect(state.seasonDecisions).toEqual([]);

    const ctx = buildEventContext(state);
    const rng = createRNG(99);
    const ev = pickEvent(rng, ctx, [], []);
    if (ev) {
      state = applySeasonEvent(state, ev, ev.options[0].id);
      expect(state.seasonDecisions.length).toBe(1);
      expect(state.seasonDecisions[0].title).toBe(ev.title);
      expect(state.seasonDecisions[0].choice).toBe(ev.options[0].label);
      expect(state.seasonDecisions[0].result).toBe(ev.options[0].result);
    }
  });

  it("clears seasonDecisions once the season ends", () => {
    let state = initCareer(2, { name: "T", country: "USA", position: "PG", height: 190, playstyle: "PLAYMAKER" });
    state = chooseFocus(state, "passing");
    const ctx = buildEventContext(state);
    const ev = pickEvent(createRNG(5), ctx, [], []);
    if (ev) state = applySeasonEvent(state, ev, ev.options[0].id);
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.conclusion?.decisions.length).toBeGreaterThanOrEqual(0); // conclusion carries THIS season's list
    expect(end.state.seasonDecisions).toEqual([]); // next season starts clean
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- career.test.ts` — expect FAIL (`seasonDecisions` doesn't exist yet).

- [ ] **Step 3: Add `seasonDecisions` to `CareerState` and wire `applySeasonEvent`**

In `career.ts`, add near `seasonEventCategories`:

```ts
  /** Categories already used this season, for within-season variety. */
  seasonEventCategories: string[];
  /** Mini-decisions made THIS season, with their result — collected for the
   * Season Complete recap, then cleared. Never a permanent history. */
  seasonDecisions: SeasonDecisionEntry[];
```

Add the exported type near `TimelineEntry`:

```ts
export type SeasonDecisionEntry = { title: string; choice: string; result: string };
```

In `initCareer`'s returned object, add `seasonDecisions: [],` next to `seasonEventCategories: [],`.

Update `applySeasonEvent`:

```ts
export function applySeasonEvent(state: CareerState, ev: GameEvent, optionId: string): CareerState {
  const opt = ev.options.find((o) => o.id === optionId) ?? ev.options[0];
  const player = applyDecisionEffects(state.player, { id: opt.id, label: opt.label, effects: opt.effects, tags: [] });
  const threads = opt.thread
    ? openThread(state.threads, opt.thread, state.season, rngFor(state, 52))
    : state.threads;
  const entry: CareerEvent = {
    id: `event_${ev.id}_${state.season}`,
    season: state.season,
    type: "season_event",
    narrative: `${opt.label} — ${opt.detail}`,
    flags: [ev.category.toLowerCase()],
  };
  const decisionEntry: SeasonDecisionEntry = { title: ev.title, choice: opt.label, result: opt.result };
  const next = {
    ...state,
    player,
    threads,
    seasonDecisions: [...state.seasonDecisions, decisionEntry],
    recentEventIds: [ev.id, ...state.recentEventIds].slice(0, 10),
    seenEventIds: state.seenEventIds.includes(ev.id) ? state.seenEventIds : [...state.seenEventIds, ev.id],
    seasonEventCategories: [...state.seasonEventCategories, ev.category],
    log: [...state.log, entry],
  };
  const { roster, role } = refreshRoster(next, rngFor(state, 51));
  return { ...next, roster, role };
}
```

- [ ] **Step 4: Carry the season's decisions into `SeasonConclusion`, then clear them**

In `finishSeason`, add `decisions: SeasonDecisionEntry[]` to the `SeasonConclusion` type:

```ts
export type SeasonConclusion = {
  headline: string;
  lines: string[];
  stats: SeasonStats;
  awards: string[];
  draftStock: "RISING" | "STEADY" | "FALLING" | null;
  decisions: SeasonDecisionEntry[];
};
```

`buildConclusion`'s signature gains a `decisions: SeasonDecisionEntry[]` parameter, returned as-is on the result object. In `finishSeason`, pass `state.seasonDecisions` (read BEFORE it's cleared) into `buildConclusion`'s call:

```ts
const conclusion = buildConclusion(
  state, stats, development, awards.map((a) => a.type.replace(/_/g, " ")), t, lg,
  events.filter((e) => e.type === "consequence" || e.type === "callback").map((e) => e.narrative),
  state.seasonDecisions
);
```

And in the `next: CareerState` object built earlier in `finishSeason` (the one already resetting `seasonEventCategories: []`), add `seasonDecisions: [],` to the reset.

- [ ] **Step 5: Fan Love — derive from reputation deltas at the shared effect layer**

In `src/engine/decisions.ts`, `applyDecisionEffects`, after the existing `hiddenKeys` loop, add:

```ts
export function applyDecisionEffects(person: Person, option: DecisionOption): Person {
  const attributes: Attributes = { ...person.attributes };
  const hidden: Hidden = { ...person.hidden };

  const attrKeys: (keyof Attributes)[] = [
    "shooting", "finishing", "passing", "ballHandling",
    "defense", "athleticism", "strength", "basketballIQ",
  ];
  const hiddenKeys: (keyof Omit<Hidden, "developmentRate">)[] = [
    "confidence", "coachTrust", "reputation", "chemistry", "fatigue", "injuryRisk",
  ];

  for (const key of attrKeys) {
    if (option.effects[key] !== undefined) {
      attributes[key] = clamp(attributes[key] + (option.effects[key] as number), 30, 99);
    }
  }
  for (const key of hiddenKeys) {
    if (option.effects[key] !== undefined) {
      hidden[key] = clamp(hidden[key] + (option.effects[key] as number), 0, 100);
    }
  }
  // Fan affection is a livelier, correlated echo of reputation — it moves
  // whenever reputation does, at about half the magnitude, without needing
  // every decision/event to author a separate fanLove effect by hand.
  if (option.effects.reputation !== undefined) {
    hidden.fanLove = clamp(hidden.fanLove + (option.effects.reputation as number) * 0.5, 0, 100);
  }

  return { ...person, attributes, hidden };
}
```

Apply the identical pattern to `src/engine/threads.ts`'s `applyThreadEffects` (same shape: after its existing hidden-keys loop, add the same `if (effects.reputation !== undefined) hidden.fanLove = clamp(...)` block, reading from `ThreadEffects` instead of `DecisionOption["effects"]`).

- [ ] **Step 6: Explicit fan-love bumps at the big career moments**

In `career.ts`:

In `resolveTournamentRound`, right after the existing `confidence`/`reputation` update in the `player = {...}` block, add `fanLove` to the same `hidden` object:

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

In `finishSeason`'s `pending`/`outcome` branch, same pattern — add `fanLove: clamp(player.hidden.fanLove + magnitude * 0.6, 0, 100),` alongside the existing `confidence`/`reputation` lines in that block's `hidden` object.

In `finishOlympics`, the final returned object already does `hidden: { ...state.player.hidden, reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100) }` — extend it:

```ts
    player: {
      ...state.player,
      hidden: {
        ...state.player.hidden,
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: clamp(state.player.hidden.fanLove + (won ? 18 : 6), 0, 100),
      },
    },
```

In `finishSeason`'s awards loop, where it currently checks `if (a.type === "MVP" && !hadMvp)` and `else if (a.type === "ALL_STAR")` to push narrative events, ALSO bump fan love (this doesn't need its own event, just a state change — apply it to `player.hidden` before the loop, or fold into the loop body):

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

(Need `clamp` imported in `career.ts` — it already is, from `./rng`.)

In `applyBigDecision`, add a small loyalty bump/penalty. Find the `TEAM_OFFER` branch, which already computes `moved`:

```ts
  if (decision.kind === "TEAM_OFFER") {
    const opt = decision.options.find((o) => o.id === optionId) as TeamOption;
    const moved = opt.team.id !== state.team.id;
    team = opt.team;
    player = applyDecisionEffects(player, { id: opt.id, label: opt.headline, effects: opt.effects, tags: [] });
    player = { ...player, hidden: { ...player.hidden, fanLove: clamp(player.hidden.fanLove + (moved ? -5 : 3), 0, 100) } };
    if (opt.years) { contractYearsLeft = opt.years; salary = opt.salary ?? salary; }
    ...
```

- [ ] **Step 7: Run tests**

Run: `npm test -- career.test.ts` — expect PASS. Run `npm test` (full suite) — expect all passing.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` — expect clean.

```bash
git add src/engine/career.ts src/engine/decisions.ts src/engine/threads.ts src/engine/career.test.ts
git commit -m "feat: collect this season's mini-decisions into a recap; add Fan Love reacting to reputation and career moments"
```

---

### Task 6: Reorder the stage machine — Big Decision moves after Season Complete (`App.tsx`)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `bigDecisionConsequence` (Task 3), `getBigDecision`/`applyBigDecision` (unchanged signatures, just called from a new place).
- Produces: new stage `"decision_result"`, new handler `afterSeasonComplete`.

- [ ] **Step 1: Remove the Big Decision from the pre-season handlers**

Replace `pickFocus` and `finishWorkout` — both currently transition into `getBigDecision`/`"decision"`. They should now go straight into the season-events check (the logic already in `chooseDecision` today, minus the decision itself):

```tsx
  const proceedToSeasonEvents = (s: CareerState) => {
    const n = seasonEventCount(s);
    if (n > 0) {
      const ev = getSeasonEvent(s, 0);
      if (ev) { setSeasonEvent(ev); setEventQueue(n - 1); setStage("event"); return; }
    }
    playSeason(s);
  };

  const pickFocus = (f: FocusKey) => {
    if (!state) return;
    const s2 = chooseFocus(state, f);
    setState(s2);
    if (hasWorkoutOpportunity(s2)) {
      setStage("workout");
      return;
    }
    proceedToSeasonEvents(s2);
  };

  const finishWorkout = (won: boolean) => {
    if (!state) return;
    const s2 = setWorkoutResult(state, won);
    setState(s2);
    proceedToSeasonEvents(s2);
  };
```

- [ ] **Step 2: Simplify `chooseEvent`** (unchanged logic, just no longer reachable from the old decision flow — verify it still reads correctly)

`chooseEvent` stays exactly as it is today (applies the event, continues the event queue or calls `playSeason`) — no changes needed here, it already didn't reference `decision`.

- [ ] **Step 3: Delete the old `chooseDecision`, add the new post-season decision flow**

Remove the existing `chooseDecision` function entirely. Add:

```tsx
  const [decisionResultText, setDecisionResultText] = useState<string | null>(null);

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

  const chooseDecision = (id: string) => {
    if (!state || !decision) return;
    const beforeTeamId = state.team.id;
    const s2 = applyBigDecision(state, id, decision);
    setState(s2);
    const moved = decision.kind === "TEAM_OFFER" && s2.team.id !== beforeTeamId;
    setDecisionResultText(bigDecisionConsequence(decision, id, moved, s2.team.name));
    setStage("decision_result");
  };

  const afterDecisionResult = () => {
    setDecisionResultText(null);
    afterResult();
  };
```

Add the import: `import { bigDecisionConsequence } from "./engine/bigdecision";` (merge into the existing `bigdecision.ts` import line, which already imports `BigDecision`).

- [ ] **Step 4: Wire the new stage into the render switch**

Add `"decision_result"` to the `Stage` union type at the top of the file. In the render switch, replace how `"season_complete"` and `"result"` transition, and add the new case:

```tsx
    case "season_complete":
      return conclusion ? (
        <SeasonComplete state={state} conclusion={conclusion} development={development} onNext={afterSeasonComplete} />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
```

(This changes `SeasonComplete`'s `onNext` from `() => setStage("result")` to `afterSeasonComplete` — the intermediate "result" stage is no longer part of the normal club-season path. `SeasonResultScreen`'s own `"result"` case stays exactly as it is today, since it's still used by the Olympics-finish path in `finishRound` and by the `conclusion`-missing fallback above.)

Add a new case:

```tsx
    case "decision_result":
      return decisionResultText ? (
        <BigDecisionResultScreen text={decisionResultText} onNext={afterDecisionResult} />
      ) : null;
```

(`BigDecisionResultScreen` is a new tiny component added in Task 9.) Add its import alongside the other `SeasonFlow.tsx` imports: `import { BigDecisionScreen, SeasonSimScreen, SeasonResultScreen, BigDecisionResultScreen } from "./ui/screens/SeasonFlow";`.

The `"decision"` case's `onChoose` prop (`<BigDecisionScreen ... onChoose={chooseDecision} />`) needs no change — it already calls `chooseDecision`, which now has new internals but the same signature from the component's point of view.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` — expect an error only in the `"decision_result"` case referencing `BigDecisionResultScreen`, which doesn't exist until Task 9. Confirm no OTHER unexpected errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: move the Big Decision to fire after Season Complete instead of before the season starts

tsc will show one expected error (BigDecisionResultScreen, added in a later task) until that component lands."
```

---

### Task 7: Development card UI shows the locked reward (`Onboarding.tsx`)

**Files:**
- Modify: `src/ui/screens/Onboarding.tsx` (`DevelopmentSelect`)
- Test: none (presentational; covered by the engine tests in Task 4 plus the browser smoke test in Task 10)

**Interfaces:**
- Consumes: `DevelopmentOptionView` (new shape from Task 1/4: `{attribute, label, from, to, delta, tier}`).

- [ ] **Step 1: Rewrite `DevelopmentSelect`**

Replace the options-rendering block in `src/ui/screens/Onboarding.tsx`:

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
                <span className="stat-num text-sm text-amber">+{o.delta}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 stat-num text-[13px] text-mute">
                <span>{o.from}</span>
                <span className="text-line">→</span>
                <span className={on ? "text-amber font-bold" : "text-bone"}>{o.to}</span>
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` — expect clean now (the last consumer of the old `DevelopmentOptionView` shape is fixed).

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/Onboarding.tsx
git commit -m "feat: show the exact locked development reward on each option card"
```

---

### Task 8: `PlayerStatusPanel` + `FanLove` shared components

**Files:**
- Create: `src/ui/components/PlayerStatusPanel.tsx`
- Create: `src/ui/components/FanLove.tsx`

**Interfaces:**
- Produces: `PlayerStatusPanel({ state: CareerState })` — OVR/age/team/role header + current active-attribute bars. `FanLove({ value: number, teamName: string })` — bar + narrative line. Both consumed by Tasks 9 and 11.

- [ ] **Step 1: Create `PlayerStatusPanel.tsx`**

```tsx
import { CareerState, playerOvr } from "../../engine/career";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { ROLE_LABEL } from "../../engine/overall";
import { Attributes } from "../../engine/types";
import { TeamLogo } from "./TeamLogo";
import { getTeamIdentity } from "../../engine/identity";

// ============================================================
// PLAYER STATUS PANEL
// The single place that answers "how good is my player right now" — OVR,
// team/role context, and current active-attribute bars. Reused wherever
// that question matters: the Career Hub and the season-progress screen.
// Never a second copy of this rendering logic anywhere else.
// ============================================================

const ATTR_DISPLAY_LABEL: Record<keyof Attributes, string> = {
  shooting: "Shooting", finishing: "Finishing", passing: "Passing",
  ballHandling: "Ball Handling", defense: "Defense", athleticism: "Speed",
  strength: "Strength", basketballIQ: "Basketball IQ", clutch: "Clutch",
};

export function PlayerStatusPanel({ state }: { state: CareerState }) {
  const ovr = playerOvr(state);
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const a = state.player.attributes;

  return (
    <div>
      <div className="flex items-center gap-3">
        <TeamLogo identity={getTeamIdentity(state.team)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-display uppercase text-[19px] leading-none truncate">{state.team.name}</div>
          <div className="eyebrow mt-1">
            Age {state.age} · {state.player.position} · {ROLE_LABEL[state.role]}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="stat-num text-3xl font-bold text-amber leading-none">{ovr}</div>
          <div className="eyebrow">OVR</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="eyebrow mb-2">{profile.label} attributes</div>
        <div className="space-y-1.5">
          {profile.active.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[12px] text-mute w-24 shrink-0">{ATTR_DISPLAY_LABEL[key]}</span>
              <div className="flex-1 h-1.5 bg-line rounded-sm overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, (a[key] / 99) * 100)}%`,
                    background: a[key] >= 85 ? "#E8A33D" : "#4DA3FF",
                  }}
                />
              </div>
              <span className="stat-num text-xs w-6 text-right">{Math.round(a[key])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `FanLove.tsx`**

```tsx
// ============================================================
// FAN LOVE
// A living reaction to the career, not another stat to skim past. Reacts to
// wins, awards, playoff moments, and loyalty (see career.ts/decisions.ts/
// threads.ts for the update sites) — this component only renders it.
// ============================================================

function fanLoveLine(v: number, teamName: string): string {
  if (v >= 85) return `${teamName} adores you. You're the face of this franchise.`;
  if (v >= 65) return `${teamName} is starting to see you as one of its stars.`;
  if (v >= 40) return `The fans respect what you bring, even if you're not a household name yet.`;
  if (v >= 20) return `You're still building a real connection with this fanbase.`;
  return `The fans barely know your name yet.`;
}

export function FanLove({ value, teamName }: { value: number; teamName: string }) {
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
      <p className="mt-2 text-[13px] text-mute leading-snug">{fanLoveLine(v, teamName)}</p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect clean (both new files are self-contained and not yet imported anywhere, so no new errors possible, but confirm the files themselves compile).

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/PlayerStatusPanel.tsx src/ui/components/FanLove.tsx
git commit -m "feat: add shared PlayerStatusPanel and FanLove components"
```

---

### Task 9: Season Complete — decisions recap, Fan Love, Big Decision consequence screen (`SeasonComplete.tsx`, `SeasonFlow.tsx`)

**Files:**
- Modify: `src/ui/screens/SeasonComplete.tsx` (`SeasonComplete` gains the "Decisions This Season" section + `FanLove`)
- Modify: `src/ui/screens/SeasonFlow.tsx` (new `BigDecisionResultScreen`)

**Interfaces:**
- Consumes: `SeasonConclusion.decisions` (Task 5), `FanLove` (Task 8).
- Produces: `BigDecisionResultScreen({ text: string; onNext: () => void })`.

- [ ] **Step 1: Add the "Decisions This Season" section and Fan Love to `SeasonComplete`**

In `src/ui/screens/SeasonComplete.tsx`, add the import: `import { FanLove } from "../components/FanLove";`.

Insert a new section into `SeasonComplete`, after the "Season stats" block and before the "Development" block:

```tsx
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
```

Add a Fan Love block near the top, right after the team/season header, before "Season stats":

```tsx
      <div className="mt-6 rise rise-1">
        <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} />
      </div>
```

(Verify against the file's exact current JSX before inserting — the "Season stats" `<Eyebrow>Season stats</Eyebrow>` block should immediately follow this insertion, matching the existing `mt-6 rise rise-2`/`rise-3` numbering; renumber the `rise-N` classes on later blocks by one step if needed to keep the stagger animation sequential — this is a purely cosmetic detail, not a functional one.)

- [ ] **Step 2: Add `BigDecisionResultScreen` to `SeasonFlow.tsx`**

Append to `src/ui/screens/SeasonFlow.tsx`:

```tsx
/* ---------------- Big Decision consequence ---------------- */
export function BigDecisionResultScreen({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <Screen>
      <div className="rise mt-16">
        <Eyebrow>What happened next</Eyebrow>
        <p className="mt-4 text-[19px] leading-snug">{text}</p>
      </div>
      <div className="mt-auto pt-12 rise rise-1">
        <button className="btn-primary" onClick={onNext}>Continue</button>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` — expect fully clean now across the whole project (this closes out the last dangling reference from Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SeasonComplete.tsx src/ui/screens/SeasonFlow.tsx
git commit -m "feat: show this season's decisions recap and Fan Love in Season Complete; add the Big Decision consequence screen"
```

---

### Task 10: Replace the simulated-game ticker with a season-progress presentation (`SeasonFlow.tsx`, `CareerHub.tsx`)

**Files:**
- Modify: `src/ui/screens/SeasonFlow.tsx` (`SeasonSimScreen`)
- Modify: `src/ui/screens/CareerHub.tsx` (`SeasonTab` uses `PlayerStatusPanel` + `FanLove`)

**Interfaces:**
- Consumes: `PlayerStatusPanel`, `FanLove` (Task 8).

- [ ] **Step 1: Replace `SeasonSimScreen`'s centerpiece**

In `src/ui/screens/SeasonFlow.tsx`, add the import: `import { PlayerStatusPanel } from "../components/PlayerStatusPanel";`.

Replace the week-tile grid with a progress bar, keeping the same animated `shown` counter and the same post-`done` stats/bracket/rival sections:

```tsx
export function SeasonSimScreen({
  state, weeks, stats, seedPlace, bracket, events, onNext, nextLabel,
}: {
  state: CareerState; weeks: WeekResult[]; stats: SeasonStats; seedPlace: number;
  bracket: BracketStep[]; events: CareerEvent[]; onNext: () => void; nextLabel: string;
}) {
  const [shown, setShown] = useState(0);
  const done = shown >= weeks.length;

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 220 : 55);
    return () => clearTimeout(id);
  }, [shown, done]);

  const pct = weeks.length > 0 ? Math.round((shown / weeks.length) * 100) : 100;
  const winsSoFar = weeks.slice(0, shown).filter((w) => w.result === "W").length;
  const conf = state.phase === "NCAA" ? "the conference" : `the ${state.team.conference}`;
  const rivalEvents = events.filter((e) => e.type === "rival_update");

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Title>Regular season</Title>
      </div>

      <div className="mt-5 rise rise-1">
        <PlayerStatusPanel state={state} />
      </div>

      <div className="mt-5 rise rise-2">
        <div className="flex items-baseline justify-between eyebrow mb-1.5">
          <span>Season progress</span>
          <span>{shown} / {weeks.length} weeks</span>
        </div>
        <div className="h-2.5 bg-line rounded-sm overflow-hidden">
          <div
            className="h-full transition-[width] duration-150"
            style={{ width: `${pct}%`, background: "#E8A33D" }}
          />
        </div>
        {!done && (
          <p className="text-[13px] text-mute mt-2">{winsSoFar}-{shown - winsSoFar} so far this season.</p>
        )}
      </div>

      {done && (
        <>
          <div className="mt-6 rise">
            <div className="eyebrow mb-2">Final record</div>
            <StatLine
              items={[
                { label: "PPG", value: stats.ppg },
                { label: "RPG", value: stats.rpg },
                { label: "APG", value: stats.apg },
              ]}
            />
            <div className="flex justify-between py-3 text-sm border-b border-line">
              <span className="text-mute">Record</span>
              <span className="stat-num">{stats.teamWins}–{stats.teamLosses}</span>
            </div>
            <p className="text-sm text-mute mt-3">
              Finished {ordinal(seedPlace)} in {conf}.
            </p>
          </div>

          {bracket.length > 0 && (
            <div className="mt-6 rise rise-1">
              <Divider label="Postseason" />
              <div className="space-y-1.5">
                {bracket.map((b) => (
                  <div key={b.round} className="flex items-center justify-between py-1.5 border-b border-line/50">
                    <span className="text-[13px]">{b.label}</span>
                    <span
                      className="font-display uppercase text-sm tracking-wider"
                      style={{ color: b.won ? "#E8A33D" : "#FF4D3D" }}
                    >
                      {b.won ? "Won" : "Lost"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rivalEvents.length > 0 && (
            <div className="mt-6 rise rise-2">
              <Divider label="Around the league" />
              <div className="space-y-2">
                {rivalEvents.map((e) => (
                  <div key={e.id} className="card px-3 py-2.5 border-l-2 border-l-cool">
                    <p className="text-[13px] whitespace-pre-line leading-snug">{e.narrative}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-7 rise rise-3">
            <button className="btn-primary" onClick={onNext}>{nextLabel}</button>
          </div>
        </>
      )}
    </Screen>
  );
}
```

This keeps every existing data point (record, seed, PPG/RPG/APG, bracket, rival updates) — only the moment-by-moment W/L tile grid is gone, replaced by a progress bar plus the always-visible `PlayerStatusPanel` (current OVR/attributes) above it.

- [ ] **Step 2: Enrich `CareerHub`'s `SeasonTab`**

In `src/ui/screens/CareerHub.tsx`, add imports: `import { PlayerStatusPanel } from "../components/PlayerStatusPanel"; import { FanLove } from "../components/FanLove";`.

Replace `SeasonTab`'s body to lead with the shared panel and fan love, keeping the existing "Last season" stats and "Next"/"Goal" sections below:

```tsx
function SeasonTab({ state, nextEvent }: { state: CareerState; nextEvent: string }) {
  const last = state.lastStats;
  return (
    <div>
      <PlayerStatusPanel state={state} />

      <div className="mt-5">
        <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} />
      </div>

      {last && (
        <div className="mt-5">
          <Eyebrow>Last season</Eyebrow>
          <div className="mt-2">
            <StatLine
              items={[
                { label: "PPG", value: last.ppg },
                { label: "RPG", value: last.rpg },
                { label: "APG", value: last.apg },
              ]}
            />
          </div>
          <div className="flex justify-between py-3 text-sm border-b border-line">
            <span className="text-mute">Record</span>
            <span className="stat-num">{last.teamWins}–{last.teamLosses}</span>
          </div>
        </div>
      )}

      <div className="mt-5">
        <Eyebrow>Next</Eyebrow>
        <p className="mt-1.5 font-display uppercase text-[24px] leading-none">{nextEvent}</p>
      </div>

      <div className="mt-5">
        <Eyebrow>Goal</Eyebrow>
        <p className="mt-1.5 text-sm text-mute leading-relaxed">
          {state.phase === "NCAA"
            ? "Raise your draft stock and reach the National Championship."
            : "Win a title. Beat the man they keep comparing you to."}
        </p>
      </div>
    </div>
  );
}
```

`CareerHub`'s own top-level identity block (team logo/name/OVR badge, right below `CareerHeader`) already exists and stays — `PlayerStatusPanel` inside the SEASON tab is now a second, more detailed view (with attribute bars) one tab-click away, not a duplicate of the header. This is an acceptable, intentional bit of overlap (header = always-visible glance, tab = full detail), not a second source of truth (both read `state.player.attributes`/`playerOvr(state)` directly, nothing is cached or computed twice).

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npx vite build` — expect both clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SeasonFlow.tsx src/ui/screens/CareerHub.tsx
git commit -m "feat: replace the game-by-game ticker with a season-progress panel; surface current attributes and Fan Love in the Hub"
```

---

### Task 11: Final verification pass

**Files:**
- Modify: `README.md` (small, scoped note only — same discipline as the previous plan's Task 10)

- [ ] **Step 1: Full clean run**

```bash
npx tsc --noEmit
npm test
npx vite build
npm run simulate
```

All four must be clean. Confirm `npm test`'s count includes the new `events.test.ts`, `bigdecision.test.ts`, `player.test.ts` files and the appended assertions in `development.test.ts`/`career.test.ts`.

- [ ] **Step 2: Real browser smoke test**

Start the dev server, open it in a real browser (Chrome automation, same approach as the previous plan's Task 10 controller-addendum), and play through:

1. Create a player, any playstyle. Confirm the 3 development-option cards show `from → to` with a `+N` badge that matches (`to - from === N`), not a "+2 to +4" range.
2. Pick one, confirm it's not re-rolled: note the exact `to` value shown on the card, play through the season, and confirm the Season Complete screen's development section shows that same attribute landing at that exact value (verify by comparing the CareerHub STATS tab's attribute value before/after against what the card promised).
3. Trigger at least one season event (mini-decision) — confirm the game continues normally (no immediate consequence screen is required by this plan, only the recap).
4. Reach Season Complete — confirm: Fan Love bar renders, "Decisions This Season" lists the event(s) chosen this season with title/choice/result (and does NOT show anything from a previous season), stats/playoff-result/development sections all still present.
5. Confirm Season Complete's "What's next" transitions into a Big Decision screen (not straight to offseason), and that choosing an option shows a distinct consequence screen before continuing.
6. Confirm arriving at the next Hub does NOT show last season's "Decisions This Season" list anywhere (Hub, tabs, or anywhere else) — only in that one Season Complete screen, now behind you.
7. Confirm the season-progress screen (during the regular season) shows the `PlayerStatusPanel` (current attributes) and a progress bar, not a grid of W/L tiles.
8. Confirm `CareerHub`'s SEASON tab shows current attributes and the Fan Love bar.

Stop the dev server when done. Report exactly what was visually verified, with screenshots/observations, the same rigor as the previous plan's browser smoke test.

- [ ] **Step 3: Update the README's season-loop description**

In `README.md`, update the "Season loop" ASCII diagram to reflect the new order (Big Decision after playoffs, not before the season) and add one line noting Fan Love and the season-decisions recap exist. Keep this strictly scoped — no wholesale rewrite.

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: update season loop description for the post-playoffs Big Decision and Fan Love"
```

---

## Self-review notes (already applied above)

- **Spec coverage:** every acceptance-criteria bullet from the user's request maps to a task: locked development preview (Tasks 1, 4, 7), Big Decision timing (Task 6), simulated-game de-emphasis (Task 10), season screen clarity + current attributes (Tasks 8, 10), decisions recap collected at Season Complete rather than shown immediately (Tasks 5, 9), no permanent decision history (enforced by clearing `seasonDecisions` every season in Task 5, verified in Task 11's smoke test), Fan Love (Tasks 1, 5, 8, 9, 10).
- **Type consistency check:** `DevelopmentOptionView`, `LockedDevelopment`, `SeasonDecisionEntry`, `bigDecisionConsequence`, `PlayerStatusPanel`, `FanLove` are each defined exactly once and referenced identically across every task that uses them.
- **Sequencing dependency called out explicitly:** Tasks 1-4 must land together before a full-project `tsc --noEmit` is expected to pass (stated in Task 1 and Task 4). Task 6 similarly leaves one expected dangling reference (`BigDecisionResultScreen`) until Task 9. Both are flagged inline so a reviewer doesn't mistake an expected intermediate red `tsc` for a regression.
