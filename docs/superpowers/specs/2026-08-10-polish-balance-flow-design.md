# Polish + Balance + Flow — Design Spec

Status: approved decisions from user, pending final doc sign-off
Date: 2026-08-10
Scope owner: development/aging/minigame balance (`development.ts`, `focus.ts`, `minigameLibrary.ts`, `career.ts`), the Olympics result-event leak (`career.ts`, `App.tsx`), and a visual-polish pass across the screens named in §3. No new features, no changes to Fan Love, the event-pacing system, `NarrativeEffects`, or any engine system not named below.

## 1. Problem statement

Three issues, diagnosed by reading the live code (not guessed):

1. **Development reads as cheated.** The tier-probability table itself is fine and already rare-weighted for big tiers (confirmed against real `npm run simulate` output). The actual cause is **stacking**: `developmentRate` multiplies every roll by up to ×1.3, the workout bonus (+2 to +4) lands on the exact same attribute the season's primary roll already targeted, secondary nudges scale off that same primary tier's budget, and two more sources — offseason aging and minigame development — add real, uncapped points to attributes every season **without ever appearing on Season Complete**. None of this scales down as an attribute approaches 99; a 55-rated and a 92-rated attribute have identical odds and delta sizes today.
2. **The UI is a functional dashboard.** The design system (`Shell.tsx`, `styles.css`) is solid and consistent — tokens, cards, the `rise` stagger animation — but has exactly two icon/emoji uses in the entire game (`🔥` for championship-window intensity, `★` for recruiting rank), both used only for rating/intensity, never for section identity. Every major screen (Season Complete, Career Hub, Fan Love, Awards, Around the League, Big Decision, playoff/draft, Olympics) is plain text and cards with zero visual personality beyond that.
3. **Olympics shows what reads as a duplicate conclusion.** Not a state-machine bug — `Season → Season Complete → Big Decision → consequence → Olympics → Olympics Result → Offseason` is structurally correct, with a full Big Decision and an entire interactive Olympics bracket between the two screens. The real bug: `App.tsx`'s Olympics branch builds `resultEvents` via `done.log.slice(-3)`, a blind tail-slice of the **entire cumulative career log** — which, at the moment Olympics finishes, almost always still has the Big Decision's own `career_move` event in its last 3 entries. `SeasonResultScreen` explicitly styles `career_move` events with an amber border (it's an expected type there), so the player's own "You signed with X" line — already shown once, seconds earlier, on its own dedicated screen — reappears unlabeled inside the Olympics result card list.

## 2. Development & progression rebalance

### 2.1 `TIER_BUDGET` rescale (`development.ts`)

| Tier | Current | New |
|---|---|---|
| REGRESSION | [-4, -1] | unchanged — not the complained-about direction |
| POOR | [0, 1] | unchanged |
| NORMAL | [2, 4] | **[1, 3]** |
| GOOD | [5, 6] | **[3, 5]** |
| BREAKOUT | [7, 7] | **[5, 6]** |
| RARE_BREAKOUT | [8, 9] | **[6, 8]** |
| LEGENDARY | [10, 13] | **[8, 11]** |

### 2.2 `developmentRate` range narrowed

Both call sites (`rollDevelopment` and `getDevelopmentOptions`) currently do `clamp(developmentRate, 0.75, 1.3)`. Narrow to `clamp(developmentRate, 0.85, 1.15)` in both places — the multiplier stays a real, earned "hot streak" effect (a player with a high `developmentRate` still develops faster than one who doesn't) without being able to turn a BREAKOUT roll of 6 into 9 on its own.

Combined with §2.1, worked example at tier weights unchanged (already rare by design, confirmed against `npm run simulate`):

| Tier | Rolled range (post-`TIER_BUDGET`, pre-rate) | Displayed range (post-rate) | How often (young, hot player) |
|---|---|---|---|
| NORMAL | 1–3 | 1–3 | ~50-60% of seasons |
| GOOD | 3–5 | 3–6 | ~20-25% |
| BREAKOUT | 5–6 | 4–7 | ~7-10% |
| RARE_BREAKOUT | 6–8 | 5–9 | ~2-3% |
| LEGENDARY | 8–11 | 7–13 | <0.5% |

This is the shape the user asked for: +1/+2/+3 common, +4/+5 a good season, +6+ rare and special, and the old +9/+11 numbers now require the genuinely rare LEGENDARY tier rather than an ordinary GOOD-or-better season plus a won workout.

### 2.3 Diminishing returns near the ceiling (new mechanism — currently none exists)

New function in `development.ts`:

```ts
/** How much of a positive roll actually lands, based on how close the
 * attribute already is to the ceiling. Never fully blocks growth — a
 * sufficiently good career can still reach elite ratings, just more slowly
 * once it's already elite. REGRESSION deltas are never scaled (a decline
 * shouldn't get gentler for a star). */
function diminishingScale(current: number): number {
  if (current >= 95) return 0.25;
  if (current >= 85) return 0.5;
  if (current >= 70) return 0.75;
  return 1;
}
```

Applied inside `finish()` (the single choke point every `DevChange` already passes through before being clamped to `[30, 99]`): for any `c.delta > 0`, multiply by `diminishingScale(current)` and round, with a floor of `Math.max(1, ...)` so a positive tier never displays as a 0. `c.delta <= 0` (REGRESSION) is untouched. The existing ceiling clamp (`clamp(current + delta, 30, 99) - current`) runs on the scaled delta, same as today.

The exact same scaling must also apply inside `getDevelopmentOptions` (the pre-season 3-card preview) — the locked-reward contract ("what you see is what you get") means the preview and the eventual application must use the identical formula, not just the application side.

Worked example: a GOOD-tier roll of 4 at an attribute currently at 55 (scale 1) shows as +4; the identical roll at an attribute currently at 92 (scale 0.5) shows as +2. Neither is blocked — the 92-rated attribute still climbs, just more slowly, exactly the "55→58 much easier than 92→95" the user asked for.

### 2.4 Workout bonus redirected off the primary attribute

`applyWorkout` (`development.ts`) currently adds its +2–4 bonus to the exact same attribute `rollDevelopment` already gave the primary tier delta to — the single largest concrete contributor to the reported +11/+13 numbers. Per the user's approved choice: **redirect the bonus to a different active attribute** (excluding the season's focus/primary), chosen the same way secondary nudges already are (`pickFromActive`, playstyle-weighted). This needs the acting `Person` passed into `applyWorkout` (not currently a parameter) so it can read `person.playstyle`/`person.attributes` to pick a target and apply the same ceiling-aware, diminishing-returns-scaled delta `finish()` uses elsewhere — a raw unclamped add here would let the workout bonus silently overshoot 99 in the *displayed* number even though `applyDevelopment`'s own clamp would truncate the *actual* value, producing a badge that lies about what happened.

Fallback: if every active attribute already has a change this season (rare — most playstyles have 4-7 active attributes, and a season typically touches 2-3), fall back to the original focus attribute rather than skipping the bonus.

### 2.5 Season Complete shows the TOTAL real delta, not just development's slice

Per the user's approved choice, three sources currently move attributes every season, only one of which is shown:
- `development.changes` (primary + secondary + the now-redirected workout bonus) — shown today.
- `state.lastAgeReport` (`focus.ts`'s `applyAging`, runs unconditionally every season inside `advance()`) — **never shown anywhere in Season Complete today**.
- Minigame development (`minigameLibrary.ts`'s `developmentFromRun`, applied directly to `player.attributes` from two call sites — once per interactive tournament round in `resolveTournamentRound`, once more at the finals decider in `finishSeason`) — **currently not tracked as a discrete change at all**, just a silent mutation.

New `CareerState` fields (mirroring the existing `seasonDecisions`/conclusion pattern): `seasonMinigameDev: DevChange[]` (accumulates across both `developmentFromRun` call sites during the season, cleared to `[]` in `finishSeason`'s `next` object) and `lastMinigameDev: DevChange[]` (a snapshot of the above taken at the moment the season ends, so it survives into the Hub after `seasonMinigameDev` resets for the next season — same relationship `lastDevelopment` already has to the season's live development roll).

New pure function, `development.ts`:

```ts
import { AgeReport } from "./focus";

/** Merges every source that actually moved an attribute this season into one
 * honest per-attribute total — development (primary+secondary+workout),
 * aging, and minigame performance. Rounded once at the end, not per-source,
 * so the displayed number matches what actually happened rather than
 * compounding three separate roundings. */
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

`SeasonComplete.tsx`'s Stats block and `CareerHub.tsx`'s STATS tab both currently read `development.changes`/`state.lastDevelopment?.changes` directly for the delta badge — both switch to `totalSeasonDelta(development.changes, state.lastAgeReport, state.lastMinigameDev)` (and the Hub's equivalent using `state.lastDevelopment`/`state.lastAgeReport`/`state.lastMinigameDev`), so the two screens can never show inconsistent numbers for the same season.

This is explicitly **not** "hide a smaller number" — it's the opposite: the player now sees the complete, honest picture of everything that moved their attributes this season, while §2.1-2.4 make the underlying magnitudes actually match the intended pace.

### 2.6 Explicitly not touched

The locked-development-reward mechanic (pick a card, get exactly that card's number, no reroll) is preserved exactly — only the numbers the cards can show change, never the "no reroll after selection" contract. `Role`/`playerStatus`/Fan Love are untouched. Regression's structural impossibility on the locked/focus attribute (confirmed intentional in the current code, not a bug) is preserved.

## 3. Visual polish

### 3.1 Existing design system (reused, not replaced)

`Shell.tsx` primitives (`Screen`, `Eyebrow`, `Title`, `StatLine`, `Divider`) and `styles.css` tokens (`amber #E8A33D` = positive, `heat #FF4D3D` = negative, `cool #4DA3FF` = rival/away, `mute #8A99B8` = secondary text, `font-display` uppercase for headers, `.stat-num`/`.card`/`.eyebrow` utility classes, the `rise`/`rise-1`/`rise-2`/`rise-3` stagger animation) are the single source of truth for every screen touched below. **Two existing precedents already establish the house style for iconography**: `🔥` repeated for championship-window intensity (`DraftAndTournament.tsx`) and `★` repeated for recruiting rank (`Onboarding.tsx`) — both symbolic-repeat, both rating concepts, neither decorative. The established writing voice (confirmed from real option/consequence text) is second-person, dry, sports-column — never exclamation-heavy, never cutesy.

### 3.2 The rule

**One icon per section identity, placed on that section's existing `Eyebrow`/`Divider` label — never one per line, never per data row.** `Divider`'s `label` prop is a plain string (`<span className="eyebrow">{label}</span>`), so this is almost entirely a copy change (`<Divider label="Around the League" />` → `<Divider label="🗞️ Around the League" />`), not a new component. No change to `Shell.tsx` itself.

### 3.3 Per-screen changes

- **Season Complete** (`SeasonComplete.tsx`): "Stats" eyebrow → `💪 Stats`. "Decisions This Season" divider → unchanged (not on the user's list, no icon added — keeps the rule from becoming "everything gets an icon"). "Around the League" divider → `🗞️ Around the League`.
- **Fan Love** (`FanLove.tsx`): the `eyebrow` "Fan Love" label → `❤️ Fan Love`. No other change — the band text/threshold logic (`fanLoveLine`, `bandIndex`, `floorBandIndex`) is untouched.
- **Awards** (rendered inline today in `SeasonComplete.tsx` as plain amber-bordered text pills, e.g. "MVP", "ALL_STAR"): each pill gains a per-award-type icon prefix via a new small lookup table, e.g. `🏆` Champion, `👑` MVP, `⭐` All-Star, `🎖️` All-NBA, `🛡️` DPOY, `🌟` Rookie of Year, `🥇` Finals MVP, `🏅` All-Tournament — same pill styling otherwise, no new component.
- **Development** (`SeasonComplete.tsx`'s Stats block AND `CareerHub.tsx`'s STATS tab, both now driven by `totalSeasonDelta`): a **new, short, single-line** flavor sentence appears under an attribute's `value +N` row, but **only when that attribute's total delta for the season is >= the GOOD tier's lower bound (3)** — small routine deltas (the new common case, +1/+2/+3) stay numbers-only, per the user's explicit "no llenar de texto." The sentence is drawn from `development.ts`'s existing `ATTR_FLAVOR` table (already written, currently unused since a prior plan removed its only consumer) — reused as-is, not rewritten, and **never alters any stat** (purely a lookup keyed by which attribute moved, rendered, done). The rare-tier full-screen `DevelopmentScreen` gains a tier-varying title icon reusing the same intensity idiom as `🔥`/`★`: `💪` for NORMAL/GOOD, `🔥` for BREAKOUT/RARE_BREAKOUT, `🌟` for LEGENDARY, no icon (muted tone already exists) for POOR/REGRESSION.
- **Career Hub** (`CareerHub.tsx`): STATS tab's eyebrow gains `💪`. SEASON tab's "Last season" stat block gets no icon (box-score data, not on the user's list). "Season progress" — the label used during live season simulation (`SeasonFlow.tsx`'s `SeasonSimScreen`, "Season progress" eyebrow above the week-by-week bar) → `📈 Season progress`. That same screen's "Postseason" divider → `🏀 Postseason`, and its "Around the league" divider → `🗞️ Around the league` (matching Season Complete's wording/icon for the same concept, currently rendered lowercase there — align casing too, `Around the League`, while touching this line).
- **Big Decision / offers** (`SeasonFlow.tsx`'s `BigDecisionScreen`): no icon added to the offer cards themselves (the `TeamLogo` crest is already the visual anchor there, per the prior plan) — the screen's "Your future"/"The call" eyebrow is left as-is, not on the user's explicit list.
- **Olympics** (`SeasonFlow.tsx`'s `OlympicsScreen` and `SeasonResultScreen`): `OlympicsScreen`'s "International" eyebrow → `✈️ International`. `SeasonResultScreen` — confirmed used exclusively for the Olympics-finish path (per the prior plan's Global Constraint, still true) — its "Result" eyebrow → `✈️ Olympics Result`, giving it a distinct, purposeful identity instead of reading as a generic leftover screen next to the now-richer Season Complete.

### 3.4 Explicitly not touched

`Shell.tsx`, `styles.css`, `TeamLogo.tsx`, the Big Decision offer cards' layout, `CareerHeader.tsx`, the draft-night reveal screen (already has the game's biggest existing visual moment, the 120px crest — not on the user's list to expand further), any narrative/decision copy outside the `ATTR_FLAVOR` reuse above.

## 4. Olympics event-scoping fix

`finishOlympics` (`career.ts`) currently returns a bare `CareerState`, building one local `signature_moment` event and folding it into `state.log`/`state.moments` without returning it separately — which is *why* `App.tsx` resorted to `done.log.slice(-3)` in the first place, since there was no scoped events list to read. Change `finishOlympics`'s return type to `{ state: CareerState; events: CareerEvent[] }` (mirroring `SeasonEnd.events`'s existing shape from the club-season path), returning the same local `events` array it already builds internally instead of only folding it into `state.log`.

`App.tsx`'s Olympics branch of `finishRound` changes from:
```ts
const done = finishOlympics(res.state);
setState(done);
setResultEvents(done.log.slice(-3));
```
to:
```ts
const { state: done, events: olympicsEvents } = finishOlympics(res.state);
setState(done);
setResultEvents(olympicsEvents);
```

This is a pure data-scoping fix — no stage-machine changes, no new screens. `SeasonResultScreen` continues to receive exactly the events that happened *during Olympics itself*, never the Big Decision's already-shown consequence line.

## 5. Files

**New:** none.

**Modified:** `src/engine/development.ts` (`TIER_BUDGET`, rate-range narrowing in both call sites, `diminishingScale`, `finish()`, `applyWorkout`'s redirect + signature change, `getDevelopmentOptions`'s matching diminishing-returns application, `totalSeasonDelta`), `src/engine/career.ts` (`CareerState` gains `seasonMinigameDev`/`lastMinigameDev`, `initCareer` initializes both, `resolveTournamentRound` and `finishSeason`'s minigame-development sites both append to the accumulator, `finishSeason`'s `next` object sets `lastMinigameDev`/clears `seasonMinigameDev`, `applyWorkout`'s call site passes `player`, `finishOlympics`'s return type and body), `src/App.tsx` (Olympics branch of `finishRound`), `src/ui/screens/SeasonComplete.tsx` (icons, `totalSeasonDelta` wiring, per-attribute flavor line, Awards icon lookup, `DevelopmentScreen`'s tier-varying icon), `src/ui/screens/CareerHub.tsx` (STATS tab icon + `totalSeasonDelta` wiring), `src/ui/components/FanLove.tsx` (icon only), `src/ui/screens/SeasonFlow.tsx` (`SeasonSimScreen`'s three labels, `OlympicsScreen`'s eyebrow, `SeasonResultScreen`'s eyebrow).

**Explicitly not touched:** `Shell.tsx`, `styles.css`, `playstyle.ts`, `overall.ts`, `fanlove.ts`, `status.ts`, `awards.ts`, `events.ts`/`decisions.ts`/`bigdecision.ts` content, `rival.ts`, `TeamLogo.tsx`, `CareerHeader.tsx`, the event-pacing system, the locked-development-reward selection/reroll contract.

## 6. Testing plan

Unit tests (`src/engine/*.test.ts`):
- `diminishingScale`: exact boundary values (69→1, 70→0.75, 84→0.75, 85→0.5, 94→0.5, 95→0.25, 99→0.25) and that it's never applied to a REGRESSION (negative) delta.
- `finish()`/`rollDevelopment`: a GOOD-tier roll at a low current value produces a larger displayed delta than the identical roll at a high current value (property test across several `current` levels), and a positive tier's scaled-but-floored delta is never itself 0 before the ceiling clamp runs (an attribute already sitting at 99 still legitimately nets 0 after the ceiling clamp — that's pre-existing, unchanged behavior, not a diminishing-returns regression).
- `getDevelopmentOptions`: the previewed `to`/`delta` on each card matches what `rollDevelopment`/`finish()` would produce for the same locked reward at application time (the "what you see is what you get" contract, now under diminishing returns too).
- `applyWorkout`: the bonus lands on an attribute other than `focus` when at least one other active attribute is untouched this season; falls back to `focus` only when every active attribute already has a change; never produces a delta that would push the target past 99 in the returned `DevChange` (ceiling-aware).
- `totalSeasonDelta`: merges three independent sources touching overlapping and non-overlapping attributes correctly, rounds once, and drops zero-net entries.
- Tier-distribution/magnitude sanity check via `npm run simulate`: re-run and compare average-final-OVR and tier-frequency output against the pre-change baseline recorded in this plan's investigation — confirm BREAKOUT-or-better stays similarly rare in frequency (the tier weights aren't changing) while the *displayed magnitudes* drop into the ranges in §2.2's table.

`finishOlympics`/Olympics event-scoping: a test constructing a state mid-Olympics-finish confirming the returned `events` array contains only Olympics-generated events (the medal `signature_moment`), never a `career_move` event from an unrelated earlier Big Decision.

`tsc --noEmit`, `npm test`, `npx vite build`, `npm run simulate` all clean at the end (same known, pre-existing, unrelated `simulation.test.ts` OVR-spread exception carried forward).

Manual browser smoke test (`claude-in-chrome`, same pattern as prior plans): play several consecutive seasons confirming +1/+2/+3 reads as the common case and any single-attribute display in the +9-13 range is rare and tied to a LEGENDARY-tier moment; confirm the Stats block's numbers now reflect development+aging+minigame combined (spot-check by comparing a season's shown total against the attribute's before/after raw values); confirm each named section shows exactly one icon at its header, never per-line; confirm an Olympics-triggering career shows the Olympics result screen without repeating the Big Decision's consequence text.

## 7. Explicitly preserved (no changes)

Fan Love (all of it, from the immediately prior plan), the 1-sports+1-personal event pacing cap, `NarrativeEffects`, the playstyle system, the consolidated single-Season-Complete-screen structure, `Role`/`playerStatus`, the normal club-season state machine shape, awards rolling, the rivalry system, NCAA/draft/contract/tournament simulation, all 30 real teams/logos, retirement/career summary, the locked-development-reward pick-and-lock mechanic itself (only its underlying numbers change).
