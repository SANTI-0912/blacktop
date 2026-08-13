import { useState } from "react";
import { Gauntlet, GauntletOutcome, MINIGAME_NAME } from "../../engine/minigameLibrary";
import { ChallengeConfig, DIFFICULTY_COPY } from "../../engine/challenge";
import { MinigameRound } from "../minigames/rounds";
import { getTeamIdentity, getNationIdentity } from "../../engine/identity";
import { teamById } from "../../engine/teams";
import { TeamLogo } from "../components/TeamLogo";

type LevelInfo = {
  label: string; opponent: string; opponentId: string | null;
  nextLabel: string | null; isFinal: boolean;
};

// Crest for either a real club or a national side, so Olympic rounds work too.
function crestFor(id: string | null, name: string) {
  const team = id ? teamById(id) : null;
  return team ? getTeamIdentity(team) : getNationIdentity(name);
}

// ============================================================
// THE GAUNTLET
// Survive progressive rounds. Fail one and the run ends there — how far you
// got decides the event. This is the only place the player actually plays.
// ============================================================

type Phase = "INTRO" | "ROUND_INTRO" | "PLAYING" | "ROUND_RESULT" | "DONE";

export function GauntletScreen({
  config, gauntlet, levelLabels, levels, playerTeamName, playerTeamId, onFinish,
}: {
  config: ChallengeConfig;
  gauntlet: Gauntlet;
  /** Bracket stage name per level, so each level reads as a real round. */
  levelLabels?: string[];
  /** Matchup per level — opponent, crest, and what advancing wins you. */
  levels?: LevelInfo[];
  playerTeamName?: string;
  playerTeamId?: string | null;
  onFinish: (outcome: GauntletOutcome) => void;
}) {
  const [phase, setPhase] = useState<Phase>("INTRO");
  const [index, setIndex] = useState(0);
  const [survived, setSurvived] = useState(0);
  const [eliminated, setEliminated] = useState(false);

  const total = gauntlet.rounds.length;
  const round = gauntlet.rounds[index];
  const cleared = survived >= gauntlet.roundsToWin;

  const finish = (elim: boolean, count: number) => {
    setEliminated(elim);
    setSurvived(count);
    setPhase("DONE");
  };

  const handleRound = (success: boolean) => {
    if (success) {
      const next = survived + 1;
      setSurvived(next);
      if (index + 1 >= total) { finish(false, next); return; }
      setPhase("ROUND_RESULT");
    } else {
      finish(true, survived);
    }
  };

  const advance = () => {
    setIndex((i) => i + 1);
    setPhase("ROUND_INTRO");
  };

  /* ---------- Intro ---------- */
  if (phase === "INTRO") {
    return (
      <Frame>
        <div className="rise">
          <div className="font-display uppercase text-[13px] tracking-[0.3em] text-heat">{config.eventTitle}</div>
          <div className="mt-5 py-5 border-y border-line">
            <div className="font-display uppercase text-[36px] leading-[0.95]">{config.homeTeam}</div>
            <div className="eyebrow my-1.5">versus</div>
            <div className="font-display uppercase text-[36px] leading-[0.95] text-cool">{config.awayTeam}</div>
          </div>
          <div className="mt-4 eyebrow">{config.seriesLine}</div>
          <p className="mt-5 text-[17px] leading-snug">{config.flavor}</p>
          <p className="mt-3 text-mute text-[15px] leading-relaxed border-l-2 border-line pl-3">
            {DIFFICULTY_COPY[config.difficulty]}
          </p>
        </div>

        <div className="mt-7 rise rise-1">
          <div className="eyebrow">Challenge</div>
          <div className="font-display uppercase text-[30px] leading-none mt-1">
            {gauntlet.varied ? "Mixed gauntlet" : MINIGAME_NAME[gauntlet.headlineKind]}
          </div>
          <p className="text-[13px] text-mute mt-2">
            One continuous challenge. {total} levels, each harder than the last.
            Miss one and your run ends there.
          </p>
          {levelLabels && (
            <div className="mt-3 space-y-1">
              {levelLabels.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="stat-num text-mute w-10">LVL {i + 1}</span>
                  <span className="text-mute">{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto pt-8 rise rise-2">
          <button className="btn-primary" onClick={() => setPhase("ROUND_INTRO")}>Start</button>
        </div>
      </Frame>
    );
  }

  /* ---------- Result ---------- */
  if (phase === "DONE") {
    const success = cleared;
    return (
      <Frame>
        <div className="rise">
          <div className="eyebrow">{config.eventTitle}</div>
          <div
            className="mt-3 font-display uppercase text-[50px] leading-[0.9]"
            style={{ color: success ? "#E31E24" : "#FF4D3D" }}
          >
            {success ? "Champions" : eliminated ? "Eliminated" : "Runner-up"}
          </div>
          <p className="mt-4 text-mute text-[15px]">
            {survived < total && levels?.[survived]
              ? `${levels[survived].label} — ${levels[survived].opponent} end your run.`
              : `You cleared all ${total} levels.`}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap gap-1.5 rise rise-1">
          {gauntlet.rounds.map((_, i) => (
            <div
              key={i}
              className="w-8 h-8 border rounded-xs"
              style={{
                borderColor: i < survived ? "#E31E24" : "#2A2A2A",
                background: i < survived ? "rgba(227,30,36,.25)" : "transparent",
              }}
            />
          ))}
        </div>

        <div className="mt-auto pt-10 rise rise-2">
          <button
            className="btn-primary"
            onClick={() =>
              onFinish({
                roundsSurvived: survived,
                roundsTotal: total,
                eliminated,
                kinds: gauntlet.rounds.map((r) => r.kind),
              })
            }
          >
            Continue
          </button>
        </div>
      </Frame>
    );
  }

  /* ---------- Round shell ---------- */
  return (
    <Frame>
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{config.eventTitle}</div>
        <div className="eyebrow">Level {index + 1} / {total}</div>
      </div>

      <div className="mt-3 flex gap-1">
        {gauntlet.rounds.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1.5 rounded-sm"
            style={{ background: i < survived ? "#E31E24" : i === index ? "#C9C9C9" : "#2A2A2A" }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between eyebrow">
        <span style={{ color: cleared ? "#E31E24" : undefined }}>{survived} survived</span>
        <span>{gauntlet.roundsToWin} to win</span>
      </div>

      <div className="mt-8 flex-1">
        {phase === "ROUND_INTRO" && (() => {
          const lv = levels?.[index];
          return (
            <div className="rise">
              <div className="eyebrow">{lv?.label ?? levelLabels?.[index] ?? `Level ${index + 1}`}</div>

              {lv ? (
                <>
                  {/* The matchup — real teams, real crests */}
                  <div className="mt-4 flex items-center gap-3">
                    {playerTeamName && (
                      <TeamLogo identity={crestFor(playerTeamId ?? null, playerTeamName)} size={40} />
                    )}
                    <span className="font-display uppercase text-[24px] leading-none flex-1 truncate">
                      {playerTeamName}
                    </span>
                  </div>
                  <div className="eyebrow my-2 pl-1">versus</div>
                  <div className="flex items-center gap-3">
                    <TeamLogo identity={crestFor(lv.opponentId, lv.opponent)} size={40} />
                    <span className="font-display uppercase text-[24px] leading-none flex-1 truncate text-cool">
                      {lv.opponent}
                    </span>
                  </div>

                  <div className="mt-5 py-3 border-y border-line space-y-1">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-mute">Win</span>
                      <span className="text-amber font-display uppercase tracking-wide">
                        {lv.nextLabel ?? (lv.isFinal ? "Championship" : "Advance")}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-mute">Lose</span>
                      <span className="text-heat font-display uppercase tracking-wide">Season over</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="font-display uppercase text-[34px] leading-none mt-1">Level {index + 1}</div>
              )}

              <p className="eyebrow mt-4">
                {MINIGAME_NAME[round.kind]} · Level {index + 1} / {total}
              </p>
              <p className="text-mute text-sm mt-2">
                {round.difficulty > 0.75 ? "This is where it gets brutal."
                  : round.difficulty > 0.4 ? "Tighter than the last one."
                  : "Settle in."}
              </p>
              <button className="btn-primary mt-7" onClick={() => setPhase("PLAYING")}>Tip off</button>
            </div>
          );
        })()}

        {phase === "PLAYING" && (
          <MinigameRound key={`${index}-${round.kind}`} spec={round} onDone={handleRound} />
        )}

        {phase === "ROUND_RESULT" && (() => {
          const lv = levels?.[index];
          return (
            <div className="rise">
              <div className="font-display uppercase text-[38px] leading-[0.95] text-amber">
                {lv ? `You beat ${lv.opponent}` : "Survived"}
              </div>
              {lv?.nextLabel && (
                <p className="mt-4 font-display uppercase text-[22px] text-bone">{lv.nextLabel}</p>
              )}
              <p className="mt-3 text-mute text-sm">
                {lv?.nextLabel ? "It gets harder from here." : "One more to go."}
              </p>
              <button className="btn-primary mt-8" onClick={advance}>Continue the run</button>
            </div>
          );
        })()}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex justify-center bg-ink">
      <div className="w-full max-w-md px-5 pt-8 pb-10 flex flex-col">{children}</div>
    </div>
  );
}
