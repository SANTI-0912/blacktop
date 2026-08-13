import { useState } from "react";
import { NCAA_TEAMS, collegeProfile } from "../../engine/teams";
import { FocusKey } from "../../engine/focus";
import { DevelopmentOptionView, pickAttrFlavor, classifyDevRarity } from "../../engine/development";
import { CareerState } from "../../engine/career";
import { Screen, Eyebrow, Title } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { getTeamIdentity } from "../../engine/identity";
import { TeamLogo } from "../components/TeamLogo";
import { GameEvent } from "../../engine/events";
import { FirstTimeHint } from "../components/FirstTimeHint";

/* ---------------- 1. Choose your program ---------------- */

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-[0.15em] text-[13px]" style={{ color: "#E31E24" }} aria-label={`${n} out of 5`}>
      <span aria-hidden="true">
        {"★".repeat(n)}
        <span className="text-line">{"★".repeat(5 - n)}</span>
      </span>
    </span>
  );
}

export function TeamSelect({
  incomingOvr, onPick,
}: { incomingOvr: number; onPick: (teamId: string) => void }) {
  const [mode, setMode] = useState<"INTRO" | "LIST">("INTRO");
  const profiles = NCAA_TEAMS.map((t) => collegeProfile(t, incomingOvr)).sort((a, b) => b.prestige - a.prestige);

  if (mode === "INTRO") {
    return (
      <Screen>
        <div className="rise mt-10">
          <Eyebrow>Recruiting</Eyebrow>
          <Title size="xl">Where does<br />it start?</Title>
          <p className="text-mute text-[15px] mt-4 leading-relaxed max-w-[90%]">
            A blue blood gives you elite teammates and a title shot, but you'll have to earn
            minutes. A smaller program hands you the offense on day one.
          </p>
        </div>
        <div className="mt-10 space-y-2.5 rise rise-1">
          <button className="btn" onClick={() => setMode("LIST")}>
            <div className="font-display uppercase text-[21px] tracking-wide">Choose your college</div>
            <p className="text-[13px] text-mute mt-1">Pick the program that fits the career you want.</p>
          </button>
          <button
            className="btn"
            onClick={() => onPick(NCAA_TEAMS[Math.floor(Math.random() * NCAA_TEAMS.length)].id)}
          >
            <div className="font-display uppercase text-[21px] tracking-wide">Random college</div>
            <p className="text-[13px] text-mute mt-1">Take whatever offer comes and make it work.</p>
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="rise">
        <Eyebrow>Recruiting</Eyebrow>
        <Title size="xl">Choose your<br />program</Title>
      </div>

      <div className="mt-7 space-y-2.5 rise rise-1">
        {profiles.map((p) => (
          <button key={p.team.id} className="btn" onClick={() => onPick(p.team.id)}>
            <div className="flex items-center gap-3">
              <TeamLogo identity={getTeamIdentity(p.team)} size={42} />
              <div className="flex-1 min-w-0">
                <span className="font-display uppercase text-[20px] leading-tight tracking-wide block truncate">
                  {p.team.name}
                </span>
                <span className="eyebrow">{p.team.conference}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="stat-num text-sm text-amber">{p.team.ovr}</div>
                <div className="eyebrow">TEAM OVR</div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-y-1 text-[12px]">
              <span className="text-mute">Prestige</span>
              <Stars n={p.prestige} />
              <span className="text-mute">Competition</span>
              <Stars n={p.competition} />
              <span className="text-mute">Your role</span>
              <span className="text-bone">{p.expectedRole}</span>
              <span className="text-mute">Pressure</span>
              <span style={{ color: p.pressure === "Extreme" || p.pressure === "High" ? "#FF4D3D" : "#8C8C8C" }}>
                {p.pressure}
              </span>
            </div>

            <p className="text-[13px] text-mute mt-2 leading-snug">{p.pitch}</p>
          </button>
        ))}
      </div>
    </Screen>
  );
}

/* ---------------- 2. Season focus ---------------- */

export function DevelopmentSelect({
  state, options, onChoose,
}: { state: CareerState; options: DevelopmentOptionView[]; onChoose: (f: FocusKey) => void }) {
  const [selected, setSelected] = useState<FocusKey | null>(null);

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Title>Choose your focus</Title>
        <p className="text-mute text-sm mt-2.5 leading-relaxed max-w-[90%]">
          What part of your game will you develop this season? This sets the direction of
          your career — not its ceiling.
        </p>
      </div>

      <div className="mt-4 rise rise-1">
        <FirstTimeHint id="dev-focus">
          This is the one attribute you're actively training this season. Everything else can
          still grow on its own, just slower — this just decides where the biggest jump lands.
        </FirstTimeHint>
      </div>

      <div className="mt-5 space-y-2 rise rise-1">
        {options.map((o) => {
          const on = selected === o.attribute;
          const rarity = classifyDevRarity(o.delta);
          return (
            <button
              key={o.attribute}
              aria-pressed={on}
              onClick={() => setSelected(o.attribute)}
              className={`w-full text-left px-4 py-4 border rounded-sm transition-colors ${
                on ? "border-amber bg-amber/10" : "border-line hover:border-mute/50"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display uppercase text-2xl tracking-wide">{o.label}</span>
                <span className="stat-num text-lg text-amber font-bold">+{o.delta}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2 stat-num text-[13px] text-mute">
                  <span>{o.from}</span>
                  <span className="text-line">→</span>
                  <span className={on ? "text-amber font-bold" : "text-bone"}>{o.to}</span>
                </div>
                {rarity && (
                  <div className="flex items-center gap-1">
                    {rarity === "RARE" && <span className="text-[11px]">💎</span>}
                    <span
                      className="eyebrow text-[10px]"
                      style={{ color: rarity === "RARE" ? "#A78BFA" : "#8C8C8C" }}
                    >
                      {rarity}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-mute leading-snug">
                {pickAttrFlavor(o.attribute, state.season)}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-7 rise rise-2">
        <button
          className="btn-primary disabled:opacity-30"
          disabled={!selected}
          onClick={() => selected && onChoose(selected)}
        >
          Commit to the work
        </button>
      </div>
    </Screen>
  );
}

/* ---------------- 3. In-season event ---------------- */

export function SeasonEventScreen({
  state, event, prompt, onChoose,
}: { state: CareerState; event: GameEvent; prompt: string; onChoose: (id: string) => void }) {
  return (
    <Screen>
      <div className="rise">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Age {state.age} · Season {state.season}</Eyebrow>
          <Eyebrow>{event.category.toLowerCase()}</Eyebrow>
        </div>
        <div className="mt-5 flex items-center gap-2.5">
          <TeamLogo identity={getTeamIdentity(state.team)} size={22} />
          <span className="eyebrow">{state.team.name}</span>
        </div>
        <p className="mt-4 font-display uppercase text-[30px] leading-[0.95]">{prompt}</p>
      </div>

      <div className="mt-8 space-y-2 rise rise-1">
        {event.options.map((o) => (
          <button key={o.id} className="btn" onClick={() => onChoose(o.id)}>
            <div className="font-display uppercase text-[19px] tracking-wide leading-tight">{o.label}</div>
            <p className="text-[13px] text-mute mt-1">{o.detail}</p>
          </button>
        ))}
      </div>
    </Screen>
  );
}
