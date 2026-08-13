import { useState } from "react";
import { CareerState, playerOvr } from "../../engine/career";
import { getTeamIdentity, getNationIdentity } from "../../engine/identity";
import { flagFor } from "../../engine/countries";
import { ROLE_LABEL } from "../../engine/overall";
import { TeamLogo } from "./TeamLogo";
import { teamById } from "../../engine/teams";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { totalSeasonDelta } from "../../engine/development";
import { Attributes, Award } from "../../engine/types";

// ============================================================
// CAREER HEADER
//
// A small identity card, not a dashboard. At any point in the career the
// player can glance up and be reminded: this is me, this is my team, this is
// my country, this is my rival, and this is how our story is going. The
// stat block doubles as a flip card — attributes up front (who this player
// is built to be), season numbers and hardware on the back (what they've
// actually done with it).
// ============================================================

type Ctx = "NCAA" | "NBA" | "OLYMPICS" | "DRAFT";

function contextOf(state: CareerState): Ctx {
  if (state.phase === "DRAFT") return "DRAFT";
  if (state.phase === "OLYMPICS") return "OLYMPICS";
  return state.phase === "NCAA" ? "NCAA" : "NBA";
}

/** The single most relevant rivalry line for where the career currently is. */
export function rivalryLine(state: CareerState): { you: string; rival: string; label: string } {
  const count = (p: typeof state.player, t: string) => p.awards.filter((a) => a.type === t).length;
  const youRings = count(state.player, "CHAMPION");
  const rivalRings = count(state.rival, "CHAMPION");
  if (youRings > 0 || rivalRings > 0) {
    return { label: "Titles", you: `${youRings}`, rival: `${rivalRings}` };
  }
  const youMvp = count(state.player, "MVP");
  const rivalMvp = count(state.rival, "MVP");
  if (youMvp > 0 || rivalMvp > 0) {
    return { label: "MVPs", you: `${youMvp}`, rival: `${rivalMvp}` };
  }
  const youAs = count(state.player, "ALL_STAR");
  const rivalAs = count(state.rival, "ALL_STAR");
  if (youAs > 0 || rivalAs > 0) {
    return { label: "All-Stars", you: `${youAs}`, rival: `${rivalAs}` };
  }
  // Early career: points are the only argument either of you has yet.
  const lastYou = state.player.seasonStats[state.player.seasonStats.length - 1];
  const lastRival = state.rival.seasonStats[state.rival.seasonStats.length - 1];
  return {
    label: "PPG",
    you: lastYou ? `${lastYou.ppg}` : "—",
    rival: lastRival ? `${lastRival.ppg}` : "—",
  };
}

/** Sports-broadcast phrasing for where the rivalry stands right now. */
export function rivalryStatus(state: CareerState): string {
  switch (state.rival.narrativeState) {
    case "PLAYER_DOMINANT": return "You've pulled away.";
    case "PLAYER_AHEAD": return "You're starting to pull away.";
    case "RIVAL_AHEAD": return `${state.rival.name} is making his case.`;
    case "RIVAL_DOMINANT": return `${state.rival.name} has left you behind.`;
    case "PEER": return "Neither of you has separated from the other.";
    default: return "The comparisons have already started.";
  }
}

const ATTR_SHORT_LABEL: Record<keyof Attributes, string> = {
  shooting: "SHT",
  finishing: "FIN",
  passing: "PAS",
  ballHandling: "BALL",
  defense: "DEF",
  athleticism: "SPD",
  strength: "STR",
  basketballIQ: "IQ",
  clutch: "CLU",
};

const AWARD_SHORT_LABEL: Record<Award["type"], string> = {
  CHAMPION: "Titles",
  MVP: "MVP",
  FINALS_MVP: "Finals MVP",
  DPOY: "DPOY",
  ROOKIE_OF_YEAR: "ROY",
  ALL_NBA: "All-NBA",
  ALL_STAR: "All-Star",
  ALL_TOURNAMENT: "All-Tourney",
};

const AWARD_ORDER: Award["type"][] = [
  "CHAMPION", "MVP", "FINALS_MVP", "DPOY", "ROOKIE_OF_YEAR", "ALL_NBA", "ALL_STAR", "ALL_TOURNAMENT",
];

/** Trophy case as one terse line — counts only, no dates or seasons, so it
 * fits the same small footprint as the stat boxes above it. */
function awardSummary(awards: Award[]): string {
  const counts = new Map<Award["type"], number>();
  for (const a of awards) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  const parts = AWARD_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => {
    const n = counts.get(t)!;
    return n > 1 ? `${n}x ${AWARD_SHORT_LABEL[t]}` : AWARD_SHORT_LABEL[t];
  });
  return parts.length > 0 ? parts.join(" · ") : "No hardware yet.";
}

/** The identity block used on screens where something ELSE is the primary
 * moment (a decision, a challenge, a draft pick) — but it's still the
 * player's own information, so it earns real size: name, OVR, and a
 * flip card that opens on attributes and turns over to season numbers. */
export function CareerHeader({ state }: { state: CareerState }) {
  const [flipped, setFlipped] = useState(false);
  const [pinched, setPinched] = useState(false);
  const ctx = contextOf(state);
  const ovr = playerOvr(state);
  const r = rivalryLine(state);
  const last = state.lastStats;

  const isOly = ctx === "OLYMPICS";
  const identity = isOly ? getNationIdentity(state.country) : getTeamIdentity(state.team);
  const teamName =
    ctx === "DRAFT" ? "Draft Night" : isOly ? state.country : state.team.name;

  const statBoxes: { l: string; v: string | number }[] = [
    { l: "PPG", v: last ? last.ppg : "—" },
    { l: "RPG", v: last ? last.rpg : "—" },
    { l: "APG", v: last ? last.apg : "—" },
    { l: "SPG", v: last ? last.spg : "—" },
    { l: "BPG", v: last ? last.bpg : "—" },
  ];
  const shootingBoxes: { l: string; v: string }[] = [
    { l: "FG%", v: last ? `${last.fgPct}%` : "—" },
    { l: "3P%", v: last ? `${last.tpPct}%` : "—" },
    { l: "FT%", v: last ? `${last.ftPct}%` : "—" },
  ];

  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  // Last season's growth, folded straight into the attribute box instead of
  // its own list further down the app — "56 +4" is the whole story.
  const totalDeltas = totalSeasonDelta(state.lastDevelopment?.changes ?? [], state.lastAgeReport, state.lastMinigameDev);
  const deltaByAttr = new Map(totalDeltas.map((d) => [d.attribute, d.delta]));
  const attrBoxes = profile.active.map((key) => ({
    l: ATTR_SHORT_LABEL[key],
    v: Math.round(state.player.attributes[key]),
    delta: deltaByAttr.get(key),
  }));

  // Real crest once the rival has a real, registered club (post-draft); a
  // stable procedural one before that — "College" isn't a specific school
  // the engine tracks, so there's no real logo to fetch pre-draft.
  const rivalTeamRecord = state.rival.teamId ? teamById(state.rival.teamId) : null;
  const rivalIdentity = getTeamIdentity(
    rivalTeamRecord ?? { id: `rival_${state.rival.id}`, abbr: state.rival.team.slice(0, 3).toUpperCase(), name: state.rival.team }
  );

  return (
    <div className="pb-7">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TeamLogo identity={identity} size={26} />
            <span className="font-display uppercase tracking-[0.1em] text-[15px] text-mute truncate">
              {teamName} · {state.player.position} · {ROLE_LABEL[state.role]}
            </span>
          </div>
          <div className="mt-1.5 font-display uppercase text-[42px] leading-[0.82] truncate">
            {state.player.name}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="stat-num text-[42px] font-bold text-amber leading-none">{ovr}</div>
          <div className="eyebrow mt-1">OVR</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPinched(true)}
        className="mt-4 block w-full text-left"
        aria-label="Flip between attributes and season stats"
      >
        <div
          className="transition-transform duration-150 ease-in"
          style={{ transform: pinched ? "scaleX(0.02)" : "scaleX(1)" }}
          onTransitionEnd={() => {
            if (pinched) {
              setFlipped((f) => !f);
              setPinched(false);
            }
          }}
        >
          {!flipped ? (
            <>
              {/* FRONT — attributes + rival */}
              <div className="flex items-center justify-between">
                <span className="eyebrow">{profile.label} attributes</span>
                <span className="text-mute/50 text-[10px]">↻ tap</span>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {attrBoxes.map((b) => (
                  <div key={b.l} className="text-center py-2 border border-line rounded-sm">
                    <div className="stat-num text-lg font-bold leading-none">
                      {b.v}
                      {!!b.delta && (
                        <span className="text-xs ml-0.5" style={{ color: b.delta > 0 ? "#E31E24" : "#FF4D3D" }}>
                          {b.delta > 0 ? "+" : ""}{b.delta}
                        </span>
                      )}
                    </div>
                    <div className="eyebrow mt-1 text-[9px] tracking-[0.1em]">{b.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <TeamLogo identity={rivalIdentity} size={28} />
                <span className="font-display uppercase text-[17px] leading-tight truncate">
                  vs {state.rival.name}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* BACK — season stats + hardware */}
              <div className="flex items-center justify-between">
                <span className="eyebrow">Season stats</span>
                <span className="text-mute/50 text-[10px]">↻ tap</span>
              </div>
              <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                {statBoxes.map((b) => (
                  <div key={b.l} className="text-center py-2 border border-line rounded-sm">
                    <div className="stat-num text-lg font-bold leading-none">{b.v}</div>
                    <div className="eyebrow mt-1 text-[9px] tracking-[0.1em]">{b.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {shootingBoxes.map((b) => (
                  <div key={b.l} className="text-center py-2 border border-line rounded-sm">
                    <div className="stat-num text-lg font-bold leading-none">{b.v}</div>
                    <div className="eyebrow mt-1 text-[9px] tracking-[0.1em]">{b.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-amber/90 truncate">{awardSummary(state.player.awards)}</div>
            </>
          )}
        </div>
      </button>

      <div className="mt-3 text-[11px] text-mute/60 truncate">
        {flagFor(state.country)} {r.you}–{r.rival} {r.label.toLowerCase()} vs {state.rival.name} · {state.rival.team}
      </div>
    </div>
  );
}
