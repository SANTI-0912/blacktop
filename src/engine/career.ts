import {
  Attributes, CareerEvent, CareerPhase, Hidden, MinigameResult, Person, PlayoffResult,
  Playstyle, Position, Rival, Round, SeasonStats,
} from "./types";
import { RNG, createRNG, clamp, pick, randInt } from "./rng";
import { createPlayer, createRival } from "./player";
import { applyDecisionEffects, generateSeasonDecision } from "./decisions";
import { applyOffseasonDecay, simulateSeasonStats, computeTeamQuality } from "./simulation";
import { applyDevelopmentGrowth } from "./growth";
import {
  determinePlayoffPath, checkRivalryEncounter, formatPlayoffResult,
  roundLabel, simulateRemainingRounds,
} from "./playoffs";
import {
  generateRivalContextEvent, rivalryCompositeScore, rivalryStateUpdate,
  simulateRivalSeason, applyRivalTeamChange, buildRivalStatUpdate,
} from "./rival";
import { rollSeasonAwards } from "./awards";
import { makeMilestone, MILESTONE_FLAGS } from "./history";
import {
  Team, RosterSlot, NCAA_TEAMS, NBA_TEAMS, buildRoster, supportingCastOvr,
  teamOvrToStrength, nationalTeam, teamById,
} from "./teams";
import { computeOverall, determineRole, Role, roleMinutesFactor, jerseyNumber } from "./overall";
import {
  playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange, FAN_LOVE_BAND_THRESHOLDS,
  applyFanLoveGain, fanLoveTier, FanLoveTier, applyMarketFanLoveMultiplier,
} from "./fanlove";
import { buildChallenge, ChallengeConfig } from "./challenge";
import { buildSchedule, buildBracket, conferenceSeed, WeekResult, BracketStep } from "./schedule";
import {
  BigDecision, generateCareerCall, generateTeamOffers, TeamOption, CallOption,
  STAY_FAN_LOVE_BUMP,
} from "./bigdecision";
import {
  buildGauntlet, Gauntlet, MinigameKind, EventImportance, GauntletOutcome,
  developmentFromRun, MINIGAME_ATTRIBUTE,
} from "./minigameLibrary";
import { applyAging, applyFocus, AgeReport, FocusKey, retirementChance } from "./focus";
import {
  Tournament, TourneyRound, buildTournament, tournamentOutcome, roundCountFor,
  interactiveRounds, stagesClearedFrom, validateTournament,
} from "./tournament";
import {
  DevelopmentResult, rollDevelopment, applyDevelopment, applyWorkout, WorkoutResult,
  getDevelopmentOptions, DevelopmentOptionView, LockedDevelopment, DevChange,
  capAutomaticGrowth,
} from "./development";
import { DEVELOPMENT_MINIGAMES, MinigameKind as MGKind } from "./minigameLibrary";
import {
  ActiveThread, ThreadResolution, openThread, dueThread, resolveThread,
  dueEcho, markEchoed, applyThreadEffects,
} from "./threads";
import { EventContext, GameEvent, pickEvent, renderPrompt } from "./events";
import { DraftBoard, DraftSlot, buildDraftBoard, rookieSalary } from "./draft";

const FAN_LOVE_MILESTONE_TEXT = {
  14: (t: string) => `${t} fans are starting to learn the new name on the roster.`,
  32: (t: string) => `${t} fans are warming up to their guy.`,
  52: (t: string) => `Around the league, people are starting to know who plays for ${t}.`,
  72: (t: string) => `${t} fans are turning out because of nights like this one.`,
  88: (t: string) => `The league is talking about ${t}'s newest face.`,
} satisfies Record<(typeof FAN_LOVE_BAND_THRESHOLDS)[number], (t: string) => string>;

// ============================================================
// CAREER ORCHESTRATOR (v2 — age-based, team-centric)
//
// Season shape:
//   HUB -> BIG DECISION -> REGULAR SEASON (simulated, week by week)
//       -> PLAYOFFS (simulated) -> CHAMPIONSHIP CHALLENGE (played, only when
//          the run reaches a title event) -> RESULT -> next age
//
// Everything from v1 is reused: simulateSeasonStats, growth, playoffs,
// rivalry, awards, history flags, the narrative decision bank. What changed
// is the framing around them (age, named teams, roster, role, OVR) and that
// gameplay is now reserved for title events only.
// ============================================================

export const START_AGE = 18;
export const NCAA_SEASONS = 3;   // ages 18-20
export const NBA_SEASONS = 14;   // ages 21-34, with earlier retirement possible

export type TimelineEntry = {
  age: number;
  season: number;
  teamName: string;
  teamId?: string;
  teamAbbr?: string;
  awards?: string[];
  role: string;
  ovr: number;
  ppg: number;
  rpg: number;
  apg: number;
  record: string;
  outcome: string;
  highlight?: string;
};

/** A single mini-decision made THIS season, kept only long enough to appear
 * in that season's Season Complete recap — never a permanent history. */
export type SeasonDecisionEntry = { title: string; choice: string; result: string };

type PendingChallenge = {
  kind: "NBA_FINALS" | "NCAA_TITLE" | "OLYMPIC_FINAL";
  roundsToWin: number;
  teamQuality: number;
  decisiveRound: Round;
  isRivalryEncounter: boolean;
  opponent: string;
};

export type CareerState = {
  player: Person;
  rival: Rival;
  phase: CareerPhase;
  season: number;
  age: number;
  team: Team;
  roster: RosterSlot[];
  role: Role;
  jersey: number;
  contractYearsLeft: number;
  salary: number;
  ncaaSeasonsRemaining: number;
  nbaSeasonsPlayed: number;
  country: string;
  timeline: TimelineEntry[];
  log: CareerEvent[];
  seed: number;
  lastStats: SeasonStats | null;
  pendingChallenge: PendingChallenge | null;
  /** Focus chosen for the CURRENT season. */
  focus: FocusKey | null;
  /** The exact, already-rolled reward for the chosen focus — set at pick time, applied at season end without re-rolling. */
  lockedDevelopment: LockedDevelopment | null;
  /** Last 1-2 seasons' chosen development attribute, for pool-variety cooldown. */
  recentDevAttrs: FocusKey[];
  /** Last few minigames played, newest first — keeps selection from repeating. */
  recentMinigames: MinigameKind[];
  /** Attribute changes from the most recent offseason, for the report screen. */
  lastAgeReport: AgeReport;
  lastDevNote: string | null;
  /** Active playable tournament, if any. */
  tournament: Tournament | null;
  /** Draft board awaiting the player's choice. */
  draftBoard: DraftBoard | null;
  recentEventIds: string[];
  /** Every event id seen this career — powers one-time beats and follow-ups. */
  seenEventIds: string[];
  /** Categories already used this season, for within-season variety. */
  seasonEventCategories: string[];
  /** Mini-decisions made THIS season, with their result — collected for the
   * Season Complete recap, then cleared. Never a permanent history. */
  seasonDecisions: SeasonDecisionEntry[];
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
  /** Attribute deltas from minigame performance THIS season (interactive
   * tournament rounds + the finals-decider), accumulated across
   * resolveTournamentRound calls and finishSeason's own minigame roll —
   * cleared each season. */
  seasonMinigameDev: DevChange[];
  /** Snapshot of seasonMinigameDev at the moment the season ended, for
   * display even after seasonMinigameDev resets for the next season —
   * same relationship lastDevelopment has to the live development roll. */
  lastMinigameDev: DevChange[];
  /** Highest Fan Love ever recorded per team ID, across the whole career —
   * the "Fan Love Legacy" shown on the Summary screen (peak title reached
   * per team). Updated once per season in finishSeason from that season's
   * final Fan Love + current team, which can lag a same-season Olympics
   * bump or team-change reset by up to one season — an acceptable trade
   * for updating in exactly one place instead of every Fan Love call site. */
  fanLovePeaks: Record<string, number>;
};

/* ================= helpers ================= */

export function playerOvr(state: CareerState): number {
  return computeOverall(state.player.attributes, state.player.playstyle);
}

function rngFor(state: CareerState, salt = 0): RNG {
  return createRNG(state.seed + state.season * 7919 + salt * 104729);
}

function league(state: CareerState): "NCAA" | "NBA" {
  return state.phase === "NCAA" ? "NCAA" : "NBA";
}

/** Leaving a team costs a little of the legacy already built there — the
 * fanbase doesn't forget being left, even though the live Fan Love number
 * itself resets fresh at the new team (see initialFanLoveForTeamChange).
 * Floored at 0. A no-op if no peak was ever recorded for that team (nothing
 * to tarnish). */
function penalizeFanLovePeak(peaks: Record<string, number>, teamId: string, amount: number): Record<string, number> {
  const prior = peaks[teamId];
  if (prior === undefined) return peaks;
  return { ...peaks, [teamId]: Math.max(0, prior - amount) };
}

/** Records a new career-best Fan Love for a team, never lowering an
 * existing peak (Fan Love itself can dip; the legacy record never does). */
function recordFanLovePeak(peaks: Record<string, number>, teamId: string, fanLove: number): Record<string, number> {
  const prior = peaks[teamId] ?? 0;
  if (fanLove <= prior) return peaks;
  return { ...peaks, [teamId]: fanLove };
}

function refreshRoster(state: CareerState, rng: RNG): { roster: RosterSlot[]; role: Role } {
  const ovr = playerOvr(state);
  const roster = buildRoster(rng, state.team, state.player.position, ovr);
  const support = supportingCastOvr(roster);
  const role = determineRole(ovr, support);
  return { roster, role };
}

export function supportOf(state: CareerState): number {
  return supportingCastOvr(state.roster);
}

/* ================= init ================= */

export function initCareer(seed: number, input: {
  name: string; country: string; position: Position; height: number; playstyle: Playstyle;
  collegeTeamId?: string;
}): CareerState {
  const rng = createRNG(seed);
  const player = createPlayer(rng, input);
  const rival = createRival(rng, input.position);
  const team = input.collegeTeamId
    ? (NCAA_TEAMS.find((t) => t.id === input.collegeTeamId) ?? pick(rng, NCAA_TEAMS))
    : pick(rng, NCAA_TEAMS);
  const ovr = computeOverall(player.attributes, player.playstyle);
  const roster = buildRoster(rng, team, input.position, ovr);

  return {
    player, rival,
    phase: "NCAA",
    season: 1,
    age: START_AGE,
    team,
    roster,
    role: "PROSPECT",
    jersey: jerseyNumber(input.name, input.position),
    contractYearsLeft: 0,
    salary: 0,
    ncaaSeasonsRemaining: NCAA_SEASONS,
    nbaSeasonsPlayed: 0,
    country: input.country,
    timeline: [],
    lastStats: null,
    pendingChallenge: null,
    focus: null,
    lockedDevelopment: null,
    recentDevAttrs: [],
    recentMinigames: [],
    lastAgeReport: [],
    lastDevNote: null,
    lastDevelopment: null,
    seasonMinigameDev: [],
    lastMinigameDev: [],
    fanLovePeaks: {},
    tournament: null,
    draftBoard: null,
    recentEventIds: [],
    seenEventIds: [],
    seasonEventCategories: [],
    seasonDecisions: [],
    workout: "SKIPPED",
    threads: [],
    moments: [],
    log: [{
      id: "career_start", season: 0, type: "system",
      narrative: `${input.name} arrives at ${team.name} as a top recruit. Across the country another freshman is drawing the same headlines: ${rival.name}.`,
      flags: ["career_start"],
    }],
    seed,
  };
}

/* ================= 0. Season focus ================= */

/** Chosen at the START of every season — the primary development lever. */
export function chooseFocus(state: CareerState, focus: FocusKey): CareerState {
  // The focus no longer grants a flat bonus here. The reward shown on the
  // option card was already rolled and locked when the cards were built —
  // picking a card just commits to the number already on it, never a reroll.
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

/** The 3 development-option cards for the current season's focus screen. */
export function getSeasonDevelopmentOptions(state: CareerState): DevelopmentOptionView[] {
  return getDevelopmentOptions(
    rngFor(state, 8), state.player, state.recentDevAttrs, state.age,
    state.lastStats?.performanceScore ?? 0.7
  );
}

/* ================= 1. Big decision ================= */

/** Picks the mechanic for this season's development workout. */
export function workoutMinigame(state: CareerState): MGKind {
  const rng = rngFor(state, 61);
  return pick(rng, DEVELOPMENT_MINIGAMES);
}

/** Most seasons skip the offseason workout entirely — it's an occasional bonus opportunity, not a weekly chore. */
export function hasWorkoutOpportunity(state: CareerState): boolean {
  return rngFor(state, 62).next() < 0.28;
}

export function setWorkoutResult(state: CareerState, won: boolean): CareerState {
  return { ...state, workout: won ? "WON" : "LOST" };
}

export function getBigDecision(state: CareerState): BigDecision {
  const rng = rngFor(state, 1);
  const ovr = playerOvr(state);

  const offerSeason =
    state.phase === "NCAA"
      ? state.ncaaSeasonsRemaining < NCAA_SEASONS && rng.next() < 0.55
      : state.contractYearsLeft <= 0;

  if (offerSeason) {
    const d = generateTeamOffers(
      rng, state.player, ovr, state.team, league(state),
      state.age, state.lastStats?.performanceScore ?? 0.75, state.salary, state.nbaSeasonsPlayed
    );
    if (d.kind === "TEAM_OFFER" && d.options.length > 1) return { ...d, season: state.season };
  }
  return generateCareerCall(rng, state.season);
}

export function applyBigDecision(state: CareerState, optionId: string, decision: BigDecision): CareerState {
  const rng = rngFor(state, 2);
  let player = state.player;
  let team = state.team;
  let contractYearsLeft = state.contractYearsLeft;
  let salary = state.salary;
  let fanLovePeaks = state.fanLovePeaks;
  const events: CareerEvent[] = [];

  if (decision.kind === "TEAM_OFFER") {
    const opt = decision.options.find((o) => o.id === optionId) as TeamOption;
    const moved = opt.team.id !== state.team.id;
    // The team you're leaving loses a bit of the legacy you built there —
    // its recorded Fan Love peak (the "Fan Love Legacy" summary at the end
    // of the career) takes an -8 hit. Never touches the team you're joining.
    if (moved) fanLovePeaks = penalizeFanLovePeak(fanLovePeaks, state.team.id, 8);
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
          : applyFanLoveGain(player.hidden.fanLove, STAY_FAN_LOVE_BUMP),
      },
    };
    if (opt.years) { contractYearsLeft = opt.years; salary = opt.salary ?? salary; }
    events.push(makeMilestone({
      season: state.season,
      type: "career_move",
      narrative: moved
        ? `You sign with ${team.name}${opt.salary ? ` — ${opt.years} years, $${opt.salary}M per year` : ""}.`
        : `You stay with ${team.name}${opt.salary ? ` — ${opt.years} years, $${opt.salary}M per year` : ""}.`,
      flags: [moved ? "changed_teams" : "stayed_loyal"],
    }));
  } else {
    const opt = decision.options.find((o) => o.id === optionId) as CallOption;
    player = applyDecisionEffects(player, { id: opt.id, label: opt.label, effects: opt.effects, tags: [] });
    events.push({
      id: `bigcall_${state.season}`, season: state.season, type: "decision",
      narrative: opt.label, flags: ["big_decision"],
    });
  }

  const next = { ...state, player, team, contractYearsLeft, salary, fanLovePeaks, log: [...state.log, ...events] };
  const { roster, role } = refreshRoster(next, rng);
  return { ...next, roster, role };
}

/* ================= 2. Regular season + playoffs (simulated) ================= */

export type SeasonRun = {
  state: CareerState;
  weeks: WeekResult[];
  stats: SeasonStats;
  seedPlace: number;
  bracket: BracketStep[];
  playoffResult: PlayoffResult;
  events: CareerEvent[];
  /** Non-null => the player must play through the bracket. */
  tournament: Tournament | null;
};

/** How much the moment matters — drives which mechanics can appear. */
function importanceFor(kind: PendingChallenge["kind"], teamQuality: number): EventImportance {
  if (kind === "OLYMPIC_FINAL") return "OLYMPIC";
  // A title decided on the finest margins reads as a Game 7.
  return teamQuality < 0.55 ? "GAME_7" : "FINALS";
}

export function runSeason(state: CareerState): SeasonRun {
  const rng = rngFor(state, 3);
  const lg = league(state);
  const ovr = playerOvr(state);
  const support = supportingCastOvr(state.roster);
  const roleFactor = roleMinutesFactor(state.role);

  const teamStrength = clamp(
    teamOvrToStrength(support) * 0.72 + teamOvrToStrength(ovr) * 0.28,
    0.08, 0.96
  );

  const raw = simulateSeasonStats({ person: state.player, season: state.season, phase: lg, teamStrength, rng });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const stats: SeasonStats = {
    ...raw,
    ppg: r1(raw.ppg * roleFactor),
    apg: r1(raw.apg * roleFactor),
    rpg: r1(raw.rpg * roleFactor),
    age: state.age,
    teamName: state.team.name,
    role: state.role,
    ovr,
  };

  const weeks = buildSchedule(rng, stats.teamWins, stats.teamLosses, lg);
  const teamQuality = computeTeamQuality(teamStrength, raw.performanceScore);
  const seedPlace = conferenceSeed(rng, teamQuality);

  let player = { ...state.player, seasonStats: [...state.player.seasonStats, stats] };
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

  // ---- TOURNAMENT: the simulation builds the bracket, the PLAYER decides
  // every elimination. Nothing here resolves a round on its own. ----
  const tournament = buildTournament(
    rng,
    lg === "NCAA" ? "NCAA" : "NBA_PLAYOFFS",
    teamQuality,
    state.team,
    state.country,
    { name: rival.team, id: rival.teamId }
  );

  // Every generated bracket is validated. A malformed bracket is a bug we want
  // to hear about immediately rather than discover mid-career.
  if (tournament) {
    const problems = validateTournament(
      tournament,
      state.team.id,
      new Set([...NBA_TEAMS, ...NCAA_TEAMS].map((t) => t.id))
    );
    if (problems.length > 0 && typeof console !== "undefined") {
      console.warn("[bracket] invalid tournament", problems);
    }
  }

  let playoffResult: PlayoffResult = tournament ? "PENDING" : "MISSED_PLAYOFFS";

  const bracket: BracketStep[] = [];

  const ctx = generateRivalContextEvent(rng, rival, player, state.season, lg, false);
  if (ctx) { rival = applyRivalTeamChange(rival, ctx); events.push(ctx); }

  const statsFinal: SeasonStats = { ...stats, playoffResult, seed: seedPlace };
  player = { ...player, seasonStats: [...player.seasonStats.slice(0, -1), statsFinal] };

  return {
    state: { ...state, player, rival, lastStats: statsFinal, tournament, pendingChallenge: null },
    weeks, stats: statsFinal, seedPlace, bracket, playoffResult, events,
    tournament,
  };
}


/* ================= 2b. Playing the tournament ================= */

export type RoundChallenge = {
  round: TourneyRound;
  config: ChallengeConfig;
  gauntlet: Gauntlet;
  roundNumber: number;
  totalRounds: number;
  /** Bracket stage names, one per level, so the UI can label each level. */
  levelLabels: string[];
  /** Per-level matchup context: who you face and what's at stake. */
  levels: {
    label: string;
    opponent: string;
    opponentId: string | null;
    nextLabel: string | null;
    isFinal: boolean;
  }[];
  playerTeamName: string;
  playerTeamId: string | null;
};

/**
 * Builds ONE continuous challenge for the whole tournament. Its levels are the
 * interactive bracket stages, so a March Madness run is a single escalating
 * session rather than three separate minigames stitched together.
 */
/**
 * Fires any consequence waiting on a tournament — the knee you played through
 * resurfacing in the Elite Eight, the rehab paying off in March. Returns the
 * narrative to show before the run begins.
 */
export function tournamentThreadCheck(state: CareerState): { state: CareerState; resolution: ThreadResolution | null } {
  const t = state.tournament;
  if (!t) return { state, resolution: null };
  const rng = rngFor(state, 70);
  const due = dueThread(state.threads, {
    season: state.season, age: state.age, atTournament: true, atRivalMoment: false,
  });
  if (!due) return { state, resolution: null };

  const { threads: update, resolution } = resolveThread(rng, due);
  const player = applyThreadEffects(state.player, resolution.effects);
  const event: CareerEvent = {
    id: `thread_${resolution.threadId}_${state.season}`,
    season: state.season,
    type: "consequence",
    narrative: resolution.text,
    flags: ["consequence", resolution.good ? "consequence_good" : "consequence_bad"],
  };
  return {
    state: {
      ...state, player, threads: update(state.threads),
      log: [...state.log, event],
      moments: [...state.moments, event],
    },
    resolution,
  };
}

export function currentRoundChallenge(state: CareerState): RoundChallenge | null {
  const t = state.tournament;
  if (!t || t.cleared >= t.rounds.length) return null;

  const stages = interactiveRounds(t);
  if (stages.length === 0) return null;

  const rng = rngFor(state, 30);
  const ovr = playerOvr(state);
  const support = t.kind === "OLYMPICS"
    ? clamp(nationalTeam(state.country).ovr - 2, 55, 97)
    : supportingCastOvr(state.roster);

  const carry = clamp((ovr - support + 18) / 36, 0, 1);
  const finalStage = stages[stages.length - 1];
  const teamLabel = t.kind === "OLYMPICS" ? state.country : state.team.name;

  const config = buildChallenge({
    rng,
    eventTitle: t.title,
    playerTeam: teamLabel,
    opponent: finalStage.opponent,
    playerOvr: ovr,
    supportingOvr: support,
    attributes: state.player.attributes,
    role: state.role,
    seasonPerformance: state.lastStats?.performanceScore ?? 0.75,
    seriesLine: t.seedLine ? `${t.seedLine} · survive the run` : "Survive the run",
    flavor: "Every level is another round of the bracket. Lose one and the season is over.",
  });

  // EXACTLY one level per tournament stage. The levels ARE the bracket —
  // no padding, no extra rounds. Carrying a weak roster makes each level
  // harder (via the challenge difficulty), never longer.
  const roundCount = stages.length;

  const gauntlet = buildGauntlet({
    rng,
    importance: finalStage.importance,
    attributes: state.player.attributes,
    roundCount,
    roundsToWin: roundCount, // survive the whole run to win the tournament
    recent: state.recentMinigames,
    varied: false, // ONE mechanic for the whole session
  });

  // Level i is literally stage i of the bracket.
  const levelLabels = stages.map((st) => st.label);

  const levels = stages.map((st, i) => ({
    label: st.label,
    opponent: st.opponent,
    opponentId: st.opponentId,
    nextLabel: i + 1 < stages.length ? stages[i + 1].label : null,
    isFinal: i === stages.length - 1,
  }));

  return {
    round: finalStage,
    config,
    gauntlet,
    roundNumber: 1,
    totalRounds: 1,
    levelLabels,
    levels,
    playerTeamName: teamLabel,
    playerTeamId: t.kind === "OLYMPICS" ? null : state.team.id,
  };
}

export type RoundResolution = {
  state: CareerState;
  advanced: boolean;
  tournamentOver: boolean;
  wonTournament: boolean;
  events: CareerEvent[];
};

/** Applies a minigame development bonus to the player's attributes,
 * ceiling-clamped at 99, and returns the delta that actually landed — which
 * can be smaller than dev.amount near the ceiling. The RECORDED delta must
 * always match what really happened to the attribute, never the raw
 * requested amount, so seasonMinigameDev stays honest at the top of the
 * curve the same way finish() and applyWorkout already are. */
function applyMinigameDev(
  player: Person,
  dev: { attribute: keyof Attributes; amount: number }
): { player: Person; delta: DevChange } {
  const before = player.attributes[dev.attribute];
  const attributes = { ...player.attributes };
  attributes[dev.attribute] = clamp(before + dev.amount, 30, 99);
  const applied = attributes[dev.attribute] - before;
  return { player: { ...player, attributes }, delta: { attribute: dev.attribute, delta: applied } };
}

/** Applies the single tournament challenge: levels survived = stages cleared. */
export function resolveTournamentRound(
  state: CareerState,
  challenge: RoundChallenge,
  outcome: GauntletOutcome
): RoundResolution {
  const t = state.tournament!;
  const stages = interactiveRounds(t);
  const levelsCleared = Math.min(outcome.roundsSurvived, stages.length);
  const cleared = stagesClearedFrom(t, levelsCleared);
  const wonTournament = cleared >= t.rounds.length;
  const events: CareerEvent[] = [];

  let player = state.player;
  const dev = developmentFromRun(outcome);
  let seasonMinigameDev = state.seasonMinigameDev;
  if (dev) {
    const applied = applyMinigameDev(player, dev);
    player = applied.player;
    if (applied.delta.delta !== 0) seasonMinigameDev = [...seasonMinigameDev, applied.delta];
  }

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

  const exitStage = t.rounds[Math.min(cleared, t.rounds.length - 1)];
  const isRival = exitStage?.opponent === state.rival.team;

  events.push(makeMilestone({
    season: state.season,
    type: wonTournament ? "signature_moment" : "playoff",
    narrative: wonTournament
      ? `${t.title}: you win it all.`
      : `${t.title}: your run ends in the ${exitStage?.label ?? "bracket"}.`,
    flags: [
      wonTournament ? "tournament_won" : "tournament_exit",
      ...(isRival ? [wonTournament ? MILESTONE_FLAGS.BEAT_RIVAL_PLAYOFFS : MILESTONE_FLAGS.LOST_TO_RIVAL_PLAYOFFS] : []),
    ],
    rivalInvolved: isRival,
  }));

  return {
    state: {
      ...state,
      player,
      tournament: { ...t, current: cleared, cleared },
      recentMinigames: [challenge.gauntlet.headlineKind, ...state.recentMinigames].slice(0, 5),
      log: [...state.log, ...events],
      moments: [...state.moments, ...events.filter((e) => e.type === "signature_moment")],
      seasonMinigameDev,
    },
    advanced: wonTournament,
    tournamentOver: true, // the whole bracket resolves in one session now
    wonTournament,
    events,
  };
}

/* ================= 3. Season end ================= */

export type SeasonEnd = {
  state: CareerState;
  events: CareerEvent[];
  wonTitle: boolean;
  careerOver: boolean;
  olympicsNext: boolean;
  development: DevelopmentResult | null;
  conclusion: SeasonConclusion | null;
  /** The exact attribute + delta the player picked in "Choose Your Focus"
   * this season, captured from state.lockedDevelopment BEFORE advance()
   * clears it — the only reliable way to know which row of the season's
   * development actually came from the player's own pick, as opposed to
   * aging, minigames, or the workout bonus (which can never land on this
   * same attribute — see applyWorkout). Null on the rare season where
   * nothing was locked. */
  primaryDevelopment: { attribute: keyof Attributes; delta: number } | null;
  /** Real calendar year this season took place, reusing the exact formula
   * already used for the draft class (2026 + season) in advance() — for
   * grand celebration screens only; every other screen keeps "Season N". */
  year: number;
};

export type SeasonConclusion = {
  headline: string;
  lines: string[];
  stats: SeasonStats;
  awards: string[];
  draftStock: "RISING" | "STEADY" | "FALLING" | null;
  decisions: SeasonDecisionEntry[];
};

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

  let stats = player.seasonStats[player.seasonStats.length - 1];
  const t = state.tournament;

  if (t) {
    // The bracket the player actually played decides the season outcome.
    const clearedAll = t.cleared >= t.rounds.length;
    wonTitle = clearedAll;
    const result: PlayoffResult =
      clearedAll ? "CHAMPION"
      : t.cleared >= t.rounds.length - 1 ? "FINALS_LOSS"
      : t.cleared >= t.rounds.length - 2 ? "CONF_FINALS"
      : t.cleared >= 1 ? "CONF_SEMIS" : "FIRST_ROUND";
    stats = { ...stats, playoffResult: result };
    player = { ...player, seasonStats: [...player.seasonStats.slice(0, -1), stats] };

    if (clearedAll) {
      events.push(makeMilestone({
        season: state.season, type: "signature_moment",
        narrative: lg === "NBA"
          ? `NBA CHAMPION. ${state.team.name} are on top.`
          : `NATIONAL CHAMPION. ${state.team.name} cut down the nets.`,
        flags: [MILESTONE_FLAGS.CHAMPIONSHIP], playoffResult: result,
      }));
    }
  }

  const pending = state.pendingChallenge;
  if (pending && outcome) {
    // Survival decides it: you must last long enough, and being eliminated
    // early is what costs the title. The minigame IS the result, not a
    // decoration played after the outcome was already picked.
    wonTitle = outcome.roundsSurvived >= pending.roundsToWin;

    const magnitude = wonTitle ? 26 : -22;
    const hidden: Hidden = {
      ...player.hidden,
      confidence: clamp(player.hidden.confidence + magnitude, 0, 100),
      reputation: clamp(player.hidden.reputation + magnitude * 0.8, 0, 100),
    };
    player = { ...player, hidden };

    const result: PlayoffResult = wonTitle ? "CHAMPION" : "FINALS_LOSS";
    stats = { ...stats, playoffResult: result };
    player = { ...player, seasonStats: [...player.seasonStats.slice(0, -1), stats] };

    const titleName = pending.kind === "NBA_FINALS" ? "NBA CHAMPION" : "NATIONAL CHAMPION";
    events.push(makeMilestone({
      season: state.season, type: "signature_moment",
      narrative: wonTitle ? `${titleName}. ${state.team.name} are on top.` : `Runner-up. ${pending.opponent} take it.`,
      flags: wonTitle ? [MILESTONE_FLAGS.CHAMPIONSHIP, MILESTONE_FLAGS.GAME_7_WINNER] : ["finals_loss"],
      playoffResult: result,
    }));

    if (pending.isRivalryEncounter) {
      events.push(makeMilestone({
        season: state.season, type: "rivalry_encounter",
        narrative: wonTitle ? `You beat ${rival.name} with the title on the line.` : `${rival.name} took the title from you.`,
        flags: [wonTitle ? MILESTONE_FLAGS.BEAT_RIVAL_PLAYOFFS : MILESTONE_FLAGS.LOST_TO_RIVAL_PLAYOFFS],
        rivalInvolved: true,
      }));
      const rs = rival.seasonStats[rival.seasonStats.length - 1];
      rival = {
        ...rival,
        seasonStats: [...rival.seasonStats.slice(0, -1), { ...rs, playoffResult: wonTitle ? "FINALS_LOSS" : "CHAMPION" }],
      };
      if (!wonTitle) rival = { ...rival, awards: [...rival.awards, { type: "CHAMPION", season: state.season }] };
    }
  }

  // Fan Love's playoff-depth bump: permanent, tiered, and driven by THIS
  // season's actual result against career history — never a recomputed
  // target. A new career-best depth pays big; matching or falling short of
  // a depth already reached pays small (never negative unless the playoffs
  // were missed entirely, which always costs a fixed, small -4). This is
  // what keeps a title from two seasons ago from being erodable by an
  // average season now.
  const priorPlayoffResults = player.seasonStats
    .slice(0, -1)
    .filter((s) => s.phase === stats.phase)
    .map((s) => s.playoffResult);
  // A small-market team (e.g. the Kings) buys more Fan Love for the same
  // playoff run than a historic big market (e.g. the Celtics) — fans there
  // already expect success, so matching it is less special. Only scales
  // UP a positive bump; the -4 missed-playoffs penalty is untouched.
  const playoffBump = applyMarketFanLoveMultiplier(
    playoffOutcomeFanLoveBump(stats.playoffResult, priorPlayoffResults),
    state.team.market
  );
  // A small, permanent nudge for another season of staying put — the
  // "connection to the city" / LOYALTY + LONGEVITY layer. Never subtracted
  // for changing teams (the Big Decision's loyalty effect already handles
  // that, modestly). Grows in modest steps with real tenure, rather than a
  // flat +1 regardless of whether this is year 2 or year 10.
  const seasonsOnTeam = seasonsOnCurrentTeam(state.timeline.map((e) => e.teamId), state.team.id);
  const tenureTick = seasonsOnTeam >= 8 ? 3 : seasonsOnTeam >= 5 ? 2 : seasonsOnTeam > 1 ? 1 : 0;
  player = {
    ...player,
    hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, playoffBump + tenureTick) },
  };

  // Minigames are a SECONDARY development source, capped so they can't
  // outrun the deliberate season focus. Accumulates on top of whatever
  // resolveTournamentRound already tracked earlier this same season.
  let seasonMinigameDev = state.seasonMinigameDev;
  if (outcome) {
    const dev = developmentFromRun(outcome);
    if (dev) {
      const applied = applyMinigameDev(player, dev);
      player = applied.player;
      if (applied.delta.delta !== 0) seasonMinigameDev = [...seasonMinigameDev, applied.delta];
      events.push({
        id: `mgdev_${state.season}`, season: state.season, type: "development",
        narrative: `That run sharpened your game (+${dev.amount} ${String(dev.attribute)}).`,
        flags: ["minigame_development"],
      });
    }
  }

  const isRookie = lg === "NBA" && state.nbaSeasonsPlayed === 0;
  const awards = rollSeasonAwards(rng, stats, isRookie);
  const hadMvp = player.awards.some((a) => a.type === "MVP");
  const hadAllStar = player.awards.some((a) => a.type === "ALL_STAR");
  const hadAllNba = player.awards.some((a) => a.type === "ALL_NBA");
  player = { ...player, awards: [...player.awards, ...awards] };
  for (const a of awards) {
    // Big-moment spikes: large, fixed, and immediate — a first MVP or a first
    // All-Star nod should visibly move Fan Love THIS season, on top of the
    // playoff-depth bump already applied above.
    if (a.type === "MVP") {
      const bump = hadMvp ? 8 : 16;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    } else if (a.type === "ALL_STAR") {
      const bump = hadAllStar ? 4 : 8;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    } else if (a.type === "ALL_NBA") {
      const bump = hadAllNba ? 3 : 6;
      player = { ...player, hidden: { ...player.hidden, fanLove: applyFanLoveGain(player.hidden.fanLove, bump) } };
    }
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
  let threads = state.threads;
  const due = dueThread(threads, {
    season: state.season, age: state.age, atTournament: false, atRivalMoment: false,
  });
  if (due) {
    const r = resolveThread(rng, due);
    threads = r.threads(threads);
    player = applyThreadEffects(player, r.resolution.effects);
    events.push({
      id: `thread_${r.resolution.threadId}_${state.season}`,
      season: state.season, type: "consequence",
      narrative: r.resolution.text,
      flags: ["consequence", r.resolution.good ? "consequence_good" : "consequence_bad"],
    });
  }
  // A long-delayed callback to something from years ago.
  const echo = dueEcho(threads, state.season);
  if (echo) {
    threads = markEchoed(threads, echo.thread.id);
    events.push({
      id: `echo_${echo.thread.id}_${state.season}`,
      season: state.season, type: "callback",
      narrative: echo.text,
      flags: ["callback", "memory"],
    });
  }

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

  // ---- Seasonal development: tiered, randomized, focus-and-playstyle driven ----
  const baseDevelopment = rollDevelopment({
    rng,
    person: player,
    focus: state.focus,
    age: state.age,
    performance: stats.performanceScore,
    locked: state.lockedDevelopment ?? undefined,
  });
  // A won workout rewards a different active attribute than the season's
  // primary. A lost one changes nothing — it can never subtract or trigger
  // a regression. `player` here is still pre-applyDevelopment (that happens
  // 2 lines below) — safe because applyWorkout's target attribute is always
  // chosen from the set NOT already in baseDevelopment.changes, so its
  // current value is identical whether read before or after applyDevelopment
  // runs.
  const workoutApplied = applyWorkout(rng, baseDevelopment, state.workout, state.focus, player);
  const development = workoutApplied.result;
  player = applyDevelopment(player, development);
  player = { ...player, hidden: applyOffseasonDecay(player.hidden) };

  const shownResult: PlayoffResult = stats.playoffResult === "PENDING" ? "MISSED_PLAYOFFS" : stats.playoffResult;
  const outcomeRaw = t
    ? tournamentOutcome(t, t.cleared >= t.rounds.length)
    : shownResult === "CHAMPION"
      ? (lg === "NBA" ? "NBA Champion" : "National Champion")
      : formatPlayoffResult(shownResult, lg);

  const entry: TimelineEntry = {
    age: state.age,
    season: state.season,
    teamName: state.team.name,
    teamId: state.team.id,
    teamAbbr: state.team.abbr,
    awards: awards.map((a) => a.type.replace(/_/g, " ")),
    role: state.role,
    ovr: stats.ovr ?? playerOvr(state),
    ppg: stats.ppg, rpg: stats.rpg, apg: stats.apg,
    record: `${stats.teamWins}-${stats.teamLosses}`,
    outcome: outcomeRaw.charAt(0).toUpperCase() + outcomeRaw.slice(1),
    highlight: awards.find((a) => a.type === "MVP") ? "MVP" : shownResult === "CHAMPION" ? "Championship" : undefined,
  };

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
    lastMinigameDev: seasonMinigameDev,
    seasonMinigameDev: [],
  };

  const conclusion = buildConclusion(
    state, stats, development, awards.map((a) => a.type.replace(/_/g, " ")), t, lg,
    events.filter((e) => e.type === "consequence" || e.type === "callback").map((e) => e.narrative),
    state.seasonDecisions
  );
  const out = advance(next, events, wonTitle);
  // Captured from the INCOMING state (never reassigned in this function),
  // before advance() clears lockedDevelopment on the returned state.
  const primaryDevelopment = state.lockedDevelopment
    ? { attribute: state.lockedDevelopment.attribute, delta: state.lockedDevelopment.delta }
    : null;
  // Automatic growth (everything except the player's own locked pick) is
  // capped for real here, after advance() has already applied aging to
  // out.state.player — both the attribute values and the source lists that
  // feed totalSeasonDelta's display are trimmed together.
  const capped = capAutomaticGrowth(
    out.state.player,
    primaryDevelopment?.attribute ?? null,
    development.changes,
    out.state.lastAgeReport,
    out.state.lastMinigameDev
  );
  // Same object instance in both places (state.lastDevelopment and the
  // returned `development`) — screens reached after Season Complete compare
  // them by reference (see the "lastDevelopment persists" test), so this
  // must not become two separate spread copies of the same content.
  const cappedDevelopment: DevelopmentResult = { ...development, changes: capped.devChanges };
  const cappedState: CareerState = {
    ...out.state,
    player: capped.player,
    lastAgeReport: capped.ageReport,
    lastMinigameDev: capped.minigameDev,
    lastDevelopment: cappedDevelopment,
    fanLovePeaks: recordFanLovePeak(out.state.fanLovePeaks, state.team.id, capped.player.hidden.fanLove),
  };
  return {
    ...out,
    state: cappedState,
    development: cappedDevelopment,
    conclusion,
    primaryDevelopment,
    year: 2026 + state.season,
  };
}

/* ---- Narrative season conclusion: reflects what ACTUALLY happened ---- */
function buildConclusion(
  state: CareerState,
  stats: SeasonStats,
  dev: DevelopmentResult,
  awards: string[],
  t: Tournament | null,
  lg: "NCAA" | "NBA",
  consequenceLines: string[] = [],
  decisions: SeasonDecisionEntry[] = []
): SeasonConclusion {
  const lines: string[] = [];
  const prev = state.player.seasonStats[state.player.seasonStats.length - 2];
  const ppgJump = prev ? stats.ppg - prev.ppg : 0;

  // Headline is driven by the single most important thing that happened.
  let headline: string;
  const wonAll = t && t.cleared >= t.rounds.length;
  if (wonAll) headline = "You finished the job.";
  else if (dev.tier === "LEGENDARY" || dev.tier === "RARE_BREAKOUT") headline = "This was the season everything changed.";
  else if (t && t.cleared === t.rounds.length - 1) headline = "You came one game short.";
  else if (dev.tier === "REGRESSION") headline = "Your body started asking questions.";
  else if (stats.performanceScore < 0.55) headline = "You struggled to find consistency this year.";
  else if (ppgJump >= 5) headline = "Scouts are starting to see a different player.";
  else if (t) headline = `Your run ended in the ${t.rounds[Math.min(t.cleared, t.rounds.length - 1)].label}.`;
  else headline = "A season without a postseason.";

  if (state.role === "FRANCHISE" || state.role === "STAR") {
    lines.push(`You were ${state.team.name}'s ${state.role === "FRANCHISE" ? "franchise player" : "leading option"}.`);
  }
  if (ppgJump >= 4) lines.push("Your scoring took a major leap.");
  else if (ppgJump <= -4) lines.push("Your scoring dropped from last season.");
  if (dev.tier === "BREAKOUT" || dev.tier === "RARE_BREAKOUT" || dev.tier === "LEGENDARY") {
    lines.push("Something in your game clicked that hadn't before.");
  }
  if (awards.length > 0) lines.push(`You were recognised: ${awards.join(", ").toLowerCase()}.`);
  if (state.player.hidden.injuryRisk > 55) lines.push("Your season was interrupted before you could reach your ceiling.");
  // Consequences that landed this year are part of the story of the season.
  for (const c of consequenceLines.slice(0, 2)) lines.push(c);
  // The rival is a parallel career, so where he finished matters to yours.
  const rivalState = state.rival.narrativeState;
  if (rivalState === "RIVAL_AHEAD" || rivalState === "RIVAL_DOMINANT") {
    lines.push(`${state.rival.name} finished ahead of you again.`);
  } else if (rivalState === "PEER") {
    lines.push(`The gap between you and ${state.rival.name} is disappearing.`);
  } else if (rivalState === "PLAYER_DOMINANT") {
    lines.push(`${state.rival.name} isn't in the conversation with you anymore.`);
  }

  const draftStock: SeasonConclusion["draftStock"] =
    lg !== "NCAA" ? null
    : stats.performanceScore > 0.78 || (t && t.cleared >= t.rounds.length - 1) ? "RISING"
    : stats.performanceScore < 0.55 ? "FALLING" : "STEADY";

  return { headline, lines, stats, awards, draftStock, decisions };
}

/* ================= 4. Calendar ================= */

function advance(state: CareerState, events: CareerEvent[], wonTitle: boolean): SeasonEnd {
  const rng = rngFor(state, 5);
  // Offseason aging: physical attributes peak and decline earliest and
  // steepest; mental/skill ones age better but still turn to decline by the
  // early-to-mid 30s. This is what forces a style change instead of just decay.
  const aged = applyAging(rng, state.player, state.age);
  state = { ...state, player: aged.person, lastAgeReport: aged.report, focus: null };
  let { phase, ncaaSeasonsRemaining, nbaSeasonsPlayed, contractYearsLeft, team, salary } = state;
  let draftBoard: DraftBoard | null = null;
  const extra: CareerEvent[] = [];
  const age = state.age + 1;
  const season = state.season + 1;

  if (phase === "NCAA") {
    ncaaSeasonsRemaining -= 1;
    if (ncaaSeasonsRemaining <= 0) {
      // The board is generated here; the PLAYER picks the destination on the
      // draft screen (or takes a random one). Nothing is predetermined.
      draftBoard = buildDraftBoard(rng, playerOvr(state), 2026 + state.season);
      phase = "DRAFT";
    }
  } else if (phase === "NBA") {
    nbaSeasonsPlayed += 1;
    contractYearsLeft = Math.max(0, contractYearsLeft - 1);
    const ovrNow = playerOvr(state);
    const forced = rng.next() < retirementChance(age, ovrNow);
    phase = nbaSeasonsPlayed >= NBA_SEASONS || forced ? "RETIRED" : "NBA";
  }

  const olympicsNext =
    phase === "NBA" && nbaSeasonsPlayed > 0 && nbaSeasonsPlayed % 4 === 0 && playerOvr(state) >= 74;

  let next: CareerState = {
    ...state, phase, age, season, ncaaSeasonsRemaining, nbaSeasonsPlayed,
    contractYearsLeft, team, salary, draftBoard, log: [...state.log, ...extra],
  };

  if (phase !== "RETIRED" && phase !== "DRAFT") {
    const { roster, role } = refreshRoster(next, rng);
    next = { ...next, roster, role };
  }

  return {
    state: next, events: [...events, ...extra], wonTitle,
    careerOver: phase === "RETIRED", olympicsNext,
    development: null, conclusion: null, // filled in by finishSeason
    primaryDevelopment: null, year: 0, // filled in by finishSeason (lockedDevelopment is already cleared on `next` by this point)
  };
}


/* ================= 4b. Draft ================= */

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

/* ================= 4c. Season events ================= */

export function buildEventContext(state: CareerState): EventContext {
  const last = state.lastStats;
  return {
    seen: state.seenEventIds,
    age: state.age,
    phase: state.phase === "NCAA" ? "NCAA" : "NBA",
    ovr: playerOvr(state),
    role: state.role,
    seasonNumber: state.season,
    nbaSeasons: state.nbaSeasonsPlayed,
    contractYearsLeft: state.contractYearsLeft,
    hasMvp: state.player.awards.some((a) => a.type === "MVP"),
    hasTitle: state.player.awards.some((a) => a.type === "CHAMPION"),
    allStars: state.player.awards.filter((a) => a.type === "ALL_STAR").length,
    lastPpg: last?.ppg ?? 0,
    confidence: state.player.hidden.confidence,
    reputation: state.player.hidden.reputation,
    rivalAhead: state.rival.narrativeState === "RIVAL_AHEAD" || state.rival.narrativeState === "RIVAL_DOMINANT",
    rivalName: state.rival.name,
    teamName: state.team.name,
    madePlayoffsLast: (last?.playoffResult ?? "MISSED_PLAYOFFS") !== "MISSED_PLAYOFFS",
  };
}

export type SeasonEventView = { event: GameEvent; prompt: string };

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

export function applySeasonEvent(state: CareerState, ev: GameEvent, optionId: string): CareerState {
  const opt = ev.options.find((o) => o.id === optionId) ?? ev.options[0];
  const player = applyDecisionEffects(state.player, { id: opt.id, label: opt.label, effects: opt.effects, tags: [] });
  // A meaningful choice opens a thread that pays off seasons from now.
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

/* ================= 5. Olympics ================= */

export function startOlympics(state: CareerState): CareerState {
  const rng = rngFor(state, 6);
  const nat = nationalTeam(state.country);
  const ovr = playerOvr(state);
  const quality = clamp(teamOvrToStrength(nat.ovr) * 0.7 + teamOvrToStrength(ovr) * 0.3, 0.1, 0.96);
  const tournament = buildTournament(rng, "OLYMPICS", quality, null, state.country, { name: state.rival.team, id: state.rival.teamId });
  return { ...state, phase: "OLYMPICS", tournament };
}

export function finishOlympics(state: CareerState): { state: CareerState; events: CareerEvent[]; year: number } {
  const t = state.tournament;
  const cleared = t ? t.cleared : 0;
  const totalRounds = t ? t.rounds.length : 4;
  const won = cleared >= totalRounds;
  const medal = won ? "Olympic Gold" : cleared === totalRounds - 1 ? "Olympic Silver" : cleared === totalRounds - 2 ? "Olympic Semifinalist" : "Olympics — group stage";
  const events: CareerEvent[] = [
    makeMilestone({
      season: state.season, type: "signature_moment",
      narrative: won
        ? `OLYMPIC GOLD — You win it for ${state.country}.`
        : `${medal}. ${state.country}'s run ends.`,
      flags: won ? ["olympic_gold", MILESTONE_FLAGS.CHAMPIONSHIP] : ["olympic_medal"],
    }),
  ];
  const entry: TimelineEntry = {
    age: state.age - 1,
    season: state.season - 1,
    teamName: state.country,
    teamAbbr: state.country.slice(0, 3).toUpperCase(),
    role: "National Team",
    ovr: playerOvr(state),
    ppg: 0, rpg: 0, apg: 0, record: "—",
    outcome: medal,
    highlight: won ? "Olympic Gold" : undefined,
  };
  const next: CareerState = {
    ...state,
    phase: "NBA",
    pendingChallenge: null,
    tournament: null,
    timeline: [...state.timeline, entry],
    log: [...state.log, ...events],
    moments: [...state.moments, ...events],
    player: {
      ...state.player,
      hidden: {
        ...state.player.hidden,
        reputation: clamp(state.player.hidden.reputation + (won ? 14 : 5), 0, 100),
        fanLove: applyFanLoveGain(state.player.hidden.fanLove, won ? 16 : 5),
      },
    },
  };
  // state.season is already incremented for the NEXT NBA season by the time
  // Olympics runs (it happens in the offseason gap after advance() already
  // ran for the season that triggered it) — state.season - 1 is the actual
  // Olympics year, the same value this function already uses for the
  // TimelineEntry's own `season` field a few lines above.
  return { state: next, events, year: 2026 + (state.season - 1) };
}

/* ================= 6. Summary ================= */

export type CareerTotals = {
  seasons: number; games: number; gamesStarted: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  fgPct: number; tpPct: number; ftPct: number;
  totalPoints: number; totalRebounds: number; totalAssists: number;
  totalSteals: number; totalBlocks: number;
  championships: number; finalsMvps: number; mvps: number; allStars: number;
  allNba: number; dpoy: number; roty: number;
  ncaaTitles: number; olympicGolds: number; olympicMedals: number;
  peakOvr: number; peakPpg: number; peakRpg: number; peakApg: number;
};

/** One team's peak Fan Love title — the "Fan Love Legacy" shown on the
 * Summary screen, one entry per team the player ever suited up for. */
export type FanLoveLegacyEntry = { teamId: string; teamName: string; peak: number; tier: FanLoveTier };

export type CareerSummary = {
  player: CareerTotals;
  rival: CareerTotals;
  verdict: "PLAYER_WON" | "RIVAL_WON" | "TOO_CLOSE_TO_CALL";
  verdictLine: string;
  definingMoments: CareerEvent[];
  olympicGolds: number;
  peakOvr: number;
  /** Highest title reached on every team played for, best first. */
  fanLoveLegacy: FanLoveLegacyEntry[];
};

function totals(person: Person, timeline: TimelineEntry[] = []): CareerTotals {
  const nba = person.seasonStats.filter((s) => s.phase === "NBA");
  const avg = (f: (s: SeasonStats) => number) =>
    nba.length ? Math.round((nba.reduce((s, x) => s + f(x), 0) / nba.length) * 10) / 10 : 0;
  const total = (f: (s: SeasonStats) => number) =>
    Math.round(nba.reduce((s, x) => s + f(x) * x.gamesPlayed, 0));
  const peak = (f: (s: SeasonStats) => number) =>
    nba.length ? Math.round(Math.max(...nba.map(f)) * 10) / 10 : 0;
  const count = (t: string) => person.awards.filter((a) => a.type === t).length;

  return {
    seasons: nba.length,
    games: nba.reduce((s, x) => s + x.gamesPlayed, 0),
    gamesStarted: nba.reduce((s, x) => s + (x.gamesStarted ?? 0), 0),
    ppg: avg((s) => s.ppg), rpg: avg((s) => s.rpg), apg: avg((s) => s.apg),
    spg: avg((s) => s.spg ?? 0), bpg: avg((s) => s.bpg ?? 0),
    fgPct: avg((s) => s.fgPct ?? 0), tpPct: avg((s) => s.tpPct ?? 0), ftPct: avg((s) => s.ftPct ?? 0),
    totalPoints: total((s) => s.ppg), totalRebounds: total((s) => s.rpg), totalAssists: total((s) => s.apg),
    totalSteals: total((s) => s.spg ?? 0), totalBlocks: total((s) => s.bpg ?? 0),
    championships: count("CHAMPION"), finalsMvps: count("FINALS_MVP"),
    mvps: count("MVP"), allStars: count("ALL_STAR"), allNba: count("ALL_NBA"),
    dpoy: count("DPOY"), roty: count("ROOKIE_OF_YEAR"),
    ncaaTitles: timeline.filter((t) => t.outcome === "National Champion").length,
    olympicGolds: timeline.filter((t) => t.outcome === "Olympic Gold").length,
    olympicMedals: timeline.filter((t) => t.outcome.startsWith("Olympic") && t.outcome !== "Olympics — group stage").length,
    peakOvr: timeline.reduce((m, t) => Math.max(m, t.ovr), 0),
    peakPpg: peak((s) => s.ppg), peakRpg: peak((s) => s.rpg), peakApg: peak((s) => s.apg),
  };
}

export function buildCareerSummary(state: CareerState): CareerSummary {
  const p = totals(state.player, state.timeline);
  const titlesFromTimeline = state.timeline.filter((t) => t.outcome === "NBA Champion").length;
  const player: CareerTotals = { ...p, championships: Math.max(p.championships, titlesFromTimeline) };
  const rival = totals(state.rival);
  const diff = rivalryCompositeScore(state.player) - rivalryCompositeScore(state.rival);
  const verdict = diff > 8 ? "PLAYER_WON" : diff < -8 ? "RIVAL_WON" : "TOO_CLOSE_TO_CALL";

  const fanLoveLegacy: FanLoveLegacyEntry[] = Object.entries(state.fanLovePeaks)
    .map(([teamId, peak]) => ({ teamId, teamName: teamById(teamId)?.name ?? teamId, peak, tier: fanLoveTier(peak) }))
    .sort((a, b) => b.peak - a.peak);

  return {
    player, rival, verdict,
    verdictLine:
      verdict === "PLAYER_WON" ? "YOU WON THE RIVALRY."
      : verdict === "RIVAL_WON" ? "HE HAD THE BETTER CAREER."
      : "HISTORY WILL DEBATE THIS ONE FOREVER.",
    definingMoments: state.log.filter(
      (e) => e.type === "signature_moment" || e.type === "rivalry_encounter" || e.type === "career_move"
    ),
    olympicGolds: player.olympicGolds,
    peakOvr: player.peakOvr,
    fanLoveLegacy,
  };
}
