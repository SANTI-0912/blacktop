import { CareerState, SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { DevelopmentResult, ATTR_LABEL } from "../../engine/development";
import { playerStatus } from "../../engine/status";
import { Screen, Eyebrow } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { FanLove } from "../components/FanLove";
import { FirstTimeHint } from "../components/FirstTimeHint";

/* ---------------- Development reveal ---------------- */
// Rare tiers get their own moment; ordinary years fold into the season report.

export function DevelopmentScreen({
  result, onNext,
}: { result: DevelopmentResult; onNext: () => void }) {
  const good = result.tier !== "REGRESSION" && result.tier !== "POOR";
  const tone = result.tier === "REGRESSION" ? "#FF4D3D" : good ? "#E31E24" : "#8C8C8C";
  const tierIcon =
    result.tier === "LEGENDARY" ? "🌟"
    : result.tier === "BREAKOUT" || result.tier === "RARE_BREAKOUT" ? "🔥"
    : result.tier === "NORMAL" || result.tier === "GOOD" ? "💪"
    : ""; // POOR/REGRESSION — no icon, the muted/red tone already carries it

  return (
    <Screen>
      <div className="rise mt-12">
        <Eyebrow>{tierIcon ? `${tierIcon} ` : ""}Development</Eyebrow>
        <h1 className="mt-2 font-display uppercase text-[52px] leading-[0.86]" style={{ color: tone }}>
          {result.title}
        </h1>
        <p className="mt-4 text-[17px] text-mute leading-relaxed">"{result.flavor}"</p>
      </div>

      <div className="mt-10 rise rise-1 space-y-2">
        {result.changes.map((c) => (
          <div key={String(c.attribute)} className="flex items-center justify-between py-2 border-b border-line/60">
            <span className="text-[15px]">{ATTR_LABEL[c.attribute]}</span>
            <span
              className="stat-num text-xl font-bold"
              style={{ color: c.delta > 0 ? "#E31E24" : "#FF4D3D" }}
            >
              {c.delta > 0 ? "+" : ""}{c.delta}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-10 rise rise-2">
        <button className="btn-primary" onClick={onNext}>Continue</button>
      </div>
    </Screen>
  );
}

/* ---------------- Season complete ---------------- */

export function SeasonComplete({
  state, conclusion, events, onNext,
}: {
  state: CareerState;
  conclusion: SeasonConclusion;
  events: CareerEvent[];
  onNext: () => void;
}) {
  const s = conclusion.stats;
  const stockTone =
    conclusion.draftStock === "RISING" ? "#E31E24"
    : conclusion.draftStock === "FALLING" ? "#FF4D3D" : "#8C8C8C";
  // The exact "what happened" text for a title, Game 7 win, etc. — more
  // specific and dramatic than the algorithmic headline, so prefer it when
  // one exists this season rather than showing both and repeating the point.
  const signatureMoment = events.find((e) => e.type === "signature_moment");
  // The rival's resolved outcome this season, Fan Love narrative-tier
  // crossings, and the rivalry line — all deferred until now so nothing is
  // seen before the player's own playoffs are done. This is the ONLY place
  // any of it is shown.
  const leagueNews = events.filter(
    (e) => e.type === "rival_update" || e.type === "rivalry_narrative" || e.type === "fanlove_milestone"
  );
  const status = playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed);

  return (
    <Screen>
      <CareerHeader state={state} />

      {/* THE MOMENT — everything else on this screen is footnotes to this. */}
      <div className="rise">
        <Eyebrow>Season complete</Eyebrow>
        <p className="mt-2 font-display uppercase text-[46px] leading-[0.86]">
          {signatureMoment ? signatureMoment.narrative : conclusion.headline}
        </p>
        {conclusion.lines.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {conclusion.lines.map((l) => (
              <p key={l} className="text-[14px] text-mute leading-snug">{l}</p>
            ))}
          </div>
        )}
      </div>

      {/* The stat line — one hero number, the rest as a quiet aside. */}
      <div className="mt-8 rise rise-1">
        <Eyebrow>Season stats</Eyebrow>
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="stat-num font-bold text-[44px] leading-none">{s.ppg}</span>
          <span className="eyebrow pb-0.5">PPG</span>
          <span className="stat-num text-[13px] text-mute ml-1">
            {s.rpg} RPG · {s.apg} APG · {s.teamWins}-{s.teamLosses}
          </span>
        </div>

        {conclusion.awards.length > 0 && (
          <p className="mt-4 text-amber text-[13px] tracking-wide uppercase font-display">
            {conclusion.awards.join("  ·  ")}
          </p>
        )}
      </div>

      <div className="mt-8 rise rise-1 space-y-3">
        <FirstTimeHint id="fan-love">
          Fan Love is how the city feels about you — it grows with playoff runs and awards, and
          resets (partly) if you change teams. Build it and you become the face of the franchise.
        </FirstTimeHint>
        <FanLove value={state.player.hidden.fanLove} teamName={state.team.name} status={status} />
      </div>

      {conclusion.decisions.length > 0 && (
        <div className="mt-8 rise rise-2">
          <Eyebrow>Decisions this season</Eyebrow>
          <div className="mt-2 space-y-4">
            {conclusion.decisions.map((d, i) => (
              <div key={`${d.title}-${i}`}>
                <div className="eyebrow">{d.title}</div>
                <p className="text-[14px] mt-1">
                  <span className="text-mute">You chose: </span>{d.choice}
                </p>
                <p className="text-[13px] text-mute mt-1 leading-snug">{d.result}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {conclusion.draftStock && (
        <div className="mt-8 rise rise-3 flex items-center justify-between">
          <span className="eyebrow">Draft stock</span>
          <span className="font-display uppercase text-xl" style={{ color: stockTone }}>
            {conclusion.draftStock}
          </span>
        </div>
      )}

      {leagueNews.length > 0 && (
        <div className="mt-8 rise rise-3">
          <Eyebrow>Around the league</Eyebrow>
          <div className="mt-2 space-y-3">
            {leagueNews.map((e) => (
              <p key={e.id} className="text-[13px] whitespace-pre-line leading-snug border-l-2 border-l-cool pl-3">
                {e.narrative}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 rise rise-3">
        <button className="btn-primary" onClick={onNext}>What's next</button>
      </div>
    </Screen>
  );
}
