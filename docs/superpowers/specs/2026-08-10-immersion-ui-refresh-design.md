# Immersion + UI Refresh — Design Spec

Status: approved decisions from user, pending final doc sign-off
Date: 2026-08-10
Scope owner: Fan Love per-team model, status derivation, two narrative surfaces made status-aware, Season Complete UI, Career Hub UI. No refactor of unrelated systems (development RNG/reveal mechanic, event pacing, NarrativeEffects, playstyle system — all untouched).

## 1. Problem statement

Four related gaps, discovered by inspecting the current (merged-to-master) implementation:

1. **Fan Love has no team identity.** `Hidden.fanLove` (`types.ts:32`) is a single scalar, phase- and team-agnostic. Neither of the two places `state.team` changes — `signDraftPick` (`career.ts:1025-1044`) and `applyBigDecision`'s `TEAM_OFFER` branch (`career.ts:291-328`) — resets or recalculates it. A college Fan Love of 71 becomes a Dallas Fan Love of 71 on draft night with zero adjustment (the `TEAM_OFFER` branch does apply a flat `±5`/`+4` loyalty nudge on *top* of the pre-move value, but that's not a reset either).
2. **Two status signals exist and were never unified.** `Role` (`overall.ts:27`, roster-relative: BENCH/STARTER/STAR/FRANCHISE) and achievement history (`awards`/`reputation`) are both real, both already read in places (`EventContext` for event eligibility), but nothing derives a single "how known/accomplished is this player" signal from them — so `FanLove.tsx`'s band text (`fanLoveLine`, a pure function of the numeric value only) can contradict an All-Star's actual career state.
3. **Season Complete and the Hub over-render identity and development prose**, exactly as the user described — verified section by section below.
4. **"World reaction" is real but narrow.** `rival_update`/`rivalry_narrative` (`rival.ts`) already prove the pattern (push a `CareerEvent`, filter by `type` in `SeasonComplete.tsx:72`) — but nothing outside the rivalry uses it yet.

## 2. Fan Love per-team model

### 2.1 New pure function: `initialFanLoveForTeamChange`

New export in `src/engine/fanlove.ts`:

```ts
export function initialFanLoveForTeamChange(
  reputation: number,
  awards: Award[],
  nbaSeasonsPlayed: number
): number
```

Shape: a `reputation`-scaled base (reputation is already sticky/persistent per `types.ts:31` — it is the correct "general recognition" signal) plus a bonus for standout awards *already earned* at the moment of the transition (MVP/Champion/All-Star/All-NBA), clamped to a floor that's never zero (a total unknown still gets *some* initial goodwill) and a soft ceiling well below `reputation`'s own range (a transfer should never out-value a legacy built on one team). Illustrative bands, confirmed with the user:

| Situation | Fan Love on the new team |
|---|---|
| Unknown prospect, no reputation | 8–15 |
| High reputation (top prospect / NCAA star), no NBA awards yet | 20–30 |
| High reputation + All-Star | 35–50 |
| Very high reputation + MVP/champion | 50–65 |

Exact constants are tuned during implementation and validated by unit tests asserting these four bands (mirrors how `TIER_BUMP_FIRST`/`TIER_BUMP_REPEAT` in the same file were tuned in the prior plan) — this spec fixes the shape and the four checkpoints, not literal numbers.

### 2.2 Call sites

- **`signDraftPick`** (`career.ts:1025`): after setting `team: slot.team`, also set `hidden: { ...player.hidden, fanLove: initialFanLoveForTeamChange(player.hidden.reputation, player.awards, state.nbaSeasonsPlayed) }`. This is the NCAA→NBA case — `awards` at this point only ever contains NCAA-era awards (ALL_TOURNAMENT etc.), which is correct: an NCAA accolade should nudge the *initial* NBA number, never be compared against it as a "prior NBA best" (that boundary is already enforced elsewhere, in `finishSeason`'s `priorPlayoffResults` phase filter from the previous plan).
- **`applyBigDecision`'s `TEAM_OFFER` branch** (`career.ts:299-315`): when `moved` is true, replace the flat `±5` nudge's *moved* case with `initialFanLoveForTeamChange(...)` instead of `player.hidden.fanLove + (-5)`. The *not-moved* (`stayed`) case keeps its existing `+4` loyalty nudge on top of the current value — staying is not a transition, nothing resets.
- **Returning to a former team**: no special-casing. The same call recomputes fresh from current `reputation`/`awards`, per the user's explicit instruction not to build a second per-team-history system yet. If this is unsatisfying in play-testing, a follow-up iteration can add a small "welcome back" bonus keyed off `state.timeline` (which already records prior team ids) — out of scope here.
- **Confirmed no third call site exists.** `career.ts:291` grep and a read of `bigdecision.ts` confirm every team change (draft, free agency, and this game's only representation of a trade — a new `TEAM_OFFER` at contract expiry) routes through exactly these two functions.

### 2.3 Status derivation

New file `src/engine/status.ts` (small, single-purpose, mirrors `overall.ts`'s existing shape):

```ts
export type PlayerStatus = "UNKNOWN" | "ROOKIE" | "ROTATION" | "STARTER" | "ALL_STAR" | "MVP_LEVEL" | "LEGEND";

export function playerStatus(reputation: number, awards: Award[], nbaSeasonsPlayed: number): PlayerStatus
```

Derived from awards first (an MVP is an MVP regardless of a dip in reputation), falling back to `reputation` thresholds, with `nbaSeasonsPlayed === 0` producing `ROOKIE` unless awards already override it. `Role` (`overall.ts`) is untouched and keeps its existing, distinct job (roster-relative, feeds `EventContext.role` for event eligibility) — `PlayerStatus` is a new, separate, narrative-facing signal, not a replacement.

**Consumers:**
- `FanLove.tsx`'s `fanLoveLine`: gains a `status` parameter. An All-Star/MVP/Legend status guarantees a floor on which band-text tier is selectable, so a real accomplishment can never read as "the fans barely know your name" even in the first moment after a team change (belt-and-suspenders on top of §2.1's initial-value floor already being reasonably high for that case).
- The two text call sites in §3.

## 3. World reaction — extends existing surfaces, no new system

### 3.1 `fanlove_milestone` (genuinely new "Around the League" content)

New `CareerEvent` type, pushed inside `finishSeason` (`career.ts`) right after this season's Fan Love mutations are complete (playoff bump, tenure tick, award bumps — all already computed by that point in the function): compare Fan Love before this season's mutations vs. after; if it crossed upward through one of `FanLove.tsx`'s existing band thresholds (14/32/52/72/88), push one `fanlove_milestone` event with third-person "around the league" phrasing (distinct tone from the second-person `FanLove.tsx` line — e.g. rival-update style: "`{teamName}` fans are starting to talk about their guy.").

`SeasonComplete.tsx:72`'s `leagueNews` filter gains `|| e.type === "fanlove_milestone"` — one line, no new component, no new plumbing. This event is pushed and consumed within the same `finishSeason` call / same season's `resultEvents`, so it has no cross-season-boundary problem.

### 3.2 "New city" reaction — deliberately NOT a new event type

**Investigated and rejected:** a `new_city_reaction` `CareerEvent` pushed at the draft/trade call sites would need to survive from `signDraftPick`/`applyBigDecision` (which fire *between* seasons) until the *next* `SeasonComplete` renders — but `SeasonComplete`'s `events` prop is exactly `finishSeason`'s own transient `events` array (`career.ts`'s `SeasonEnd.events`, consumed as `App.tsx`'s `resultEvents`, confirmed by reading `completeSeason`/`chooseDecision`/`draftSigned` in `App.tsx`). Nothing carries a pre-season event across that boundary today, and building that plumbing for one narrative line is exactly the kind of new system the user asked to avoid.

**Instead:** make the two screens *already shown at the exact moment of the transition* status-aware:

- **`DraftAndTournament.tsx`'s `DraftNight` REVEAL screen** (line 42-44 today: `{revealed.expectedRole} · TEAM OVR {revealed.team.ovr} · {revealed.market} market`) gains one more short line beneath it, driven by `playerStatus`/reputation at that moment — e.g. a high-reputation lottery pick reads differently than an anonymous late-second-rounder. This is the very first thing the player sees about their new team; it is the most immersive possible placement for this reaction, not a downgrade from the "Around the League" idea.
- **`bigDecisionConsequence`** (`bigdecision.ts:177-191`) gains the same status-awareness in its `moved` branch (currently a flat `"You signed with {team}. It's a fresh start..."`), replacing the generic line with tone that reflects whether the player arrives as a known quantity or a fresh face — shown on the existing `decision_result` stage, already wired end to end.

Net effect: the "world reacts to a trade/draft" requirement is satisfied with **zero new event types, zero new screens** — purely enriching two existing narrative-generation functions with a parameter they don't currently take.

### 3.3 Explicitly deferred (per the user's own scope selection)

Season-achievement reactions (MVP/champion headline separate from the existing award events) and bad-streak/pressure reactions are not part of this iteration — the user selected only Fan Love milestones and new-city reactions from the option list. `awards.ts`'s existing award events and `finishSeason`'s existing award-driven Fan Love bumps already cover the "the world knows I won MVP" case adequately for now.

## 4. Season Complete redesign (`SeasonComplete.tsx`)

Current structure (verified top to bottom, lines cited): `CareerHeader` → **redundant team logo+name row** (`:80-83`) → headline/lines → `FanLove` (`:99-101`) → "Season stats" (PPG/RPG/APG + record only, `:103-112`) → Decisions This Season (`:114-129`) → **separate "Development" section with `ATTR_FLAVOR` prose** (`:131-150`) → Awards (`:152-163`) → Draft stock (`:165-172`) → Around the League (`:174-185`) → What's next.

**Changes:**
- Remove the redundant team logo/name row (`:80-83`) — `CareerHeader` already shows this.
- Remove the separate "Development" section (`:131-150`) and its `ATTR_FLAVOR` prose entirely.
- New consolidated **Stats** block, in the same position as today's "Season stats": keeps the existing PPG/RPG/APG/Record line (not flagged for removal, still useful season-recap context), and adds the attribute-value + delta rows the "Development" section used to own — `state.player.attributes[c.attribute]` (current, post-development value) next to `development.changes`' `c.delta`, visually merged as a single badge (reusing the exact `stat-num` + amber/red delta-color pattern already used at `:139-141` today — no new visual language). A delta of exactly 0 or an attribute with no change this season is simply omitted from the list, same as today's `development.changes.length > 0` guard. One-line microcopy is optional per attribute and, if present, must be short (a trimmed/shortened `ATTR_FLAVOR` variant, not the existing paragraph) and never substitute for the number.
- Fan Love and Awards render compact, immediately after/near Stats (Fan Love already sits right above Stats today at `:99-101` — reordering it directly adjacent, with Awards' existing `:152-163` block moved up next to it, satisfies "cerca de esta parte, de forma compacta" without inventing new components).
- Order after the change: Header → "Season Complete" + narrative headline → Stats (attributes+deltas, Fan Love, Awards) → Decisions This Season → Around the League (only if `leagueNews.length > 0`, unchanged guard, now also catching `fanlove_milestone`) → What's Next.

## 5. Career Hub redesign (`CareerHub.tsx`)

Current structure (verified): `CareerHeader` (`:45`) → **a second full identity block** (`:47-69`: 56px team logo, team name, position/jersey/role, a second OVR badge, salary) → tabs → per-tab content.

**Self-review correction:** `CareerHeader.tsx:82-87` was verified to show name, team, position, age, and OVR — it does **not** currently show role (`ROLE_LABEL[state.role]`) or salary/contract, despite the assumption (mine and the user's) that it already covers "posición/rol." Two pieces of information the removed Hub block carries need a home:

- **Role** — already shown elsewhere (`TeamTab`'s existing Role card, `CareerHub.tsx:168`), so nothing is actually lost by removing it from the Hub's top block; left as-is there. Since "at a glance, in the header" was the stated intent, `CareerHeader`'s existing eyebrow line (`:85-87`, `{teamName} · {state.player.position} · {state.age}`) gains `· {ROLE_LABEL[state.role]}` — a one-line, additive change, not a redesign of the header.
- **Salary/contract** — not shown anywhere else today; moves into the existing `TEAM` tab (which the user didn't ask to change otherwise) rather than being dropped.

**Changes:**
- Remove the Hub's inline identity block (`:47-69`) entirely, per the correction above.
- **SEASON tab** (`SeasonTab`, `:102-146`): remove the `<PlayerStatusPanel state={state} />` call (`:106`) — `PlayerStatusPanel` currently re-renders team identity *and* the full active-attribute bar list (`PlayerStatusPanel.tsx:29-62`), both redundant here. `PlayerStatusPanel` itself is not deleted — it's still used by `SeasonFlow.tsx:113` (the in-season progress screen) and stays exactly as-is there, since the user didn't ask to change that screen. SEASON tab keeps: Fan Love, last-season PPG/RPG/APG, Record, Next, Goal — unchanged otherwise.
- **STATS tab** (`StatsTab`, `:208-234`): already the correct home (full `profile.active` attribute list with bars) — add a `+N` delta indicator per row, reusing the same visual pattern as §4's Stats block. Source: a new `lastDevelopment: DevelopmentResult | null` field added to `CareerState` (mirrors the existing `lastAgeReport`/`lastDevNote` pattern at `types.ts` / `career.ts:127-128`), set at the same point those two are set in `finishSeason`/`advance()`, so the Hub can show "this season's" deltas even after navigating away from Season Complete — exactly the "cuando corresponda" (when applicable) the user asked for, without inventing a second development-tracking system.
- **CAREER tab** (`CareerTab`, `:256-259`): reformat `{t.ppg} / {t.rpg} / {t.apg}` to `{t.ppg} PPG • {t.rpg} RPG • {t.apg} APG`.
- **TEAM tab**: out of scope for this iteration except for gaining the salary/contract line moved from the removed identity block. Its own Role-card duplication (flagged during investigation) is left untouched, per the user's explicit "don't refactor beyond what I named."

## 6. Files

**New:**
- `src/engine/status.ts` — `PlayerStatus` type + `playerStatus()`, single source of truth for narrative status.

**Modified:**
- `src/engine/fanlove.ts` — adds `initialFanLoveForTeamChange`; fixes the stale header comment (still describes the deleted "baseline-target" model, `:4-21`).
- `src/engine/types.ts` — fixes `Hidden.fanLove`'s stale doc comment (`:32-36`, same staleness as above); adds `lastDevelopment: DevelopmentResult | null` to `CareerState`.
- `src/engine/career.ts` — `signDraftPick` and `applyBigDecision`'s `TEAM_OFFER` branch call `initialFanLoveForTeamChange`; `finishSeason` pushes `fanlove_milestone` when a band threshold is crossed and sets `lastDevelopment`.
- `src/engine/bigdecision.ts` — `bigDecisionConsequence`'s `moved` branch becomes status-aware (gains `status`/`reputation` params).
- `src/ui/screens/DraftAndTournament.tsx` — `DraftNight`'s REVEAL screen gains one status-aware line.
- `src/ui/components/FanLove.tsx` — `fanLoveLine` gains a `status` parameter with a floor on which tier can be selected; fixes its own stale header comment.
- `src/ui/components/CareerHeader.tsx` — eyebrow line gains `· {ROLE_LABEL[state.role]}` (one-line addition, see §5's self-review correction).
- `src/ui/screens/SeasonComplete.tsx` — layout changes per §4; `leagueNews` filter gains `fanlove_milestone`.
- `src/ui/screens/CareerHub.tsx` — layout changes per §5.
- `src/engine/fanlove.test.ts` — new tests for `initialFanLoveForTeamChange`'s four bands and the "no team change → untouched" case.
- New `src/engine/status.test.ts`.

**Explicitly not touched:** `development.ts`'s RNG/reveal/reroll mechanic (values only, never logic), `events.ts`/`decisions.ts`/`threads.ts`/`NarrativeEffects` (event pacing and effect-type restriction both already correct and already do what the user asked), `playstyle.ts`, `overall.ts`'s `Role`/`determineRole`, `rival.ts` (reused, not modified), `PlayerStatusPanel.tsx` itself (kept for its other consumer), the `TEAM` tab's existing content beyond the one added salary line, awards rolling logic (`awards.ts`), the entire NCAA/draft/contract/tournament simulation machinery.

## 7. Testing plan

Unit tests (`src/engine/*.test.ts`):

- `initialFanLoveForTeamChange`: the four illustrative bands from §2.1, plus "never returns exactly the pre-transition reputation/fanLove value unmodified" as a general property check.
- `playerStatus`: MVP/Champion → `MVP_LEVEL`/`LEGEND` regardless of a temporarily low reputation; a fresh rookie with no awards → `ROOKIE`, never `ALL_STAR`.
- `fanLoveLine` (or its data, if refactored to return a tier key for testability): a `status` of `ALL_STAR` or above never selects the lowest one or two band tiers even at a low numeric value.
- `finishSeason`: Fan Love crossing a band threshold upward this season produces exactly one `fanlove_milestone` event; not crossing produces none; crossing downward (a bad season) never produces one.
- `signDraftPick`: `hidden.fanLove` after signing is NOT equal to its pre-draft value (regression test for the exact bug reported) and falls in the band matching the synthetic player's reputation/awards.
- `applyBigDecision` (`TEAM_OFFER`, moved): same regression check; the not-moved/stayed case still applies its existing `+4` unaffected.

`tsc --noEmit`, `npm test`, `npx vite build`, `npm run simulate` all clean at the end (same known, pre-existing, unrelated `simulation.test.ts` OVR-spread exception carried forward from the prior plan).

Manual browser smoke test (`claude-in-chrome`, same pattern as the prior plan): play a career reaching a real "college star drafted, Fan Love visibly drops but not to zero" moment; verify Season Complete's new Stats block; verify the Hub's SEASON tab no longer shows a duplicate attribute list; verify STATS tab shows `+N`; verify CAREER tab's new stat-line formatting; verify an All-Star's Fan Love text never reads as "nobody knows you," including immediately after a trade.

## 8. Explicitly preserved (no changes)

The 3-card development reveal/lock mechanic and its RNG (`development.ts`), the 1-sports+1-personal event pacing cap (`career.ts`'s `getPreseasonEvent`/`getMidseasonEvent`), `NarrativeEffects`'s attribute-grant restriction, the tiered playoff Fan Love model from the prior plan (`playoffOutcomeFanLoveBump`, untouched), the consolidated single Season Complete screen (Task 4 of the prior plan — this iteration reorganizes its *contents*, not its *existence as one screen*), `Role`/roster-relative logic, awards rolling, the rivalry system, NCAA/draft/contract/tournament simulation, all 30 real teams/logos, retirement/career summary.
