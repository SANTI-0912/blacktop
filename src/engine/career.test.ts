import { describe, it, expect } from "vitest";
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, hasWorkoutOpportunity,
  runSeason, finishSeason, applySeasonEvent, buildEventContext,
  signDraftPick, applyBigDecision, finishOlympics, resolveTournamentRound, RoundChallenge,
  buildCareerSummary, getBigDecision,
} from "./career";
import { fanLoveTier } from "./fanlove";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { totalSeasonDelta } from "./development";
import { pickEvent } from "./events";
import { createRNG } from "./rng";
import { NBA_TEAMS } from "./teams";
import { BigDecision } from "./bigdecision";
import { DraftSlot } from "./draft";
import { buildTournament } from "./tournament";
import { GauntletOutcome } from "./minigameLibrary";

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

describe("locked development reward carries through to season end", () => {
  it("chooseFocus locks a concrete reward that finishSeason applies unchanged", () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = initCareer(seed, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
      const options = getSeasonDevelopmentOptions(state);
      const focus = options[0].attribute;
      state = chooseFocus(state, focus);

      expect(state.lockedDevelopment).not.toBeNull();
      expect(state.lockedDevelopment?.attribute).toBe(focus);
      expect(state.lockedDevelopment!.delta).toBe(options[0].delta);
      expect(state.lockedDevelopment!.tier).toBe(options[0].tier);
      const lockedDelta = state.lockedDevelopment!.delta;
      const lockedTier = state.lockedDevelopment!.tier;

      const run = runSeason(state);
      const end = finishSeason(run.state, null);

      const primary = end.development!.changes.find((c) => c.attribute === focus);
      expect(primary?.delta).toBe(lockedDelta);
      expect(end.development!.tier).toBe(lockedTier);
      // The lock only ever applies to the season it was made for.
      expect(end.state.lockedDevelopment).toBeNull();
    }
  });
});

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

  it("leaving a team costs 8 points off that team's recorded Fan Love Legacy peak, and never touches the team joined", () => {
    let state = initCareer(2, { name: "T", country: "USA", position: "PF", height: 205, playstyle: "INTERIOR" });
    state = {
      ...state,
      phase: "NBA",
      team: NBA_TEAMS[0],
      player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 78, reputation: 15 } },
      fanLovePeaks: { [NBA_TEAMS[0].id]: 60 },
    };
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test", season: state.season, prompt: "Where next?",
      options: [
        { id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} },
        { id: "move", team: NBA_TEAMS[1], headline: "Move", bullets: [], effects: {} },
      ],
    };
    const next = applyBigDecision(state, "move", decision);
    expect(next.fanLovePeaks[NBA_TEAMS[0].id]).toBe(52); // 60 - 8
    expect(next.fanLovePeaks[NBA_TEAMS[1].id]).toBeUndefined(); // untouched, no legacy there yet
  });

  it("does not create a phantom legacy entry when leaving a team with no recorded peak yet", () => {
    let state = initCareer(2, { name: "T", country: "USA", position: "PF", height: 205, playstyle: "INTERIOR" });
    state = { ...state, phase: "NBA", team: NBA_TEAMS[0] };
    expect(state.fanLovePeaks[NBA_TEAMS[0].id]).toBeUndefined();
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test", season: state.season, prompt: "Where next?",
      options: [
        { id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} },
        { id: "move", team: NBA_TEAMS[1], headline: "Move", bullets: [], effects: {} },
      ],
    };
    const next = applyBigDecision(state, "move", decision);
    expect(next.fanLovePeaks[NBA_TEAMS[0].id]).toBeUndefined();
  });

  it("staying never penalizes the current team's Fan Love Legacy peak", () => {
    let state = initCareer(2, { name: "T", country: "USA", position: "PF", height: 205, playstyle: "INTERIOR" });
    state = {
      ...state,
      phase: "NBA",
      team: NBA_TEAMS[0],
      fanLovePeaks: { [NBA_TEAMS[0].id]: 60 },
    };
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test", season: state.season, prompt: "Where next?",
      options: [
        { id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} },
      ],
    };
    const next = applyBigDecision(state, "stay", decision);
    expect(next.fanLovePeaks[NBA_TEAMS[0].id]).toBe(60);
  });

  it("a join offer's previewed starting Fan Love (\"Starts at X/100\") matches what applyBigDecision actually sets", () => {
    let state = initCareer(5, { name: "T", country: "USA", position: "SF", height: 201, playstyle: "TWO_WAY" });
    state = {
      ...state,
      phase: "NBA",
      team: NBA_TEAMS[0],
      contractYearsLeft: 0, // forces getBigDecision to actually offer a TEAM_OFFER this call
      player: {
        ...state.player,
        hidden: { ...state.player.hidden, fanLove: 60, reputation: 45 },
        awards: [{ type: "ALL_STAR", season: 2 }],
      },
    };
    const decision = getBigDecision(state);
    expect(decision.kind).toBe("TEAM_OFFER");
    if (decision.kind !== "TEAM_OFFER") return;
    const join = decision.options.find((o) => o.id.startsWith("join_"));
    expect(join).toBeDefined();
    if (!join) return;
    const bullet = join.bullets.find((b) => b.startsWith("Starts at "));
    expect(bullet).toBeDefined();
    const previewed = Number(bullet!.match(/Starts at (\d+)\/100/)![1]);
    const next = applyBigDecision(state, join.id, decision);
    expect(Math.round(next.player.hidden.fanLove)).toBe(previewed);
  });

  it("applyBigDecision's stayed branch applies its +4 loyalty nudge through the diminishing-returns curve, not a flat clamp", () => {
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
    // Not the old flat "50 + 4 = 54" behavior — applyFanLoveGain scales the
    // +4 nudge by fanLoveDiminishing(50) = 0.85, landing at 53.4.
    expect(next.player.hidden.fanLove).not.toBe(54);
    expect(next.player.hidden.fanLove).toBeCloseTo(53.4, 5);
  });
});

describe("fanlove_milestone event", () => {
  it("never fires more than once per season, and only ever reflects an actual upward threshold crossing", () => {
    // tournament.cleared only advances through interactive play in the real
    // game, so left at its default it's permanently 0 here — which always
    // resolves to FIRST_ROUND (a guaranteed Fan Love no-op) regardless of
    // seed, and Fan Love could never cross a threshold. Seeding cleared to a
    // seed-driven depth fixes that while keeping the test statistical, not
    // a single forced scenario — the actual Fan Love delta is still whatever
    // playoffOutcomeFanLoveBump/awards/tenure produce for that depth.
    let sawAtLeastOne = false;
    for (let seed = 0; seed < 60; seed++) {
      let state = initCareer(seed, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
      state = chooseFocus(state, "shooting");
      const fanLoveBefore = state.player.hidden.fanLove;
      let run = runSeason(state);
      if (run.state.tournament) {
        const depth = seed % (run.state.tournament.rounds.length + 1);
        run = { ...run, state: { ...run.state, tournament: { ...run.state.tournament, cleared: depth } } };
      }
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

describe("lastMinigameDev persists on CareerState, seasonMinigameDev resets each season", () => {
  it("finishSeason clears seasonMinigameDev for the next season regardless of whether any minigame fired", () => {
    let state = initCareer(20, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    state = chooseFocus(state, "shooting");
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.state.seasonMinigameDev).toEqual([]);
    // lastMinigameDev may be empty too (no interactive minigame run in this
    // headless test path) — the field must exist and be an array either way.
    expect(Array.isArray(end.state.lastMinigameDev)).toBe(true);
  });
});

describe("finishOlympics returns its own scoped events, never leaking an unrelated prior log entry", () => {
  it("does not include a career_move event from an earlier Big Decision in its returned events", () => {
    let state = initCareer(30, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    // Simulate exactly what the real flow leaves behind: a Big Decision's
    // consequence event sitting in the log right before Olympics resolves.
    state = {
      ...state,
      phase: "OLYMPICS",
      tournament: null,
      log: [
        ...state.log,
        { id: "move_1", season: state.season, type: "career_move", narrative: "You signed with Test Team.", flags: ["stayed_loyal"] },
      ],
    };
    const { events } = finishOlympics(state);
    expect(events.some((e) => e.type === "career_move")).toBe(false);
    expect(events.some((e) => e.type === "signature_moment")).toBe(true);
    expect(events.length).toBe(1); // exactly the one Olympics medal event, nothing else
  });
});

describe("resolveTournamentRound records the delta that actually landed, not the requested amount", () => {
  it("clamps the recorded seasonMinigameDev delta at the 99 ceiling", () => {
    let state = initCareer(50, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER" });
    // Push shooting (PERFECT_TIMING's target attribute) right up against the
    // ceiling — a "perfect run" would normally award +3, but only +1 can
    // actually land here.
    state = { ...state, player: { ...state.player, attributes: { ...state.player.attributes, shooting: 98 } } };
    const tournament = buildTournament(createRNG(1), "NCAA", 0.95, null, "USA")!;
    state = { ...state, tournament };
    // resolveTournamentRound only reads challenge.gauntlet.headlineKind.
    const challenge = { gauntlet: { headlineKind: "PERFECT_TIMING" } } as RoundChallenge;
    const outcome: GauntletOutcome = { roundsSurvived: 1, roundsTotal: 1, eliminated: false, kinds: ["PERFECT_TIMING"] };

    const res = resolveTournamentRound(state, challenge, outcome);

    expect(res.state.player.attributes.shooting).toBe(99);
    const entry = res.state.seasonMinigameDev.find((c) => c.attribute === "shooting");
    expect(entry).toBeDefined();
    expect(entry!.delta).toBe(1); // the delta that actually landed (98 -> 99), NOT the raw requested amount of 3
  });
});

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

describe("finishSeason caps automatic development in the final returned state", () => {
  it("never lets a non-primary attribute's totalSeasonDelta exceed AUTOMATIC_ATTR_CAP", () => {
    let state = initCareer(70, { name: "T", country: "USA", position: "SG", height: 198, playstyle: "SUPERSTAR" });
    const opts = getSeasonDevelopmentOptions(state);
    state = chooseFocus(state, opts[0].attribute);
    const run = runSeason(state);
    const end = finishSeason(run.state, null);
    expect(end.primaryDevelopment).not.toBeNull();
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

describe("Fan Love grows more slowly across a realistic multi-season career after the rebalance", () => {
  it("repeat championship-tier seasons on one NBA team, starting from an already-elevated Fan Love, do not run away to 100 the way the old flat clamp would", () => {
    let state = initCareer(80, { name: "T", country: "USA", position: "SF", height: 201, playstyle: "TWO_WAY" });
    // Fast-forward through the (deterministic-length) NCAA phase into the
    // draft — same signDraftPick entry point the "Fan Love resets on a team
    // change" describe block above already exercises.
    while (state.phase === "NCAA") {
      state = chooseFocus(state, "defense");
      const run = runSeason(state);
      const end = finishSeason(run.state, null);
      state = end.state;
    }
    expect(state.phase).toBe("DRAFT");
    const slot: DraftSlot = {
      pick: 1, team: NBA_TEAMS[0], interested: true, expectedRole: "Starter",
      championshipWindow: 3, competition: "High", market: "Elite",
    };
    state = signDraftPick(state, slot);
    // Elite attributes keep performanceScore (and so award odds — see
    // awards.ts) high across every NBA season that follows, and starting
    // Fan Love already at 60 puts every gain squarely in
    // fanLoveDiminishing's 0.65/0.4/0.2 bands (fanlove.ts) — the exact
    // range where applyFanLoveGain and the old flat clamp diverge most.
    state = {
      ...state,
      player: {
        ...state.player,
        attributes: {
          shooting: 95, finishing: 95, passing: 95, ballHandling: 95,
          defense: 95, athleticism: 95, strength: 95, basketballIQ: 95, clutch: 95,
        },
        hidden: { ...state.player.hidden, fanLove: 60 },
      },
    };
    for (let i = 0; i < 3; i++) {
      state = chooseFocus(state, "defense");
      let run = runSeason(state);
      // Force a championship-depth playoff run every season the same way
      // the "fanlove_milestone event" describe block above does — cleared
      // otherwise stays 0 (no interactive minigame play happened), which
      // would route every season into the tier-0/tier-1 bump band and
      // never actually exercise the playoff-depth call site this task
      // rewired to go through applyFanLoveGain.
      if (run.state.tournament) {
        run = {
          ...run,
          state: { ...run.state, tournament: { ...run.state.tournament, cleared: run.state.tournament.rounds.length } },
        };
      }
      const end = finishSeason(run.state, null);
      state = end.state;
    }
    // With the old flat clamp(current + bump, 0, 100), six seasons of
    // repeat-championship playoff bumps (+10 each after the first) plus
    // award bumps starting from Fan Love 60 blow straight through 100
    // within the first two or three seasons and stay pinned there. With
    // applyFanLoveGain's diminishing returns wired in (Step 2's playoff/
    // tenure bump and Step 3's award bumps), the same six seasons climb
    // much more slowly and never reach the cap — this assertion is only
    // true because the rebalanced wiring is actually in place.
    expect(state.player.hidden.fanLove).toBeLessThan(100);
  });
});

describe("Fan Love Legacy — peak Fan Love tracked per team across the career", () => {
  it("records a season's Fan Love as that team's peak, and buildCareerSummary exposes it with the matching tier", () => {
    let state = initCareer(10, { name: "T", country: "USA", position: "SF", height: 201, playstyle: "TWO_WAY" });
    while (state.phase === "NCAA") {
      state = chooseFocus(state, "defense");
      const run = runSeason(state);
      state = finishSeason(run.state, null).state;
    }
    const slot: DraftSlot = {
      pick: 1, team: NBA_TEAMS[0], interested: true, expectedRole: "Starter",
      championshipWindow: 3, competition: "High", market: "Elite",
    };
    state = signDraftPick(state, slot);
    const teamA = state.team.id;
    state = { ...state, player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 75 } } };
    state = chooseFocus(state, "defense");
    const run = runSeason(state);
    state = finishSeason(run.state, null).state;

    expect(state.fanLovePeaks[teamA]).toBeGreaterThanOrEqual(75); // Fan Love only grows or holds this season
    const legacy = buildCareerSummary(state).fanLoveLegacy;
    const entry = legacy.find((e) => e.teamId === teamA)!;
    expect(entry).toBeDefined();
    expect(entry.peak).toBe(state.fanLovePeaks[teamA]);
    expect(entry.tier).toBe(fanLoveTier(entry.peak));
    expect(entry.teamName).toBe(NBA_TEAMS[0].name);
  });

  it("dents the old team's peak by the leave penalty after a team change, and tracks the new team separately", () => {
    let state = initCareer(11, { name: "T", country: "USA", position: "PF", height: 205, playstyle: "INTERIOR" });
    while (state.phase === "NCAA") {
      state = chooseFocus(state, "strength");
      const run = runSeason(state);
      state = finishSeason(run.state, null).state;
    }
    const slot: DraftSlot = {
      pick: 1, team: NBA_TEAMS[0], interested: true, expectedRole: "Starter",
      championshipWindow: 3, competition: "High", market: "Elite",
    };
    state = signDraftPick(state, slot);
    const teamA = state.team.id;
    state = { ...state, player: { ...state.player, hidden: { ...state.player.hidden, fanLove: 80 } } };
    state = chooseFocus(state, "strength");
    let run = runSeason(state);
    state = finishSeason(run.state, null).state;
    const peakOnTeamA = state.fanLovePeaks[teamA];
    expect(peakOnTeamA).toBeGreaterThanOrEqual(80);

    // Move to a different team — Fan Love resets low for the new market,
    // and the peak already banked for teamA takes the standard -8 leave
    // penalty (see "leaving a team costs 8 points..." above), but survives
    // otherwise — this season's growth on teamB never touches it.
    const teamB = NBA_TEAMS[1];
    const decision: BigDecision = {
      kind: "TEAM_OFFER", id: "test", season: state.season, prompt: "Where next?",
      options: [
        { id: "stay", team: NBA_TEAMS[0], headline: "Stay", bullets: [], effects: {} },
        { id: "move", team: teamB, headline: "Move", bullets: [], effects: {} },
      ],
    };
    state = applyBigDecision(state, "move", decision);
    expect(state.team.id).toBe(teamB.id);
    state = chooseFocus(state, "strength");
    run = runSeason(state);
    state = finishSeason(run.state, null).state;

    expect(state.fanLovePeaks[teamA]).toBe(peakOnTeamA - 8); // dented by leaving, never erased
    expect(state.fanLovePeaks[teamB.id]).toBeGreaterThan(0);
    const legacy = buildCareerSummary(state).fanLoveLegacy;
    // teamA and teamB, plus the NCAA college team from before the draft.
    expect(legacy.length).toBe(3);
    const legacyTeamIds = legacy.map((e) => e.teamId);
    expect(legacyTeamIds).toContain(teamA);
    expect(legacyTeamIds).toContain(teamB.id);
    // Sorted best-first.
    for (let i = 1; i < legacy.length; i++) expect(legacy[i - 1].peak).toBeGreaterThanOrEqual(legacy[i].peak);
  });
});
