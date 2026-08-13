import { Award } from "./types";

// ============================================================
// PLAYER STATUS
//
// A single narrative signal answering "how known/accomplished is this
// player right now" — derived from awards (career-long, never reset) and
// reputation (Hidden.reputation — sticky, long-term, survives team
// changes). Deliberately separate from overall.ts's Role, which answers a
// different question (how good is this player RELATIVE TO THIS ROSTER) and
// is never touched by this file. Consumed by narrative text (Fan Love band
// text, the draft-night reveal, the Big Decision consequence text) so an
// accomplished player's story never contradicts their actual career state.
// ============================================================

export type PlayerStatus =
  | "UNKNOWN"
  | "ROOKIE"
  | "ROTATION"
  | "STARTER"
  | "ALL_STAR"
  | "MVP_LEVEL"
  | "LEGEND";

export function playerStatus(reputation: number, awards: Award[], nbaSeasonsPlayed: number): PlayerStatus {
  const hasMvp = awards.some((a) => a.type === "MVP");
  const hasChampion = awards.some((a) => a.type === "CHAMPION");
  const allStars = awards.filter((a) => a.type === "ALL_STAR").length;

  if (hasMvp && (hasChampion || allStars >= 2)) return "LEGEND";
  if (hasMvp) return "MVP_LEVEL";
  if (allStars > 0 || hasChampion) return "ALL_STAR";
  if (nbaSeasonsPlayed === 0) return reputation >= 40 ? "ROTATION" : "ROOKIE";
  if (reputation >= 45) return "STARTER";
  if (reputation >= 20) return "ROTATION";
  return "UNKNOWN";
}
