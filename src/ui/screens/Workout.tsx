import { useState } from "react";
import { CareerState } from "../../engine/career";
import { FocusKey } from "../../engine/focus";
import { ATTR_LABEL } from "../../engine/development";
import { MinigameKind, MINIGAME_NAME, modsFor } from "../../engine/minigameLibrary";
import { MinigameRound } from "../minigames/rounds";
import { Screen, Eyebrow, Title } from "../components/Shell";

// ============================================================
// DEVELOPMENT WORKOUT
//
// The offseason gym session. Win it and the season's development is boosted;
// lose it and NOTHING happens — no lost attributes, no regression, no penalty.
// This is why tic-tac-toe lives here now instead of in tournaments: it can
// cost you an opportunity, never a career.
// ============================================================

export function WorkoutScreen({
  state, focus, kind, onDone,
}: {
  state: CareerState;
  focus: FocusKey;
  kind: MinigameKind;
  onDone: (won: boolean) => void;
}) {
  const [phase, setPhase] = useState<"INTRO" | "PLAYING" | "RESULT">("INTRO");
  const [won, setWon] = useState(false);

  // Workouts sit at a fixed, fair difficulty — this isn't an elimination.
  const difficulty = 0.55;
  const spec = {
    index: 0,
    kind,
    difficulty,
    mods: modsFor(kind, state.player.attributes, difficulty),
  };

  if (phase === "INTRO") {
    return (
      <Screen>
        <div className="rise mt-10">
          <Eyebrow>Optional training</Eyebrow>
          <Title size="xl">{ATTR_LABEL[focus]}<br />workout</Title>
          <p className="mt-4 text-mute text-[15px] leading-relaxed">
            Win this and you'll get more out of the work you put in this year.
          </p>
          <p className="mt-2 text-mute text-[14px] leading-relaxed border-l-2 border-line pl-3">
            Lose and nothing bad happens — you just don't get the bonus. Your career is
            never at risk here.
          </p>
        </div>

        <div className="mt-8 rise rise-1">
          <Eyebrow>Challenge</Eyebrow>
          <div className="font-display uppercase text-[32px] leading-none mt-1">{MINIGAME_NAME[kind]}</div>
        </div>

        <div className="mt-auto pt-10 rise rise-2 space-y-2">
          <button className="btn-primary" onClick={() => setPhase("PLAYING")}>Get to work</button>
          <button
            className="w-full py-2.5 text-mute text-sm hover:text-bone transition-colors"
            onClick={() => onDone(false)}
          >
            Skip this session
          </button>
        </div>
      </Screen>
    );
  }

  if (phase === "RESULT") {
    return (
      <Screen>
        <div className="rise mt-14">
          <Eyebrow>{ATTR_LABEL[focus]} workout</Eyebrow>
          <h1
            className="mt-3 font-display uppercase text-[48px] leading-[0.9]"
            style={{ color: won ? "#E31E24" : "#8C8C8C" }}
          >
            {won ? "Work paid off" : "Not today"}
          </h1>
          <p className="mt-4 text-mute text-[15px] leading-relaxed">
            {won
              ? "You earned extra out of this season's development."
              : "No bonus this time. Nothing lost — your development still counts."}
          </p>
        </div>
        <div className="mt-auto pt-10 rise rise-1">
          <button className="btn-primary" onClick={() => onDone(won)}>Continue</button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{ATTR_LABEL[focus]} workout</div>
        <div className="eyebrow">No risk</div>
      </div>
      <div className="mt-10 flex-1">
        <MinigameRound
          spec={spec}
          onDone={(success) => { setWon(success); setPhase("RESULT"); }}
        />
      </div>
    </Screen>
  );
}
