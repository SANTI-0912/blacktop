import {
  CareerEvent, DecisionOption, NarrativeState, Person, PlayoffResult,
  Rival, RivalArc, SeasonDecision, SeasonStats,
} from "./types";
import { RNG, pick, randInt, weighted, clamp, randRange } from "./rng";
import { applyDecisionEffects } from "./decisions";
import { applyOffseasonDecay, simulateSeasonStats, computeTeamQuality } from "./simulation";
import { applyDevelopmentGrowth } from "./growth";
import { rollDevelopment, applyDevelopment } from "./development";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { simulateFullPlayoffRun, formatPlayoffResult } from "./playoffs";

// ============================================================
// RIVAL SIMULATION
// The rival is simulated with the SAME simulateSeasonStats() and the SAME
// growth system used for the player. This file only adds: (1) a decision-
// picking heuristic so the rival isn't a no-op, (2) arc-based growth TIMING,
// and (3) narrative bookkeeping.
//
// It never reads the player's stats to adjust the rival's numbers, and the
// arc no longer caps how good the rival can become — it only shifts WHEN
// their growth arrives. A LATE_BLOOMER is slow early and surges later; an
// EARLY_STAR_PLATEAU is the reverse. Both can end elite.
// ============================================================

// ROOT CAUSE FIX: this file used to keep its own list of ten bare city names
// ("Chicago", "Washington", ...) with no link to the team registry. The rival's
// club was therefore a string with no id, so whenever he appeared as a playoff
// opponent he rendered as "CHICAGO" with a generic crest instead of the
// Chicago Bulls with their real logo. The rival now draws from the same 30-team
// registry as everyone else.
import { NBA_TEAMS as LEAGUE_TEAMS, NCAA_TEAMS, Team } from "./teams";

function randomLeagueTeam(rng: RNG, excludeId?: string | null): Team {
  const pool = LEAGUE_TEAMS.filter((t) => t.id !== excludeId);
  return pick(rng, pool);
}

/** True while the rival's current club is still a college program — the
 * signal simulateRivalSeason uses to know he hasn't turned pro yet. Keys off
 * the team registry rather than a literal "College" placeholder, since he
 * now starts with a real assigned school (see player.ts's createRival). */
function isCollegeTeam(teamId: string | null): boolean {
  return teamId !== null && NCAA_TEAMS.some((t) => t.id === teamId);
}

export function rivalPickOption(rng: RNG, rival: Rival, decision: SeasonDecision): DecisionOption {
  const weights = decision.options.map((opt) => {
    let w = 1;
    if (rival.arc === "STEADY_RISER" && (opt.tags.includes("balanced") || opt.tags.includes("defense"))) w += 1.5;
    if (rival.arc === "EARLY_STAR_PLATEAU" && (opt.tags.includes("offense") || opt.tags.includes("bold"))) w += 1.5;
    if (rival.arc === "LATE_BLOOMER" && (opt.tags.includes("recovery") || opt.tags.includes("mentorship"))) w += 1.5;
    if (rival.arc === "INJURY_PRONE" && opt.tags.includes("risk")) w += 1.2;
    return { item: opt, weight: w };
  });
  return weighted(rng, weights);
}

// Arc shapes the TIMING of growth, never the ceiling.
//
// IMPORTANT: these must average to ~1.0 across a career, matching the
// player's neutral growth bias. An earlier pass had every arc returning
// >= 1.1, which handed the rival free compounding growth every season and
// systematically pushed the player toward losing the rivalry regardless of
// how well they played. Arcs redistribute growth over time; they don't add it.
function growthBiasForArc(arc: RivalArc, overallSeason: number): number {
  const early = overallSeason <= 5;
  switch (arc) {
    case "EARLY_STAR_PLATEAU":
      return early ? 1.4 : 0.6; // peaks fast, stalls
    case "LATE_BLOOMER":
      return early ? 0.6 : 1.4; // slow start, big surge
    case "STEADY_RISER":
      return 1.0; // flat, reliable
    case "INJURY_PRONE":
      return 1.05; // real talent; the risk is availability, not ability
  }
}

export function simulateRivalSeason(
  rng: RNG,
  rival: Rival,
  season: number,
  phase: "NCAA" | "NBA",
  decision: SeasonDecision
): { rival: Rival; events: CareerEvent[]; stats: SeasonStats; playoffResult: PlayoffResult } {
  const chosen = rivalPickOption(rng, rival, decision);
  let updated = {
    ...(applyDecisionEffects(rival, chosen) as Rival),
    arc: rival.arc, narrativeState: rival.narrativeState, team: rival.team, teamId: rival.teamId,
  };

  // Assign an NBA team when the rival turns pro.
  if (phase === "NBA" && isCollegeTeam(updated.teamId)) {
    const t = randomLeagueTeam(rng);
    updated = { ...updated, team: t.name, teamId: t.id };
  }

  const events: CareerEvent[] = [];

  // Injury-prone rivals occasionally lose availability — a real career event.
  if (rival.arc === "INJURY_PRONE" && rng.next() < 0.18) {
    updated = { ...updated, hidden: { ...updated.hidden, fatigue: clamp(updated.hidden.fatigue + 25, 0, 100) } };
    events.push({
      id: `rival_injury_${season}`,
      season,
      type: "rival_update",
      narrative: `BREAKING — ${updated.name} will miss time with an injury.`,
      flags: ["rival_injury", "rival_involved"],
    });
  }

  // The rival faces their own clutch moments. The player's confidence swings
  // every season based on minigame results, so the rival must be exposed to
  // the same volatility — otherwise their confidence only ever drifts upward
  // and they gain a systematic edge in moraleModifier (and therefore in
  // performance and awards). Their success chance derives from their own
  // composure attributes, never from how the player performed.
  // Composure derives from basketball IQ ONLY — deliberately NOT from
  // confidence. Including confidence created a runaway feedback loop
  // (high confidence -> more clutch wins -> higher confidence), which pushed
  // the rival to a ~64% clutch success rate against the player's ~48% and
  // inflated their awards regardless of how the player performed.
  const composure = updated.attributes.basketballIQ / 99;
  const clutchWon = rng.next() < clamp(0.36 + composure * 0.16, 0.34, 0.54);
  // Stakes multiplier mirrors the player's (LOW 0.5 .. CAREER_DEFINING 2.4),
  // so the rival's confidence is exactly as volatile as the player's. Without
  // this the rival's morale only drifted gently while the player could lose
  // 30+ confidence on a single failed Finals shot.
  const stakesMult = pick(rng, [0.5, 1, 1.6, 2.4]);
  const clutchSwing = (clutchWon ? randInt(rng, 6, 14) : -randInt(rng, 6, 14)) * stakesMult;
  updated = {
    ...updated,
    hidden: {
      ...updated.hidden,
      confidence: clamp(updated.hidden.confidence + clutchSwing, 0, 100),
      reputation: clamp(updated.hidden.reputation + clutchSwing * 0.6, 0, 100),
    },
  };

  // Rival team quality must be drawn from the SAME range the player can
  // actually reach through contracts (roughly 0.25-0.78 via TEAM_POOL /
  // draft). A previous pass used 0.4 + reputation/200, which climbed to 0.9
  // and fed back into more reputation — a runaway loop that let the rival
  // out-earn the player on awards no matter how well the player played.
  const teamStrength = clamp(
    0.38 + updated.hidden.reputation / 500 + randRange(rng, -0.08, 0.12),
    0.25,
    0.78
  );
  const stats = simulateSeasonStats({ person: updated, season, phase, teamStrength, rng });

  // The rival has no player-controlled minigame, so their postseason resolves
  // automatically via the same round-by-round curve used for the player.
  const teamQuality = computeTeamQuality(teamStrength, stats.performanceScore);
  const playoffResult = simulateFullPlayoffRun(rng, teamQuality);
  const finalStats: SeasonStats = { ...stats, playoffResult };

  // The rival develops through the EXACT same tiered system as the player.
  // Leaving them on the old flat growth curve while the player moved to the
  // new one handed them a large hidden advantage — measured at a 61% rivalry
  // win rate before this was corrected.
  const withStats = { ...updated, seasonStats: [...updated.seasonStats, finalStats] };
  const rivalFocus = pick(rng, PLAYSTYLE_PROFILES[rival.playstyle].active);
  // Performance is floored for the rival's development roll only. Their raw
  // performanceScore feeds off their own attributes, so a slow start dragged
  // their development tier down, which lowered attributes further — a death
  // spiral that left them ~10 OVR behind by retirement. The floor keeps their
  // career self-correcting without ever reading the player's numbers.
  const rivalDev = rollDevelopment({
    rng,
    person: withStats,
    focus: rivalFocus,
    age: 18 + season,
    performance: Math.max(finalStats.performanceScore, 0.72),
  });
  // The player has extra development sources the rival doesn't: the offseason
  // workout and minigame runs. Without an equivalent the rival falls hopelessly
  // behind (measured: player won 100% of rivalries). This is their version of
  // putting in the extra work — deliberately a touch smaller, because the
  // player is the protagonist and should hold a real edge, not a guaranteed one.
  const rivalExtra = rng.next() < 0.65
    ? [{ attribute: rivalFocus, delta: randInt(rng, 2, 5) }]
    : [];
  updated = applyDevelopment(withStats, {
    ...rivalDev,
    changes: [...rivalDev.changes, ...rivalExtra],
  }) as Rival;
  updated = { ...updated, hidden: applyOffseasonDecay(updated.hidden), arc: rival.arc, narrativeState: rival.narrativeState, team: updated.team };

  events.push({
    id: `rival_season_${season}`,
    season,
    type: "rival_update",
    narrative: buildRivalStatUpdate(rng, updated, finalStats, phase),
    flags: ["rival_season_result"],
  });

  return { rival: updated, events, stats: finalStats, playoffResult };
}

export function buildRivalStatUpdate(rng: RNG, rival: Rival, stats: SeasonStats, phase: "NCAA" | "NBA"): string {
  const where = `for ${rival.team}`;
  const variants = [
    `RIVAL UPDATE — ${rival.name} averaged ${stats.ppg} PPG ${where} and ${formatPlayoffResult(stats.playoffResult, phase)}.`,
    `${rival.name} put up ${stats.ppg}/${stats.rpg}/${stats.apg} ${where} this season.`,
    `Around the league: ${rival.name} is at ${stats.ppg} points a night ${where}.`,
  ];
  return pick(rng, variants);
}

// ============================================================
// RIVALRY COMPOSITE SCORE + NARRATIVE STATE
// ============================================================

export function rivalryCompositeScore(person: Person): number {
  const championships = person.awards.filter((a) => a.type === "CHAMPION").length;
  const mvps = person.awards.filter((a) => a.type === "MVP").length;
  const allStars = person.awards.filter((a) => a.type === "ALL_STAR").length;
  const avgPerf =
    person.seasonStats.length > 0
      ? person.seasonStats.reduce((s, x) => s + x.performanceScore, 0) / person.seasonStats.length
      : 0;
  return championships * 40 + mvps * 30 + allStars * 8 + avgPerf * 20 + person.hidden.reputation * 0.1;
}

export function computeNarrativeState(playerScore: number, rivalScore: number): NarrativeState {
  const diff = playerScore - rivalScore;
  if (playerScore < 5 && rivalScore < 5) return "UNPROVEN";
  if (diff > 40) return "PLAYER_DOMINANT";
  if (diff > 10) return "PLAYER_AHEAD";
  if (diff < -40) return "RIVAL_DOMINANT";
  if (diff < -10) return "RIVAL_AHEAD";
  return "PEER";
}

const NARRATIVE_LINES: Record<NarrativeState, string[]> = {
  UNPROVEN: [
    "Scouts are still trying to figure out who the better prospect really is.",
    "It's early, but the comparisons between you two have already started.",
  ],
  PEER: [
    "The debate over who's better still doesn't have a clear answer.",
    "Every season just adds fuel to an argument nobody can settle.",
  ],
  PLAYER_AHEAD: [
    "The consensus is shifting. More people are picking you in the debate now.",
    "The gap is starting to show, and it's in your favor.",
  ],
  RIVAL_AHEAD: [
    "The debate has tilted. Right now, most people would take the other side.",
    "It's getting harder to argue you're still the better player.",
  ],
  PLAYER_DOMINANT: [
    "There's no debate left. You've clearly won this one.",
    "What used to be a rivalry isn't really a contest anymore.",
  ],
  RIVAL_DOMINANT: [
    "The rivalry has become one-sided, and not in your favor.",
    "It's stopped being a debate. He's simply had the better career so far.",
  ],
};

export function rivalryStateUpdate(rng: RNG, player: Person, rival: Rival, season: number): { state: NarrativeState; event: CareerEvent } {
  const state = computeNarrativeState(rivalryCompositeScore(player), rivalryCompositeScore(rival));
  return {
    state,
    event: {
      id: `rivalry_state_${season}`,
      season,
      type: "rivalry_narrative",
      narrative: pick(rng, NARRATIVE_LINES[state]),
      flags: [`rivalry_state_${state.toLowerCase()}`],
    },
  };
}

// Contextual updates that keep the rival alive between direct encounters.
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
  if (roll < 0.28) {
    const playerPpg = player.seasonStats[player.seasonStats.length - 1]?.ppg ?? 0;
    const playerFirst = playerPpg >= last.ppg;
    return {
      id: `rival_ctx_race_${season}`, season, type: "rival_update",
      narrative: `MVP RACE\nYou: #${playerFirst ? 1 : 2}\n${rival.name}: #${playerFirst ? 2 : 1}`,
      flags: ["rival_mvp_race"],
    };
  }
  if (roll < 0.42 && phase === "NBA") {
    const newTeam = randomLeagueTeam(rng, rival.teamId);
    return {
      id: `rival_ctx_contract_${season}`, season, type: "rival_update",
      narrative: `BREAKING — ${rival.name} has signed a ${randInt(rng, 2, 3)}-year, $${randInt(rng, 120, 230)}M contract with ${newTeam.name}.`,
      flags: ["rival_contract", `rival_team:${newTeam.id}`],
    };
  }
  if (roll < 0.5 && phase === "NBA") {
    return {
      id: `rival_ctx_trade_${season}`, season, type: "rival_update",
      narrative: `TRADE RUMOR — ${rival.name}'s name is circulating ahead of the deadline.`,
      flags: ["rival_trade_rumor"],
    };
  }
  return null;
}

// Applies the rival's team change from a contract event so the world stays consistent.
export function applyRivalTeamChange(rival: Rival, event: CareerEvent): Rival {
  // Read the id straight off the flag rather than parsing the sentence — the
  // old regex could only recover a name, which is how the rival ended up with
  // teams that had no registry entry.
  const flag = event.flags.find((f) => f.startsWith("rival_team:"));
  if (!flag) return rival;
  const id = flag.split(":")[1];
  const t = LEAGUE_TEAMS.find((x) => x.id === id);
  return t ? { ...rival, team: t.name, teamId: t.id } : rival;
}
