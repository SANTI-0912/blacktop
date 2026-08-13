import { useState } from "react";
import { DraftBoard, DraftSlot, selectableSlots, realisticSlots } from "../../engine/draft";
import { Tournament } from "../../engine/tournament";
import { CareerState } from "../../engine/career";
import { getTeamIdentity, getNationIdentity } from "../../engine/identity";
import { TeamLogo } from "../components/TeamLogo";
import { Screen, Eyebrow, Title } from "../components/Shell";
import { CareerHeader } from "../components/CareerHeader";
import { PlayerStatus } from "../../engine/status";

/* ---------------- DRAFT NIGHT ---------------- */

function Flames({ n }: { n: number }) {
  return (
    <span className="text-[13px]" aria-label={n > 0 ? `${n} out of 3` : "none"}>
      <span aria-hidden="true">{n > 0 ? "🔥".repeat(n) : <span className="text-mute">—</span>}</span>
    </span>
  );
}

function draftNightReactionLine(status: PlayerStatus, teamName: string): string {
  if (status === "ALL_STAR" || status === "MVP_LEVEL" || status === "LEGEND") {
    return `Scouts had circled your name all year — ${teamName} fans already know it.`;
  }
  if (status === "ROTATION" || status === "STARTER") {
    return `You've been a recognizable name on draft boards all year — ${teamName} fans have been watching for this pick.`;
  }
  return `Barely a footnote on draft boards — ${teamName} will be introducing you to their fans from scratch.`;
}

export function DraftNight({
  board, status, onSign,
}: { board: DraftBoard; status: PlayerStatus; onSign: (slot: DraftSlot, wasRandom: boolean) => void }) {
  const [mode, setMode] = useState<"INTRO" | "CHOOSE" | "REVEAL">("INTRO");
  const [revealed, setRevealed] = useState<DraftSlot | null>(null);
  const [revealedWasRandom, setRevealedWasRandom] = useState(false);
  const [query, setQuery] = useState("");
  const options = selectableSlots(board);

  const goRandom = () => {
    const pool = realisticSlots(board);
    const slot = pool[Math.floor(Math.random() * pool.length)];
    setRevealed(slot);
    setRevealedWasRandom(true);
    setMode("REVEAL");
  };

  const chooseTeam = (slot: DraftSlot) => {
    setRevealed(slot);
    setRevealedWasRandom(false);
    setMode("REVEAL");
  };

  if (mode === "REVEAL" && revealed) {
    const id = getTeamIdentity(revealed.team);
    return (
      <Screen>
        <div className="rise mt-12 text-center">
          <p className="font-display uppercase tracking-wide text-[22px] leading-tight text-mute">
            With the #{revealed.pick} pick in the {board.year} NBA Draft
          </p>
          <div className="mt-8 flex justify-center">
            <TeamLogo identity={id} size={110} />
          </div>
          <h1 className="mt-6 font-display uppercase text-[52px] leading-[0.88]">{revealed.team.name}</h1>
          <p className="mt-4 text-mute text-sm">
            {revealed.expectedRole} · TEAM OVR {revealed.team.ovr} · {revealed.market} market
          </p>
          <p className="mt-2 text-mute text-[13px]">{draftNightReactionLine(status, revealed.team.name)}</p>
          <p className="mt-7 font-display uppercase text-[30px] text-amber">Welcome to the NBA.</p>
        </div>
        <div className="mt-auto pt-10 rise rise-2">
          <button className="btn-primary" onClick={() => onSign(revealed, revealedWasRandom)}>Start your rookie season</button>
        </div>
      </Screen>
    );
  }

  if (mode === "CHOOSE") {
    // Search across name, city and abbreviation — "Warriors", "Golden State"
    // and "GSW" all find the same team.
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter(
          (s) =>
            s.team.name.toLowerCase().includes(q) ||
            s.team.abbr.toLowerCase().includes(q) ||
            s.team.conference.toLowerCase().includes(q)
        )
      : options;

    return (
      <Screen>
        <div className="rise">
          <Eyebrow>{board.year} NBA Draft · projected #{board.projectedPick}</Eyebrow>
          <Title>Pick your destination</Title>
        </div>

        <div className="mt-5 rise rise-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NBA team…"
            aria-label="Search NBA team"
            className="w-full bg-transparent border-0 border-b border-line px-0 py-2 text-sm placeholder:text-mute/50 focus:border-amber outline-none"
          />
          <div className="eyebrow mt-2">{matches.length} of 30 teams</div>
        </div>

        <div className="mt-4 space-y-2.5 rise rise-1">
          {matches.length === 0 && (
            <p className="text-mute text-sm">No team matches that. Try a city, nickname or abbreviation.</p>
          )}
          {matches.map((s) => {
            const id = getTeamIdentity(s.team);
            return (
              <button key={s.team.id} className="btn" onClick={() => chooseTeam(s)}>
                <div className="flex items-center gap-3">
                  <TeamLogo identity={id} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display uppercase text-[19px] leading-tight truncate">{s.team.name}</div>
                    <div className="eyebrow mt-0.5">
                      Pick #{s.pick} · TEAM OVR {s.team.ovr}
                      {!s.interested && <span className="text-mute/60"> · reach</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-y-1 text-[12px]">
                  <span className="text-mute">Your role</span>
                  <span className="text-bone">{s.expectedRole}</span>
                  <span className="text-mute">Title window</span>
                  <Flames n={s.championshipWindow} />
                  <span className="text-mute">Competition</span>
                  <span className="text-bone">{s.competition}</span>
                  <span className="text-mute">Market</span>
                  <span className="text-bone">{s.market}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="rise mt-10">
        <Eyebrow>{board.year}</Eyebrow>
        <Title size="xl">Draft<br />night</Title>
        <p className="text-mute text-[15px] mt-4 leading-relaxed max-w-[90%]">
          You're projected to go around #{board.projectedPick}. Pick your destination, or let the
          board decide and see where the night takes you.
        </p>
      </div>

      <div className="mt-9 space-y-2.5 rise rise-1">
        <button className="btn" onClick={() => setMode("CHOOSE")}>
          <div className="font-display uppercase text-[21px] tracking-wide">Choose your team</div>
          <p className="text-[13px] text-mute mt-1">Build the career you want, on purpose.</p>
        </button>
        <button className="btn" onClick={goRandom}>
          <div className="font-display uppercase text-[21px] tracking-wide">Let the board decide</div>
          <p className="text-[13px] text-mute mt-1">Whoever calls your name, that's your story.</p>
        </button>
      </div>

      <div className="mt-9 rise rise-2">
        <Eyebrow>Draft order</Eyebrow>
        <div className="mt-2.5 space-y-1">
          {board.slots.slice(0, 8).map((s) => (
            <div key={s.team.id} className="flex items-center gap-2.5 py-1">
              <span className="stat-num text-mute text-xs w-5">{s.pick}</span>
              <TeamLogo identity={getTeamIdentity(s.team)} size={20} />
              <span className="text-[13px] flex-1 truncate">{s.team.name}</span>
              {s.pick === board.projectedPick && <span className="eyebrow text-amber">projected</span>}
            </div>
          ))}
        </div>
      </div>
    </Screen>
  );
}

/* ---------------- TOURNAMENT BRACKET ---------------- */

export function TournamentScreen({
  state, tournament, onPlay,
}: { state: CareerState; tournament: Tournament; onPlay: () => void }) {
  const isOly = tournament.kind === "OLYMPICS";
  const myId = isOly ? getNationIdentity(state.country) : getTeamIdentity(state.team);
  const myName = isOly ? state.country : state.team.name;
  const next = tournament.rounds[tournament.current];

  return (
    <Screen>
      <CareerHeader state={state} />
      <div className="rise">
        <Title size="xl">{tournament.title}</Title>
        <div className="mt-4 flex items-center gap-2.5">
          <TeamLogo identity={myId} size={22} />
          <span className="eyebrow">{myName}{tournament.seedLine ? ` · ${tournament.seedLine}` : ""}</span>
        </div>
      </div>

      <div className="mt-8 rise rise-1">
        <div className="divide-y divide-line/60">
          {tournament.rounds.map((r, i) => {
            const done = i < tournament.cleared;
            const isNext = i === tournament.current;
            return (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <div
                  className="w-1.5 h-9 rounded-sm shrink-0"
                  style={{ background: done ? "#E31E24" : isNext ? "#C9C9C9" : "#2A2A2A" }}
                />
                <div className="flex-1 min-w-0">
                  <div className={`font-display uppercase text-[17px] leading-tight ${isNext ? "" : done ? "text-mute" : "text-mute/50"}`}>
                    {r.label}
                  </div>
                  <div className="eyebrow mt-0.5 truncate">vs {r.opponent}</div>
                </div>
                {done && <span className="font-display uppercase text-sm text-amber">Won</span>}
                {isNext && <span className="font-display uppercase text-sm text-cool">Next</span>}
              </div>
            );
          })}
        </div>
      </div>

      {next && (
        <div className="mt-8 rise rise-2">
          <Eyebrow>Up next</Eyebrow>
          <div className="mt-1.5 font-display uppercase text-[34px] leading-[0.9]">{next.label}</div>
          <p className="text-sm text-mute mt-2 max-w-[90%]">
            {myName} vs {next.opponent}. {next.isFinal ? "Everything comes down to this." : "Lose and your season is over."}
          </p>
        </div>
      )}

      <div className="mt-9 rise rise-3">
        <button className="btn-primary" onClick={onPlay}>
          {next?.isFinal ? "Play the final" : "Take the floor"}
        </button>
      </div>
    </Screen>
  );
}
