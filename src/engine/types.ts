// ============================================================
// CORE DATA MODEL
// The engine has zero knowledge of React/UI. Every function here
// is pure: (state, input) => newState. No hidden globals, no DOM.
// ============================================================

export type Playstyle =
  | "SHARPSHOOTER"
  | "PLAYMAKER"
  | "SUPERSTAR"
  | "SLASHER"
  | "TWO_WAY"
  | "INTERIOR";

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export type Attributes = {
  shooting: number;
  finishing: number;
  passing: number;
  ballHandling: number;
  defense: number;
  athleticism: number;
  strength: number;
  basketballIQ: number;
  clutch: number; // composure in decisive moments — widens minigame windows late
};

export type Hidden = {
  confidence: number; // 0-100, volatile, decays toward 50 each season
  reputation: number; // 0-100, sticky, long-term
  fanLove: number; // 0-100, how much the CURRENT team's fanbase/media loves the
  // player right now — scoped to the current team, unlike reputation. Driven by
  // four layers (see engine/fanlove.ts's header comment): tiered playoff-depth
  // bumps, award bumps, personal-decision nudges, and a reset whenever the
  // player's team changes — never a blanket echo of reputation, and never a
  // straight carry-over from a previous team.
  chemistry: number; // 0-100, resets partially on team change
  fatigue: number; // 0-100, partially resets each offseason
  injuryRisk: number; // 0-100, clamped, decays over time
  developmentRate: number; // 0.6 - 1.6, EFFICIENCY of growth (not a ceiling).
  // Starts neutral (~0.9-1.1) for every player and rival. It moves up or down
  // each season based on confidence, performance, and decisions/minigames.
  // Everyone retains a real path to an elite attribute ceiling (99) — this
  // number only affects how fast a player closes the gap to it.
};

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

export type Award =
  | { type: "MVP"; season: number }
  | { type: "CHAMPION"; season: number }
  | { type: "ALL_STAR"; season: number }
  | { type: "ALL_NBA"; season: number; team: 1 | 2 | 3 }
  | { type: "DPOY"; season: number }
  | { type: "ROOKIE_OF_YEAR"; season: number }
  | { type: "FINALS_MVP"; season: number }
  | { type: "ALL_TOURNAMENT"; season: number };

export type SeasonStats = {
  season: number;
  phase: "NCAA" | "NBA";
  age?: number;
  teamName?: string;
  role?: string;
  ovr?: number;
  seed?: number; // conference/tournament seeding
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  gamesStarted: number;
  teamWins: number;
  teamLosses: number;
  playoffResult: PlayoffResult;
  performanceScore: number; // 0-1.3, internal quality metric for the season
};

export type PlayoffResult =
  | "PENDING" // regular season simulated, decisive round not yet resolved
  | "MISSED_PLAYOFFS"
  | "FIRST_ROUND"
  | "CONF_SEMIS"
  | "CONF_FINALS"
  | "FINALS_LOSS"
  | "CHAMPION";

// The four elimination rounds shared by both NCAA tournament and NBA playoffs.
// Narrative labels differ by phase (see playoffs.ts roundLabel()), but the
// underlying progression logic is identical.
export type Round = "FIRST_ROUND" | "CONF_SEMIS" | "CONF_FINALS" | "FINALS";

export type CareerEvent = {
  id: string;
  season: number;
  type: string; // e.g. "clutch_moment", "decision", "rival_update", "contract"
  narrative: string;
  flags: string[]; // queryable tags for future narrative callbacks
  impact?: Partial<Hidden> & { draftStockDelta?: number };
};

export type Person = {
  id: string;
  name: string;
  country: string;
  position: Position;
  height: number; // cm
  playstyle: Playstyle;
  attributes: Attributes;
  hidden: Hidden;
  seasonStats: SeasonStats[];
  awards: Award[];
  events: CareerEvent[];
  draftStock: number; // 0-100, only meaningful pre-draft
  retired: boolean;
};

export type RivalArc =
  | "STEADY_RISER"
  | "EARLY_STAR_PLATEAU"
  | "LATE_BLOOMER"
  | "INJURY_PRONE";

export type NarrativeState =
  | "UNPROVEN"
  | "PEER"
  | "PLAYER_AHEAD"
  | "RIVAL_AHEAD"
  | "PLAYER_DOMINANT"
  | "RIVAL_DOMINANT";

export type Rival = Person & {
  arc: RivalArc;
  narrativeState: NarrativeState;
  /** Display name of the rival's club. Always mirrors a real registered team. */
  team: string;
  /** Registry id for that team, so the rival renders with a real crest. */
  teamId: string | null;
};

export type DecisionOption = {
  id: string;
  label: string; // the ONLY thing shown to the player pre-decision
  effects: Partial<Attributes> & Partial<Omit<Hidden, "developmentRate">>;
  tags: string[]; // used by generator to avoid repeats, and by rival AI to pick
};

export type SeasonDecision = {
  id: string;
  season: number;
  prompt: string;
  options: DecisionOption[];
  category:
    | "DEFENSE"
    | "OFFENSE"
    | "LEADERSHIP"
    | "CHEMISTRY"
    | "RECOVERY"
    | "MEDIA"
    | "TRAINING"
    | "RISK"
    | "LOYALTY";
};

export type MinigameType =
  | "SHOOTING"
  | "DEEP_THREE"
  | "FREE_THROWS"
  | "PASSING"
  | "DEFENSE"
  | "FINISHING"
  | "CLUTCH_DECISION"
  | "CHEMISTRY";

export type MinigameOutcome = "PERFECT" | "GOOD" | "MISS" | "FAIL";

export type MinigameResult = {
  type: MinigameType;
  outcome: MinigameOutcome;
  score: number; // 0-100 normalized
};

export type ClutchMoment = {
  id: string;
  season: number;
  setup: string; // narrative framing, e.g. "NCAA FINAL FOUR, 2.4s left..."
  minigame: MinigameType;
  stakes: "LOW" | "MEDIUM" | "HIGH" | "CAREER_DEFINING";
  // Present when this moment is the decisive round of a playoff run —
  // resolveClutchMomentAndAdvance() uses these to actually determine
  // whether the team advances, rather than the moment being cosmetic.
  decisiveRound?: Round;
  isRivalryEncounter?: boolean;
};

export type ContractOffer = {
  team: string;
  years: 2 | 3;
  salaryPerYear: number; // millions
  marketSize: "SMALL" | "MID" | "LARGE";
  champWindow: number; // 0-1, likelihood-weighted quality of title chances
  roleOffered: "STAR" | "CO_STAR" | "STARTER" | "BENCH";
  teamStrength: number; // 0-1, feeds team win simulation
};

export type Contract = {
  team: string;
  years: number;
  salaryPerYear: number;
  yearsRemaining: number;
  teamStrength: number;
  champWindow: number;
};

export type CareerPhase =
  | "CREATION"
  | "NCAA"
  | "DRAFT"
  | "NBA"
  | "OLYMPICS"
  | "RETIRED";

