import { CareerEvent, PlayoffResult, Round } from "./types";

// ============================================================
// CAREER HISTORY / MEMORY
//
// Every important moment is stored as a structured CareerEvent with
// machine-readable flags, NOT just a one-time display string. The
// narrative layer (and the UI later) can query this history to build
// callbacks years afterward, e.g.:
//
//   "Five years after the shot that ended your NCAA tournament run,
//    you finally had your chance at revenge against Darius Cole."
//
// The flags below are the stable vocabulary the rest of the engine
// (and eventually the UI) queries against. Keep them additive.
// ============================================================

export const MILESTONE_FLAGS = {
  NCAA_BUZZER_BEATER: "ncaa_buzzer_beater",
  NCAA_LOSS_TO_RIVAL: "ncaa_loss_to_rival",
  NCAA_WIN_VS_RIVAL: "ncaa_win_vs_rival",
  FIRST_PLAYOFF_WIN: "first_playoff_win",
  FIRST_MVP: "first_mvp",
  GAME_7_WINNER: "game_7_winner",
  CHAMPIONSHIP: "championship",
  LOST_TO_RIVAL_PLAYOFFS: "lost_to_rival_playoffs",
  BEAT_RIVAL_PLAYOFFS: "beat_rival_playoffs",
  MAJOR_INJURY: "major_injury",
  CAREER_DEFINING_SUCCESS: "career_defining_clutch_success",
  CAREER_DEFINING_FAILURE: "career_defining_clutch_failure",
} as const;

export type MilestoneFlag = (typeof MILESTONE_FLAGS)[keyof typeof MILESTONE_FLAGS];

export function makeMilestone(params: {
  season: number;
  type: string;
  narrative: string;
  flags: string[];
  rivalInvolved?: boolean;
  round?: Round;
  playoffResult?: PlayoffResult;
}): CareerEvent {
  const { season, type, narrative, flags, rivalInvolved, round, playoffResult } = params;
  const enriched = [...flags];
  if (rivalInvolved) enriched.push("rival_involved");
  if (round) enriched.push(`round_${round.toLowerCase()}`);
  if (playoffResult) enriched.push(`result_${playoffResult.toLowerCase()}`);
  return {
    id: `milestone_${type}_${season}_${Math.floor(Math.random() * 1e6)}`,
    season,
    type,
    narrative,
    flags: enriched,
  };
}

// ---- Query helpers used by the narrative layer ----

export function hasFlag(history: CareerEvent[], flag: string): boolean {
  return history.some((e) => e.flags.includes(flag));
}

export function findByFlag(history: CareerEvent[], flag: string): CareerEvent[] {
  return history.filter((e) => e.flags.includes(flag));
}

export function firstByFlag(history: CareerEvent[], flag: string): CareerEvent | null {
  return history.find((e) => e.flags.includes(flag)) ?? null;
}

export function seasonsSince(history: CareerEvent[], flag: string, currentSeason: number): number | null {
  const evt = firstByFlag(history, flag);
  if (!evt) return null;
  return currentSeason - evt.season;
}

// Builds a callback line if a relevant past moment exists. Returns null when
// there's nothing worth referencing, so the caller can skip it silently.
export function buildCallback(
  history: CareerEvent[],
  currentSeason: number,
  context: { vsRival: boolean; round?: Round }
): string | null {
  if (context.vsRival) {
    const ncaaLoss = firstByFlag(history, MILESTONE_FLAGS.NCAA_LOSS_TO_RIVAL);
    if (ncaaLoss) {
      const gap = currentSeason - ncaaLoss.season;
      if (gap >= 1) {
        return `${gap} year${gap === 1 ? "" : "s"} after the loss that ended your NCAA run, you get another shot at him.`;
      }
    }
    const priorLoss = findByFlag(history, MILESTONE_FLAGS.LOST_TO_RIVAL_PLAYOFFS);
    if (priorLoss.length > 0) {
      const last = priorLoss[priorLoss.length - 1];
      return `He ended your season once before. You haven't forgotten.`;
    }
    const priorWin = findByFlag(history, MILESTONE_FLAGS.BEAT_RIVAL_PLAYOFFS);
    if (priorWin.length > 0) {
      return `You've beaten him on this stage before. He's been waiting for this.`;
    }
  }

  const failure = firstByFlag(history, MILESTONE_FLAGS.CAREER_DEFINING_FAILURE);
  if (failure && currentSeason - failure.season >= 2) {
    return `The last time the game came down to you like this, it didn't go your way.`;
  }
  return null;
}
