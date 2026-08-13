import { Attributes, Playstyle, Position } from "./types";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { clamp } from "./rng";

// ============================================================
// OVERALL + ROLE
// OVR is the number the player reads every season to feel progress. It is a
// weighted blend of attributes, leaning on whatever the playstyle actually
// uses, so a Playmaker isn't punished for average strength.
// ============================================================

export function computeOverall(attrs: Attributes, playstyle: Playstyle): number {
  const profile = PLAYSTYLE_PROFILES[playstyle];
  let sum = 0;
  let weight = 0;
  for (const k of profile.active) {
    const w = profile.weights[k] ?? 1;
    sum += attrs[k] * w;
    weight += w;
  }
  // Slight upward curve so late-career elite players read as 90+ rather than
  // everyone clustering in the 70s.
  const raw = weight > 0 ? sum / weight : 50;
  return clamp(Math.round(raw * 1.06), 40, 99);
}

export type Role = "PROSPECT" | "BENCH" | "ROTATION" | "STARTER" | "STAR" | "FRANCHISE";

export const ROLE_LABEL: Record<Role, string> = {
  PROSPECT: "Prospect",
  BENCH: "Bench",
  ROTATION: "Rotation",
  STARTER: "Starter",
  STAR: "Star",
  FRANCHISE: "Franchise Player",
};

// Role is RELATIVE: the same OVR is a star on a weak roster and a rotation
// piece on a superteam. This is what makes the Boston-vs-Sacramento choice
// in free agency a real trade-off rather than a cosmetic one.
export function determineRole(playerOvr: number, supportingOvr: number): Role {
  const edge = playerOvr - supportingOvr;
  if (edge >= 9) return "FRANCHISE";
  if (edge >= 3) return "STAR";
  if (edge >= -4) return "STARTER";
  if (edge >= -11) return "ROTATION";
  return "BENCH";
}

// Minutes follow from role and feed the box score.
export function roleMinutesFactor(role: Role): number {
  switch (role) {
    case "FRANCHISE": return 1.16;
    case "STAR": return 1.08;
    case "STARTER": return 0.95;
    case "ROTATION": return 0.72;
    case "BENCH": return 0.5;
    case "PROSPECT": return 0.6;
  }
}

export function jerseyNumber(name: string, position: Position): number {
  const seed = name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + position.length;
  return (seed % 40) + 1;
}
