import { useState } from "react";
import { CareerState, supportOf, TimelineEntry, playerOvr } from "../../engine/career";
import { playerStatus } from "../../engine/status";
import { ROLE_LABEL } from "../../engine/overall";
import { Screen, Eyebrow, Divider } from "../components/Shell";
import { rivalryLine, rivalryStatus } from "../components/CareerHeader";
import { getTeamIdentity } from "../../engine/identity";
import { flagFor } from "../../engine/countries";
import { TeamLogo } from "../components/TeamLogo";
import { Attributes } from "../../engine/types";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { totalSeasonDelta } from "../../engine/development";
import { fanLoveLine, TIER_STYLE } from "../components/FanLove";
import { fanLoveTier } from "../../engine/fanlove";

type Tab = "SEASON" | "TEAM" | "STATS" | "CAREER";

// ============================================================
// CAREER HUB — the front page of the career. One continuous story on the
// default (SEASON) view: who you are, what just happened, what it's worth,
// and what's next. TEAM/STATS/CAREER are quiet secondary destinations for
// a player who wants to dig in, not a fourth of the screen's attention.
// ============================================================

export function CareerHub({ state, onContinue }: { state: CareerState; onContinue: () => void }) {
  const [tab, setTab] = useState<Tab>("SEASON");
  const support = supportOf(state);
  const league = state.phase === "NCAA" ? "College" : "NBA";
  const ovr = playerOvr(state);
  const identity = getTeamIdentity(state.team);

  const nextEvent =
    state.phase === "NCAA" && state.ncaaSeasonsRemaining === 1
      ? "Final college season, then the draft"
      : state.phase === "NCAA"
      ? "NCAA season"
      : state.contractYearsLeft <= 0
      ? "Contract year — free agency ahead"
      : "NBA season";

  return (
    <Screen>
      {/* Quiet utility nav — never competes with the identity below it. */}
      <div className="flex gap-6 rise" role="tablist">
        {(["SEASON", "TEAM", "STATS", "CAREER"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`pb-1.5 font-display uppercase tracking-[0.18em] text-[11px] border-b transition-colors ${
              tab === t ? "border-amber text-bone" : "border-transparent text-mute/50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Identity — present regardless of tab. This is the one constant. */}
      <div className="mt-7 rise rise-1">
        <div className="flex items-center gap-2">
          <TeamLogo identity={identity} size={24} />
          <span className="font-display uppercase tracking-[0.1em] text-[15px] text-mute truncate">
            {state.team.name} · {league} · Season {state.season}
          </span>
        </div>
        <h1 className="mt-2 font-display uppercase leading-[0.82] text-[64px] truncate">
          {state.player.name}
        </h1>
        <div className="mt-1.5 font-display uppercase tracking-[0.1em] text-[14px] text-mute">
          {state.player.position} · {ROLE_LABEL[state.role]} · Age {state.age}
        </div>
      </div>

      <div className="mt-8 rise rise-2 flex-1">
        {tab === "SEASON" && <SeasonStory state={state} ovr={ovr} nextEvent={nextEvent} />}
        {tab === "TEAM" && <TeamTab state={state} support={support} />}
        {tab === "STATS" && <StatsTab state={state} />}
        {tab === "CAREER" && <CareerTab timeline={state.timeline} />}
      </div>

      <div className="mt-10 rise rise-3">
        <button className="btn-primary text-xl py-4" onClick={onContinue}>
          {state.timeline.length === 0 ? "Begin season" : "Continue career"}
        </button>
      </div>
    </Screen>
  );
}

/** The default view: not a tab, a story. PLAYER (handled by the identity
 * block above) → MOMENT → STAT → REPUTATION → WHAT'S NEXT. Every stop gets
 * exactly one number or one line to make its case before the next divider. */
function SeasonStory({ state, ovr, nextEvent }: { state: CareerState; ovr: number; nextEvent: string }) {
  const last = state.lastStats;
  const prevOvr = state.timeline[state.timeline.length - 1]?.ovr;
  const ovrDelta = prevOvr !== undefined ? ovr - prevOvr : null;
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);
  const fanLove = Math.round(Math.max(0, Math.min(100, state.player.hidden.fanLove)));
  const tier = fanLoveTier(fanLove);
  const tierStyle = TIER_STYLE[tier];
  const r = rivalryLine(state);

  return (
    <div>
      {/* OVR — the single biggest thing on the screen. */}
      <div className="flex items-end gap-4">
        <span className="stat-num font-bold leading-[0.72] text-[140px] text-amber">{ovr}</span>
        <div className="pb-4 leading-tight">
          <div className="eyebrow">OVR</div>
          {ovrDelta !== null && ovrDelta !== 0 && (
            <div
              className="stat-num text-[13px] mt-1 whitespace-nowrap"
              style={{ color: ovrDelta > 0 ? "#E31E24" : "#FF4D3D" }}
            >
              {ovrDelta > 0 ? "+" : ""}{ovrDelta} last season
            </div>
          )}
        </div>
      </div>

      {/* The career moment — how the team just did, told as one big number. */}
      {last && (
        <>
          <Divider />
          <span className="stat-num font-bold leading-[0.8] text-[72px]">
            {last.teamWins}<span className="text-mute mx-1">–</span>{last.teamLosses}
          </span>
          <div className="eyebrow -mt-1">Last season's record</div>

          <div className="mt-5 flex items-baseline gap-2.5">
            <span className="stat-num font-bold leading-none text-[40px]">{last.ppg}</span>
            <span className="eyebrow pb-0.5">PPG</span>
            <span className="stat-num text-[13px] text-mute ml-1">
              {last.rpg} RPG · {last.apg} APG
            </span>
          </div>
        </>
      )}

      {/* Fan Love — read as a headline about the player's standing, not a meter. */}
      <Divider />
      <p className="text-[21px] font-display uppercase leading-[1.05]" style={{ color: tierStyle.color }}>
        {fanLoveLine(fanLove, state.team.name, status)}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-[3px] bg-line rounded-sm overflow-hidden max-w-[120px]">
          <div className="h-full bg-amber" style={{ width: `${fanLove}%` }} />
        </div>
        <span className="stat-num text-[11px] text-mute">{fanLove}/100 · {tier}</span>
      </div>

      {/* What's next — the story's cliffhanger, then the way through it. */}
      <Divider />
      <Eyebrow>Next</Eyebrow>
      <p className="mt-1.5 font-display uppercase text-[36px] leading-[0.9]">{nextEvent}</p>
      <p className="mt-2.5 text-[15px] text-mute leading-relaxed max-w-[85%]">
        {state.phase === "NCAA"
          ? "Raise your draft stock and reach the National Championship."
          : "Win a title. Beat the man they keep comparing you to."}
      </p>

      <p className="mt-5 text-[12px] text-mute/70">
        {flagFor(state.country)} {rivalryStatus(state)} ({r.you}–{r.rival} {r.label.toLowerCase()} vs {state.rival.name})
      </p>
    </div>
  );
}

function TeamTab({ state, support }: { state: CareerState; support: number }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display uppercase text-[30px] leading-[0.88] truncate">{state.team.name}</div>
          <div className="eyebrow mt-1.5">{state.team.conference} · #{state.jersey}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="stat-num text-4xl font-bold text-amber leading-none">{state.team.ovr}</div>
          <div className="eyebrow mt-1.5">Team OVR</div>
        </div>
      </div>

      {state.salary > 0 && (
        <p className="mt-3 stat-num text-[13px] text-mute">
          ${state.salary}M/yr · {state.contractYearsLeft > 0 ? `${state.contractYearsLeft} yr left` : "expiring"}
        </p>
      )}

      <Divider />

      <div className="flex gap-9">
        <div>
          <div className="stat-num text-2xl">{support}</div>
          <div className="eyebrow mt-1">Supporting cast</div>
        </div>
        <div>
          <div className="stat-num text-2xl">{ROLE_LABEL[state.role]}</div>
          <div className="eyebrow mt-1">Role</div>
        </div>
        <div>
          <div className="stat-num text-2xl">{Math.round(state.player.hidden.confidence)}</div>
          <div className="eyebrow mt-1">Confidence</div>
        </div>
      </div>

      <Divider />

      <Eyebrow>Roster</Eyebrow>
      <div className="mt-3 divide-y divide-line/60">
        {state.roster.map((r) => (
          <div
            key={r.position}
            className={`flex items-center gap-3 py-2.5 ${r.isPlayer ? "bg-amber/10 -mx-1 px-1" : ""}`}
          >
            <span className="eyebrow w-8 shrink-0">{r.position}</span>
            <span className={`flex-1 text-sm truncate ${r.isPlayer ? "font-display uppercase tracking-wide text-base" : ""}`}>
              {r.name}
            </span>
            <span className={`stat-num text-sm ${r.isPlayer ? "text-amber font-bold" : "text-mute"}`}>{r.ovr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ATTR_DISPLAY_LABEL: Record<keyof Attributes, string> = {
  shooting: "Shooting", finishing: "Finishing", passing: "Passing",
  ballHandling: "Ball Handling", defense: "Defense", athleticism: "Speed",
  strength: "Strength", basketballIQ: "Basketball IQ", clutch: "Clutch",
};

function StatsTab({ state }: { state: CareerState }) {
  const a = state.player.attributes;
  const profile = PLAYSTYLE_PROFILES[state.player.playstyle];
  const totalDeltas = totalSeasonDelta(state.lastDevelopment?.changes ?? [], state.lastAgeReport, state.lastMinigameDev);
  const deltas = new Map(totalDeltas.map((c) => [c.attribute, c.delta]));
  const rows = profile.active.map((key) => ({ label: ATTR_DISPLAY_LABEL[key], value: a[key], delta: deltas.get(key) }));
  return (
    <div>
      <Eyebrow>{profile.label} attributes</Eyebrow>
      <p className="mt-1.5 text-[13px] text-mute leading-relaxed">
        These set your windows in the championship challenge.
      </p>
      <div className="mt-7 space-y-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-[13px] text-mute w-28 shrink-0">{r.label}</span>
            <div className="flex-1 h-1.5 bg-line rounded-sm overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (r.value / 99) * 100)}%`,
                  background: r.value >= 85 ? "#E31E24" : "#C9C9C9",
                }}
              />
            </div>
            <span className="stat-num text-sm w-7 text-right">{Math.round(r.value)}</span>
            {r.delta !== undefined && r.delta !== 0 && (
              <span
                className="stat-num text-xs w-7 text-right"
                style={{ color: r.delta > 0 ? "#E31E24" : "#FF4D3D" }}
              >
                {r.delta > 0 ? "+" : ""}{r.delta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CareerTab({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) {
    return <p className="text-mute text-sm">Your career timeline fills in as you play.</p>;
  }
  return (
    <div className="space-y-0">
      {timeline.map((t, i) => (
        <div key={i} className="flex gap-3 py-3.5 border-b border-line/60">
          <div className="w-9 shrink-0">
            <div className="stat-num text-lg leading-none">{t.age}</div>
            <div className="eyebrow">age</div>
          </div>
          {t.teamId && (
            <TeamLogo identity={getTeamIdentity({ id: t.teamId, abbr: t.teamAbbr ?? "", name: t.teamName })} size={30} />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-display uppercase text-[17px] leading-tight truncate">{t.teamName}</div>
            <div className="eyebrow mt-0.5">
              {t.role} · OVR {t.ovr} · {t.record}
            </div>
            {t.ppg > 0 && (
              <div className="stat-num text-[13px] text-mute mt-1">
                {t.ppg} PPG • {t.rpg} RPG • {t.apg} APG
              </div>
            )}
            <div
              className="text-[13px] mt-1"
              style={{ color: t.highlight ? "#E31E24" : "#8C8C8C" }}
            >
              {t.outcome}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
