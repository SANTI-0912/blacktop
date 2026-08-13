import { pathToFileURL } from "node:url";
import {
  initCareer, chooseFocus, getSeasonDevelopmentOptions, runSeason, finishSeason,
  hasWorkoutOpportunity, setWorkoutResult, playerOvr, signDraftPick, CareerState,
} from "../src/engine/career";
import { PLAYSTYLE_PROFILES } from "../src/engine/playstyle";
import { Playstyle } from "../src/engine/types";
import { DevTier } from "../src/engine/development";
import { createRNG } from "../src/engine/rng";

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
  /** Steals/blocks per game — the defensive box-score signal, reported alongside
   * PPG/RPG/APG so TWO_WAY's and INTERIOR's defensive identity is visible too. */
  careerSpg: number;
  careerBpg: number;
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
    const seasonRng = createRNG(seed + guard * 7919);
    const options = getSeasonDevelopmentOptions(state);
    state = chooseFocus(state, options[0].attribute);
    if (hasWorkoutOpportunity(state)) {
      state = setWorkoutResult(state, seasonRng.next() < 0.5);
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
    careerSpg: avg((s) => s.spg ?? 0),
    careerBpg: avg((s) => s.bpg ?? 0),
    tierCounts,
  };
}

export function simulateMany(n: number, playstyle: Playstyle): CareerOutcome[] {
  return Array.from({ length: n }, (_, i) => simulateOneCareer(i * 1000 + PLAYSTYLES.indexOf(playstyle), playstyle));
}

// ESM-safe "run only when executed directly" check (the project is `"type": "module"`).
// Built with node:url's pathToFileURL rather than a raw `file://${process.argv[1]}`
// template so it's correct on Windows too: a Windows path uses backslashes and no
// leading slash, so a plain string template never matches import.meta.url's
// forward-slash, percent-encoded `file:///C:/...` form.
const isDirectRun = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const N = 30;
  for (const playstyle of PLAYSTYLES) {
    const results = simulateMany(N, playstyle);
    const avgOvr = results.reduce((s, r) => s + r.finalOvr, 0) / N;
    const avgPpg = results.reduce((s, r) => s + r.careerPpg, 0) / N;
    const avgRpg = results.reduce((s, r) => s + r.careerRpg, 0) / N;
    const avgApg = results.reduce((s, r) => s + r.careerApg, 0) / N;
    const avgSpg = results.reduce((s, r) => s + r.careerSpg, 0) / N;
    const avgBpg = results.reduce((s, r) => s + r.careerBpg, 0) / N;
    const tierTotals: Partial<Record<DevTier, number>> = {};
    for (const r of results) {
      for (const [tier, count] of Object.entries(r.tierCounts)) {
        tierTotals[tier as DevTier] = (tierTotals[tier as DevTier] ?? 0) + (count ?? 0);
      }
    }
    console.log(`\n=== ${playstyle} (n=${N}) ===`);
    console.log(`avg final OVR: ${avgOvr.toFixed(1)}`);
    console.log(`avg career PPG/RPG/APG: ${avgPpg.toFixed(1)} / ${avgRpg.toFixed(1)} / ${avgApg.toFixed(1)}`);
    console.log(`avg career SPG/BPG (defense): ${avgSpg.toFixed(2)} / ${avgBpg.toFixed(2)}`);
    console.log(`tier distribution:`, tierTotals);
  }
}
