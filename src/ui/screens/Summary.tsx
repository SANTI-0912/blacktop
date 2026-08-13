import { useState } from "react";
import { CareerState, CareerSummary, CareerTotals, FanLoveLegacyEntry } from "../../engine/career";
import { getTeamIdentity } from "../../engine/identity";
import { teamById } from "../../engine/teams";
import { TeamLogo } from "../components/TeamLogo";
import { TIER_STYLE } from "../components/FanLove";
import { Screen, Eyebrow, Title } from "../components/Shell";
import { CareerTab } from "./CareerHub";

type Tab = "CAREER" | "RIVAL" | "TIMELINE" | "MOMENTS";

export function SummaryScreen({
  state, summary, onRestart,
}: { state: CareerState; summary: CareerSummary; onRestart: () => void }) {
  const [tab, setTab] = useState<Tab>("CAREER");
  const you = summary.player;
  const tone =
    summary.verdict === "PLAYER_WON" ? "#E31E24" : summary.verdict === "RIVAL_WON" ? "#FF4D3D" : "#8C8C8C";

  return (
    <Screen>
      <div className="flex gap-6 rise" role="tablist">
        {(["CAREER", "RIVAL", "TIMELINE", "MOMENTS"] as Tab[]).map((t) => (
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

      <div className="mt-7 rise rise-1">
        <Eyebrow>{state.player.name} · retired at {state.age}</Eyebrow>
        <Title size="xl">Career<br />complete</Title>
        <p className="mt-3 font-display uppercase text-[26px] leading-[0.95]" style={{ color: tone }}>
          {summary.verdictLine}
        </p>
      </div>

      <div className="mt-8 rise rise-2 flex-1">
        {tab === "CAREER" && <CareerRecord t={you} legacy={summary.fanLoveLegacy} />}
        {tab === "RIVAL" && <RivalCompare summary={summary} rivalName={state.rival.name} />}
        {tab === "TIMELINE" && <CareerTab timeline={state.timeline} />}
        {tab === "MOMENTS" && <Moments state={state} />}
      </div>

      <div className="mt-9 rise rise-3">
        <button className="btn-primary" onClick={onRestart}>Start new career</button>
      </div>
    </Screen>
  );
}

/** A hero number for the single most resonant stat in a category, with the
 * rest folded into one quiet line — never a grid of boxes. */
function HeroStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="stat-num font-bold text-[48px] leading-none">{value}</span>
      <span className="eyebrow pb-0.5">{label}</span>
    </div>
  );
}

function StatRow({ items }: { items: { l: string; v: string | number }[] }) {
  return (
    <p className="mt-1.5 stat-num text-[13px] text-mute">
      {items.map((x, i) => (
        <span key={x.l}>
          {i > 0 && <span className="text-line"> · </span>}
          <span className="text-bone">{x.v}</span> {x.l}
        </span>
      ))}
    </p>
  );
}

function FanLoveLegacy({ legacy }: { legacy: FanLoveLegacyEntry[] }) {
  if (legacy.length === 0) return null;
  return (
    <div>
      <Eyebrow>Fan Love legacy</Eyebrow>
      <div className="mt-2 divide-y divide-line/60">
        {legacy.map((e) => {
          const team = teamById(e.teamId) ?? { id: e.teamId, abbr: e.teamName.slice(0, 3), name: e.teamName };
          const style = TIER_STYLE[e.tier];
          return (
            <div key={e.teamId} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamLogo identity={getTeamIdentity(team)} size={22} />
                <span className="text-sm truncate">{e.teamName}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {style.icon && <span className="text-[13px]">{style.icon}</span>}
                <span className="font-display uppercase text-[15px] tracking-wide" style={{ color: style.color }}>
                  {e.tier}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CareerRecord({ t, legacy }: { t: CareerTotals; legacy: FanLoveLegacyEntry[] }) {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const achievements = [
    { l: "Championships", v: t.championships },
    { l: "Finals MVPs", v: t.finalsMvps },
    { l: "MVPs", v: t.mvps },
    { l: "All-Stars", v: t.allStars },
    { l: "All-NBA", v: t.allNba },
    { l: "Rookie of the Year", v: t.roty },
    { l: "NCAA titles", v: t.ncaaTitles },
    { l: "Olympic gold", v: t.olympicGolds },
    { l: "Olympic medals", v: t.olympicMedals },
  ].filter((x) => x.v > 0);

  return (
    <div className="space-y-9">
      <div>
        <Eyebrow>Career averages</Eyebrow>
        <div className="mt-2">
          <HeroStat value={t.ppg} label="PPG" />
          <StatRow items={[{ l: "RPG", v: t.rpg }, { l: "APG", v: t.apg }, { l: "SPG", v: t.spg }, { l: "BPG", v: t.bpg }]} />
          <StatRow items={[{ l: "FG%", v: t.fgPct }, { l: "3P%", v: t.tpPct }, { l: "FT%", v: t.ftPct }]} />
        </div>
        <p className="mt-2 text-[13px] text-mute">{t.seasons} seasons played</p>
      </div>

      <div>
        <Eyebrow>Career totals</Eyebrow>
        <div className="mt-2">
          <HeroStat value={k(t.totalPoints)} label="Points" />
          <StatRow
            items={[
              { l: "rebounds", v: k(t.totalRebounds) }, { l: "assists", v: k(t.totalAssists) },
              { l: "steals", v: k(t.totalSteals) }, { l: "blocks", v: k(t.totalBlocks) },
            ]}
          />
        </div>
        <p className="mt-2 text-[13px] text-mute">{t.games} games played</p>
      </div>

      {achievements.length > 0 && (
        <div>
          <Eyebrow>Achievements</Eyebrow>
          <div className="mt-2 divide-y divide-line/60">
            {achievements.map((x) => (
              <div key={x.l} className="flex justify-between py-2 text-sm">
                <span className="text-mute">{x.l}</span>
                <span className="stat-num text-amber">{x.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Eyebrow>Peaks</Eyebrow>
        <div className="mt-2">
          <HeroStat value={t.peakOvr} label="Peak OVR" />
          <StatRow items={[{ l: "peak PPG", v: t.peakPpg }, { l: "peak APG", v: t.peakApg }]} />
        </div>
      </div>

      <FanLoveLegacy legacy={legacy} />
    </div>
  );
}

function RivalCompare({ summary, rivalName }: { summary: CareerSummary; rivalName: string }) {
  const a = summary.player;
  const b = summary.rival;
  const rows: { label: string; a: number; b: number }[] = [
    { label: "PPG", a: a.ppg, b: b.ppg },
    { label: "RPG", a: a.rpg, b: b.rpg },
    { label: "APG", a: a.apg, b: b.apg },
    { label: "SPG", a: a.spg, b: b.spg },
    { label: "BPG", a: a.bpg, b: b.bpg },
    { label: "FG%", a: a.fgPct, b: b.fgPct },
    { label: "3P%", a: a.tpPct, b: b.tpPct },
    { label: "FT%", a: a.ftPct, b: b.ftPct },
    { label: "Points", a: a.totalPoints, b: b.totalPoints },
    { label: "Rebounds", a: a.totalRebounds, b: b.totalRebounds },
    { label: "Assists", a: a.totalAssists, b: b.totalAssists },
    { label: "Titles", a: a.championships, b: b.championships },
    { label: "Finals MVP", a: a.finalsMvps, b: b.finalsMvps },
    { label: "MVPs", a: a.mvps, b: b.mvps },
    { label: "All-Stars", a: a.allStars, b: b.allStars },
    { label: "NCAA titles", a: a.ncaaTitles, b: b.ncaaTitles },
    { label: "Olympic gold", a: a.olympicGolds, b: b.olympicGolds },
    { label: "Peak OVR", a: a.peakOvr, b: b.peakOvr },
    { label: "Seasons", a: a.seasons, b: b.seasons },
  ];

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 pb-2">
        <div className="text-right font-display uppercase text-lg leading-none">You</div>
        <div className="w-24" />
        <div className="font-display uppercase text-lg leading-none text-cool truncate">{rivalName}</div>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-line/50">
          <span className={`stat-num text-[15px] text-right ${r.a > r.b ? "text-amber" : "text-mute"}`}>{r.a}</span>
          <span className="eyebrow text-center w-24">{r.label}</span>
          <span className={`stat-num text-[15px] ${r.b > r.a ? "text-cool" : "text-mute"}`}>{r.b}</span>
        </div>
      ))}
    </div>
  );
}

function Moments({ state }: { state: CareerState }) {
  const moments = state.log.filter(
    (e) => e.type === "signature_moment" || e.type === "rivalry_encounter" || e.type === "career_move" || e.type === "award"
  );
  if (moments.length === 0) return <p className="text-mute text-sm">No headline moments this run.</p>;
  return (
    <div className="space-y-0">
      {moments.map((m, i) => (
        <div key={`${m.id}-${i}`} className="flex gap-3 py-2.5 border-b border-line/50">
          <span className="stat-num text-mute text-xs pt-0.5 w-8 shrink-0">S{m.season}</span>
          <p className="text-[14px] leading-snug flex-1">{m.narrative}</p>
        </div>
      ))}
    </div>
  );
}
