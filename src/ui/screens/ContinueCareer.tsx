import { CareerState, playerOvr } from "../../engine/career";
import { getTeamIdentity } from "../../engine/identity";
import { TeamLogo } from "../components/TeamLogo";
import { Screen, Eyebrow, Title } from "../components/Shell";

/** Shown on load only when a saved career exists — the choice of whether
 * to pick it back up or wipe it and start over belongs to the player, not
 * something the app should decide silently either way. */
export function ContinueCareer({
  state, onContinue, onNewCareer,
}: { state: CareerState; onContinue: () => void; onNewCareer: () => void }) {
  const id = getTeamIdentity(state.team);
  const ovr = playerOvr(state);

  return (
    <Screen>
      <div className="rise mt-14">
        <Eyebrow>Career in progress</Eyebrow>
        <Title size="xl">Welcome<br />back</Title>
      </div>

      <div className="mt-9 rise rise-1 flex items-center gap-3.5 border border-line rounded-sm p-4">
        <TeamLogo identity={id} size={48} />
        <div className="min-w-0 flex-1">
          <div className="font-display uppercase text-[24px] leading-tight truncate">{state.player.name}</div>
          <div className="eyebrow mt-0.5 truncate">
            {state.team.name} · Season {state.season} · Age {state.age}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="stat-num text-2xl font-bold text-amber leading-none">{ovr}</div>
          <div className="eyebrow mt-1">OVR</div>
        </div>
      </div>

      <div className="mt-9 space-y-2.5 rise rise-2">
        <button className="btn-primary" onClick={onContinue}>Continue this career</button>
        <button className="btn" onClick={onNewCareer}>
          <div className="font-display uppercase text-[17px] tracking-wide">Start a new career</div>
          <p className="text-[12px] text-mute mt-1">This will erase your saved progress with {state.player.name}.</p>
        </button>
      </div>
    </Screen>
  );
}
