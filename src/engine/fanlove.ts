import { Award, PlayoffResult } from "./types";
import { Team } from "./teams";
import { clamp } from "./rng";

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

const TIER_BUMP_FIRST: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 2, 3: 5, 4: 10, 5: 18 };
const TIER_BUMP_REPEAT: Record<PlayoffTier, number> = { 0: -4, 1: 0, 2: 1, 3: 2, 4: 5, 5: 10 };

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
  const bestPrior = priorResults.reduce((best, r) => Math.max(best, playoffTier(r)) as PlayoffTier, 0 as PlayoffTier);
  const isCareerBest = tier > bestPrior;
  return isCareerBest ? TIER_BUMP_FIRST[tier] : TIER_BUMP_REPEAT[tier];
}

const MARKET_FAN_LOVE_MULTIPLIER: Record<Team["market"], number> = {
  SMALL: 1.3,
  MID: 1.0,
  LARGE: 0.75,
};

/**
 * A small-market team has less built-in glamour, so the same playoff run
 * buys more Fan Love there than it would in a historic big market where
 * fans already expect success. Only ever applied to a POSITIVE playoff
 * bump — the -4 missed-playoffs penalty always lands at full value
 * regardless of market, matching applyFanLoveGain's own rule that
 * penalties are never softened.
 */
export function applyMarketFanLoveMultiplier(playoffBump: number, market: Team["market"]): number {
  if (playoffBump <= 0) return playoffBump;
  return Math.round(playoffBump * MARKET_FAN_LOVE_MULTIPLIER[market]);
}

/**
 * Diminishing-returns multiplier for POSITIVE Fan Love gains only. The same
 * nominal bump is worth much less once Fan Love is already high, so
 * reaching the 90s/100 takes a long career of real, REPEATED achievement
 * rather than one great season — 100 should feel like franchise mythology,
 * not a strong year. Never softens a penalty (missed playoffs, etc.) —
 * those still apply at full value regardless of current Fan Love.
 */
function fanLoveDiminishing(current: number): number {
  if (current >= 90) return 0.2;
  if (current >= 75) return 0.4;
  if (current >= 55) return 0.65;
  if (current >= 30) return 0.85;
  return 1;
}

/**
 * Applies a Fan Love change with diminishing returns on the way up. A
 * negative or zero rawGain (a penalty, or no change) always applies at full
 * value — only growth gets scaled down as Fan Love climbs. Pure — no RNG,
 * no state, clamped to the valid 0-100 range.
 */
export function applyFanLoveGain(current: number, rawGain: number): number {
  if (rawGain <= 0) return clamp(current + rawGain, 0, 100);
  return clamp(current + rawGain * fanLoveDiminishing(current), 0, 100);
}

/**
 * Ascending Fan Love thresholds that mark a narrative tier change. Shared
 * by FanLove.tsx's band text and finishSeason's milestone-crossing check
 * (career.ts) — defined once here so the two can never drift apart.
 */
export const FAN_LOVE_BAND_THRESHOLDS = [14, 32, 52, 72, 88] as const;

/**
 * Short titles for each Fan Love band, worst to best — index 0 matches
 * "below the first threshold", index N matches "at or above the Nth
 * threshold". Length is always FAN_LOVE_BAND_THRESHOLDS.length + 1, and
 * fanLoveTier below is the only thing that reads these, so the two can
 * never disagree about which tier a value falls in.
 */
export const FAN_LOVE_TIERS = ["Unknown", "On the Radar", "Familiar Face", "Fan Favorite", "Idol", "Legend"] as const;
export type FanLoveTier = (typeof FAN_LOVE_TIERS)[number];

/** The title for a given Fan Love value, e.g. 80 -> "Idol". */
export function fanLoveTier(value: number): FanLoveTier {
  let idx = 0;
  for (const t of FAN_LOVE_BAND_THRESHOLDS) {
    if (value >= t) idx++;
  }
  return FAN_LOVE_TIERS[idx];
}

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
