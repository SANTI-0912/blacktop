import { CareerState, playerOvr } from "../../engine/career";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { ROLE_LABEL } from "../../engine/overall";
import { Attributes } from "../../engine/types";
import { TeamLogo } from "./TeamLogo";
import { getTeamIdentity } from "../../engine/identity";

// ============================================================
// PLAYER STATUS PANEL
// The single place that answers "how good is my player right now" — OVR,
// team/role context, and current active-attribute bars. Reused wherever
// that question matters: the Career Hub and the season-progress screen.
// Never a second copy of this rendering logic anywhere else.
// ============================================================

const ATTR_DISPLAY_LABEL: Record<keyof Attributes, string> = {
  shooting: "Shooting", finishing: "Finishing", passing: "Passing",
  ballHandling: "Ball Handling", defense: "Defense", athleticism: "Speed",
  strength: "Strength", basketballIQ: "Basketball IQ", clutch: "Clutch",
};

export function PlayerStatusPanel({ state }: { state: CareerState }) {
  const ovr = playerOvr(state);
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const a = state.player.attributes;

  return (
    <div>
      <div className="flex items-center gap-3">
        <TeamLogo identity={getTeamIdentity(state.team)} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-display uppercase text-[19px] leading-none truncate">{state.team.name}</div>
          <div className="eyebrow mt-1">
            Age {state.age} · {state.player.position} · {ROLE_LABEL[state.role]}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="stat-num text-3xl font-bold text-amber leading-none">{ovr}</div>
          <div className="eyebrow">OVR</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="eyebrow mb-2">{profile.label} attributes</div>
        <div className="space-y-1.5">
          {profile.active.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[12px] text-mute w-24 shrink-0">{ATTR_DISPLAY_LABEL[key]}</span>
              <div className="flex-1 h-1.5 bg-line rounded-sm overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, (a[key] / 99) * 100)}%`,
                    background: a[key] >= 85 ? "#E31E24" : "#C9C9C9",
                  }}
                />
              </div>
              <span className="stat-num text-xs w-6 text-right">{Math.round(a[key])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
