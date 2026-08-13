import { FAN_LOVE_BAND_THRESHOLDS, fanLoveTier, FanLoveTier } from "../../engine/fanlove";
import { PlayerStatus } from "../../engine/status";

// ============================================================
// FAN LOVE
// A living reaction to the career, not another stat to skim past. Reacts to
// wins, awards, playoff moments, loyalty, and team changes (see
// engine/fanlove.ts for the full model) — this component only renders it.
// Band text also respects `status`: an accomplished player (All-Star or
// above) never reads as a total unknown, even at a temporarily low number
// right after a trade — see floorBandIndex below.
// ============================================================

const BAND_TEXT: ((teamName: string) => string)[] = [
  (t) => `You're one of the faces of the league. ${t} sells out because of nights like the ones you're having.`,
  (t) => `You're becoming one of the recognizable players in the league — people outside ${t}'s market know your name now.`,
  (t) => `Fans around the league know who you are. ${t} has started to feel like it's built around you.`,
  (t) => `You're becoming a familiar face around the city. ${t} is starting to feel like it belongs to you a little.`,
  () => `The fans are still learning your name, but they're paying attention.`,
  () => `The fans barely know your name yet.`,
];

/** BAND_TEXT[0] = best (>= the highest threshold), BAND_TEXT[last] = worst (< the lowest threshold). */
function bandIndex(v: number): number {
  let idx = FAN_LOVE_BAND_THRESHOLDS.length;
  for (const t of FAN_LOVE_BAND_THRESHOLDS) {
    if (v >= t) idx--;
  }
  return Math.min(idx, BAND_TEXT.length - 1);
}

/** The worst band index a given status is still allowed to read as. */
function floorBandIndex(status: PlayerStatus): number {
  if (status === "LEGEND" || status === "MVP_LEVEL") return 2; // never worse than "fans around the league know who you are"
  if (status === "ALL_STAR") return 3; // never worse than "becoming a familiar face"
  return BAND_TEXT.length - 1; // no floor
}

export function fanLoveLine(v: number, teamName: string, status: PlayerStatus): string {
  const index = Math.min(bandIndex(v), floorBandIndex(status));
  return BAND_TEXT[index](teamName);
}

/** Visual weight for each title — escalates from muted to the same amber/rare
 * accents used elsewhere (RARE development picks, LEGENDARY tier) so "Idol"
 * and "Legend" read as genuinely special, not just another label. */
export const TIER_STYLE: Record<FanLoveTier, { color: string; icon?: string }> = {
  "Unknown": { color: "#8C8C8C" },
  "On the Radar": { color: "#8C8C8C" },
  "Familiar Face": { color: "#F5F5F2" },
  "Fan Favorite": { color: "#E31E24" },
  "Idol": { color: "#E31E24", icon: "🔥" },
  "Legend": { color: "#A78BFA", icon: "🌟" },
};

/** Read as a headline about the player's standing, not a meter with a
 * caption. The sentence is the point; the number is just proof. */
export function FanLove({ value, teamName, status }: { value: number; teamName: string; status: PlayerStatus }) {
  const v = Math.round(Math.max(0, Math.min(100, value)));
  const tier = fanLoveTier(v);
  const tierStyle = TIER_STYLE[tier];
  return (
    <div>
      <p className="font-display uppercase text-[20px] leading-[1.08]" style={{ color: tierStyle.color }}>
        {fanLoveLine(v, teamName, status)}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-[3px] w-24 bg-line rounded-sm overflow-hidden">
          <div className="h-full bg-amber" style={{ width: `${v}%` }} />
        </div>
        <span className="stat-num text-[11px] text-mute">
          {tierStyle.icon ? `${tierStyle.icon} ` : "❤️ "}{v}/100 · {tier}
        </span>
      </div>
    </div>
  );
}
