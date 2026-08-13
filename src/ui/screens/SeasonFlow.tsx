import { useEffect, useState } from "react";
import { CareerEvent, SeasonStats } from "../../engine/types";
import { CareerState } from "../../engine/career";
import { BigDecision } from "../../engine/bigdecision";
import { WeekResult, BracketStep, ordinal } from "../../engine/schedule";
import { Screen, Eyebrow, Title } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { TeamLogo } from "../components/TeamLogo";
import { getTeamIdentity } from "../../engine/identity";
import { FirstTimeHint } from "../components/FirstTimeHint";

/* ---------------- The one big decision of the season ---------------- */
export function BigDecisionScreen({
  state, decision, onChoose,
}: { state: CareerState; decision: BigDecision; onChoose: (id: string) => void }) {
  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Eyebrow>{decision.kind === "TEAM_OFFER" ? "Your future" : "The call"}</Eyebrow>
        <p className="mt-2 font-display uppercase text-[32px] leading-[0.92]">{decision.prompt}</p>
      </div>

      <div className="mt-4 rise rise-1">
        <FirstTimeHint id="big-decision">
          This is the one call that shapes where your career goes next — new contract, trade, or
          free agency. Read the options carefully, there's no do-over once you pick.
        </FirstTimeHint>
      </div>

      <div className="mt-5 space-y-2.5 rise rise-1">
        {decision.kind === "TEAM_OFFER"
          ? decision.options.map((o) => {
              const fanLoveBullet = o.bullets.find((b) => b.includes("Fan Love"));
              const otherBullets = o.bullets.filter((b) => b !== fanLoveBullet);
              return (
                <button key={o.id} className="btn" onClick={() => onChoose(o.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TeamLogo identity={getTeamIdentity(o.team)} size={32} />
                      <span className="font-display uppercase text-[25px] leading-tight tracking-wide truncate">{o.headline}</span>
                    </div>
                    <span className="stat-num text-base text-amber shrink-0">TEAM OVR {o.team.ovr}</span>
                  </div>

                  {(o.salary !== undefined || fanLoveBullet) && (
                    <div className="mt-3.5 flex items-center gap-4 flex-wrap">
                      {o.salary !== undefined && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="stat-num text-[34px] font-bold text-amber leading-none">${o.salary}M</span>
                          <span className="text-[13px] text-mute">/yr · {o.years}y</span>
                        </div>
                      )}
                      {fanLoveBullet && (
                        <span className="text-[15px] text-bone/90 leading-snug flex-1 min-w-[140px]">
                          ❤️ {fanLoveBullet}
                        </span>
                      )}
                    </div>
                  )}

                  <ul className="mt-3 space-y-1">
                    {otherBullets.map((b) => (
                      <li key={b} className="text-[15px] text-mute flex gap-2">
                        <span className="text-line">—</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })
          : decision.options.map((o) => (
              <button key={o.id} className="btn" onClick={() => onChoose(o.id)}>
                <div className="font-display uppercase text-[19px] tracking-wide leading-tight">{o.label}</div>
                <p className="text-[13px] text-mute mt-1">{o.detail}</p>
              </button>
            ))}
      </div>
    </Screen>
  );
}

/* ---------------- Regular season ticker ---------------- */
export function SeasonSimScreen({
  state, weeks, stats, seedPlace, bracket, events, onNext, nextLabel,
}: {
  state: CareerState; weeks: WeekResult[]; stats: SeasonStats; seedPlace: number;
  bracket: BracketStep[]; events: CareerEvent[]; onNext: () => void; nextLabel: string;
}) {
  const [shown, setShown] = useState(0);
  const done = shown >= weeks.length;

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 220 : 55);
    return () => clearTimeout(id);
  }, [shown, done]);

  const pct = weeks.length > 0 ? Math.round((shown / weeks.length) * 100) : 100;
  const winsSoFar = weeks.slice(0, shown).filter((w) => w.result === "W").length;
  const conf = state.phase === "NCAA" ? "the conference" : `the ${state.team.conference}`;
  const rivalEvents = events.filter((e) => e.type === "rival_update");

  return (
    <Screen>
      <CareerHeader state={state} />

      {!done && (
        <div className="rise">
          <Eyebrow>Regular season</Eyebrow>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="stat-num font-bold text-[44px] leading-none">{winsSoFar}-{shown - winsSoFar}</span>
            <span className="eyebrow">{shown} / {weeks.length} weeks</span>
          </div>
          <div className="mt-3 h-1 bg-line rounded-sm overflow-hidden">
            <div className="h-full transition-[width] duration-150" style={{ width: `${pct}%`, background: "#E31E24" }} />
          </div>
        </div>
      )}

      {done && (
        <>
          <div className="rise">
            <Eyebrow>Final record</Eyebrow>
            <span className="stat-num font-bold text-[64px] leading-[0.85] block">
              {stats.teamWins}<span className="text-mute mx-1">–</span>{stats.teamLosses}
            </span>
            <p className="mt-1 text-mute text-sm">Finished {ordinal(seedPlace)} in {conf}.</p>

            <div className="mt-5 flex items-baseline gap-2.5">
              <span className="stat-num font-bold text-[36px] leading-none">{stats.ppg}</span>
              <span className="eyebrow pb-0.5">PPG</span>
              <span className="stat-num text-[13px] text-mute ml-1">{stats.rpg} RPG · {stats.apg} APG</span>
            </div>
          </div>

          {bracket.length > 0 && (
            <div className="mt-8 rise rise-1">
              <Eyebrow>Postseason</Eyebrow>
              <div className="mt-2 space-y-1.5">
                {bracket.map((b) => (
                  <div key={b.round} className="flex items-center justify-between py-1.5 border-b border-line/50">
                    <span className="text-[13px]">{b.label}</span>
                    <span
                      className="font-display uppercase text-sm tracking-wider"
                      style={{ color: b.won ? "#E31E24" : "#FF4D3D" }}
                    >
                      {b.won ? "Won" : "Lost"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rivalEvents.length > 0 && (
            <div className="mt-8 rise rise-2">
              <Eyebrow>Around the league</Eyebrow>
              <div className="mt-2 space-y-3">
                {rivalEvents.map((e) => (
                  <p key={e.id} className="text-[13px] text-mute whitespace-pre-line leading-snug border-l-2 border-l-cool pl-3">
                    {e.narrative}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-9 rise rise-3">
            <button className="btn-primary" onClick={onNext}>{nextLabel}</button>
          </div>
        </>
      )}
    </Screen>
  );
}

/* ---------------- Olympics bracket run ---------------- */
export function OlympicsScreen({
  nation, rounds, eliminated, onNext,
}: { nation: string; rounds: { label: string; result: string }[]; eliminated: boolean; onNext: () => void }) {
  return (
    <Screen>
      <div className="rise">
        <Eyebrow>International</Eyebrow>
        <Title size="xl">Olympic<br />Games</Title>
        <p className="mt-3 text-mute text-sm">You've been called up by {nation}.</p>
      </div>

      <div className="mt-8 rise rise-1 space-y-1.5">
        {rounds.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-line/60">
            <span className="text-sm">{r.label}</span>
            <span
              className="font-display uppercase text-sm tracking-wider"
              style={{ color: r.result === "Advanced" ? "#E31E24" : "#FF4D3D" }}
            >
              {r.result}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-9 rise rise-2">
        {eliminated ? (
          <>
            <p className="text-mute text-sm mb-4">Your tournament ends short of the medal round.</p>
            <button className="btn-primary" onClick={onNext}>Back to the season</button>
          </>
        ) : (
          <button className="btn-primary" onClick={onNext}>Gold medal game</button>
        )}
      </div>
    </Screen>
  );
}

/* ---------------- Season result / aftermath ---------------- */
export function SeasonResultScreen({
  events, onNext,
}: { events: CareerEvent[]; onNext: () => void }) {
  const headline = events.find((e) => e.type === "signature_moment");
  const rest = events.filter((e) => e !== headline && e.narrative);

  return (
    <Screen>
      {headline && (
        <div className="rise mt-6">
          <Eyebrow>Olympics Result</Eyebrow>
          <p className="mt-2 font-display uppercase text-[34px] leading-[0.95]">{headline.narrative}</p>
        </div>
      )}

      <div className="mt-8 space-y-3.5 rise rise-1">
        {rest.map((e) => {
          const accent =
            e.flags.includes("rival_involved") || e.type === "rival_update"
              ? "#C9C9C9"
              : e.type === "award" || e.type === "career_move" || e.type === "decision"
              ? "#E31E24"
              : "#2A2A2A";
          return (
            <p key={e.id} className="text-[13px] whitespace-pre-line leading-snug border-l-2 pl-3" style={{ borderColor: accent }}>
              {e.narrative}
            </p>
          );
        })}
      </div>

      <div className="mt-9 rise rise-2">
        <button className="btn-primary" onClick={onNext}>Next season</button>
      </div>
    </Screen>
  );
}
