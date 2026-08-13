// ============================================================
// GAME IMPORTANCE
// One place that decides how hard a playable moment is. Everything the
// minigame library needs comes from here, so difficulty stays consistent
// whether the moment is a February game or Game 7 of the Finals.
// ============================================================

export type Importance =
  | "TRAINING"
  | "REGULAR"
  | "RIVALRY"
  | "PLAYOFF_R1"
  | "PLAYOFF_R2"
  | "SEMIFINAL"
  | "CONF_FINALS"
  | "FINALS"
  | "GAME_7"
  | "OLYMPIC"
  | "OLYMPIC_GOLD";

export type MinigameKind =
  | "SIMON"
  | "REACTION"
  | "HOT_ZONE"
  | "PERFECT_TIMING"
  | "READ_PLAY";

export type MinigameSpec = {
  kind: MinigameKind;
  /** SIMON: how many inputs in the sequence. */
  sequenceLength: number;
  /** SIMON: ms each step is shown. Lower = less time to memorise. */
  flashMs: number;
  /** HOT_ZONE: radius in px of the target. PERFECT_TIMING: half-width in %. */
  targetSize: number;
  /** REACTION / READ_PLAY: ms allowed to respond. */
  reactionMs: number;
  /** PERFECT_TIMING: sweep speed multiplier. */
  speed: number;
};

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  TRAINING: "Training",
  REGULAR: "Regular season",
  RIVALRY: "Rivalry game",
  PLAYOFF_R1: "First round",
  PLAYOFF_R2: "Second round",
  SEMIFINAL: "Semifinal",
  CONF_FINALS: "Conference finals",
  FINALS: "The finals",
  GAME_7: "Game 7",
  OLYMPIC: "Olympic knockout",
  OLYMPIC_GOLD: "Gold medal game",
};

// Simon sequence length follows the spec's ladder exactly.
const SIMON_LENGTH: Record<Importance, number> = {
  TRAINING: 1,
  REGULAR: 2,
  RIVALRY: 2,
  PLAYOFF_R1: 2,
  PLAYOFF_R2: 3,
  SEMIFINAL: 4,
  CONF_FINALS: 5,
  FINALS: 6,
  GAME_7: 7,
  OLYMPIC: 4,
  OLYMPIC_GOLD: 6,
};

// 0 (low stakes) .. 1 (maximum pressure) — drives every other tightening.
const PRESSURE: Record<Importance, number> = {
  TRAINING: 0,
  REGULAR: 0.12,
  RIVALRY: 0.3,
  PLAYOFF_R1: 0.35,
  PLAYOFF_R2: 0.45,
  SEMIFINAL: 0.6,
  CONF_FINALS: 0.72,
  FINALS: 0.85,
  GAME_7: 1,
  OLYMPIC: 0.6,
  OLYMPIC_GOLD: 0.95,
};

/**
 * `skillRelief` (0..1) comes from the player's relevant attributes and gives
 * back some of what pressure takes away — this is how progression is felt in
 * the part of the game you actually play.
 */
export function specFor(kind: MinigameKind, importance: Importance, skillRelief = 0): MinigameSpec {
  const p = PRESSURE[importance];
  const relief = Math.max(0, Math.min(1, skillRelief));

  return {
    kind,
    sequenceLength: SIMON_LENGTH[importance],
    // 620ms down to ~260ms at Game 7; good memory attributes buy a little back.
    flashMs: Math.round(620 - p * 360 + relief * 90),
    // Hot zone radius 46px -> 20px; perfect-timing half-width 11% -> 3.2%.
    targetSize:
      kind === "HOT_ZONE"
        ? Math.round(46 - p * 26 + relief * 9)
        : Math.max(2.4, 11 - p * 7.8 + relief * 2.6),
    reactionMs: Math.round(1500 - p * 800 + relief * 260),
    speed: 1 + p * 0.85 - relief * 0.2,
  };
}

// Which rounds of a playoff run map to which importance.
export function importanceForRound(round: string, isGame7: boolean): Importance {
  if (isGame7) return "GAME_7";
  switch (round) {
    case "FIRST_ROUND": return "PLAYOFF_R1";
    case "CONF_SEMIS": return "PLAYOFF_R2";
    case "CONF_FINALS": return "CONF_FINALS";
    case "FINALS": return "FINALS";
    default: return "REGULAR";
  }
}
