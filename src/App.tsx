import { useEffect, useState } from "react";
import { CareerEvent, Playstyle, Position, SeasonStats } from "./engine/types";
import {
  CareerState, CareerSummary, initCareer, getBigDecision, applyBigDecision, chooseFocus,
  runSeason, finishSeason, startOlympics, finishOlympics, buildCareerSummary,
  currentRoundChallenge, resolveTournamentRound, RoundChallenge,
  signDraftPick, getPreseasonEvent, getMidseasonEvent, applySeasonEvent, SeasonEventView,
  SeasonConclusion, workoutMinigame, setWorkoutResult, hasWorkoutOpportunity,
  tournamentThreadCheck, getSeasonDevelopmentOptions,
} from "./engine/career";
import { ThreadResolution } from "./engine/threads";
import { WorkoutScreen } from "./ui/screens/Workout";
import { ConsequenceScreen } from "./ui/screens/Consequence";
import { DevelopmentResult } from "./engine/development";
import { DevelopmentScreen, SeasonComplete } from "./ui/screens/SeasonComplete";
import { computeOverall } from "./engine/overall";
import { createPlayer } from "./engine/player";
import { createRNG } from "./engine/rng";
import { BigDecision, bigDecisionConsequence } from "./engine/bigdecision";
import { playerStatus } from "./engine/status";
import { GauntletOutcome } from "./engine/minigameLibrary";
import { DraftSlot } from "./engine/draft";
import { FocusKey } from "./engine/focus";
import { WeekResult, BracketStep } from "./engine/schedule";
import { Creation } from "./ui/screens/Creation";
import { ContinueCareer } from "./ui/screens/ContinueCareer";
import { HowToPlay } from "./ui/screens/HowToPlay";
import { saveCareer, loadCareer, clearCareer } from "./engine/save";
import { hasSeenIntro, markIntroSeen } from "./engine/onboarding";
import { TeamSelect, DevelopmentSelect, SeasonEventScreen } from "./ui/screens/Onboarding";
import { CareerHub } from "./ui/screens/CareerHub";
import { BigDecisionScreen, SeasonSimScreen, SeasonResultScreen } from "./ui/screens/SeasonFlow";
import { Celebration, CelebrationEntry, buildSeasonCelebrations } from "./ui/screens/Celebration";
import { GauntletScreen } from "./ui/screens/Gauntlet";
import { DraftNight, TournamentScreen } from "./ui/screens/DraftAndTournament";
import { SummaryScreen } from "./ui/screens/Summary";

type Stage =
  | "continue" | "how_to_play" | "creation" | "team_select" | "hub" | "focus" | "decision" | "event"
  | "workout" | "season" | "tournament" | "consequence" | "round" | "result" | "development" | "season_complete"
  | "celebration" | "draft" | "summary";

type PlayerInput = { name: string; country: string; position: Position; height: number; playstyle: Playstyle };
type SeasonView = { weeks: WeekResult[]; stats: SeasonStats; seedPlace: number; bracket: BracketStep[]; events: CareerEvent[] };

export default function App() {
  // Computed once, at mount — a save written mid-session (by this same tab)
  // is picked up through the `state`/`stage` values themselves, not by
  // re-reading storage. A returning career always wins over the intro; the
  // intro only gates a genuinely fresh start, and only the first time ever.
  const [savedCareer] = useState<CareerState | null>(() => loadCareer());
  const [stage, setStage] = useState<Stage>(() => {
    if (savedCareer) return "continue";
    return hasSeenIntro() ? "creation" : "how_to_play";
  });
  const [pending, setPending] = useState<{ input: PlayerInput; seed: number; ovr: number } | null>(null);
  const [state, setState] = useState<CareerState | null>(null);
  const [decision, setDecision] = useState<BigDecision | null>(null);
  const [seasonEvent, setSeasonEvent] = useState<SeasonEventView | null>(null);
  const [seasonView, setSeasonView] = useState<SeasonView | null>(null);
  const [roundChallenge, setRoundChallenge] = useState<RoundChallenge | null>(null);
  const [resultEvents, setResultEvents] = useState<CareerEvent[]>([]);
  const [summary, setSummary] = useState<CareerSummary | null>(null);
  const [olympicsPending, setOlympicsPending] = useState(false);
  const [development, setDevelopment] = useState<DevelopmentResult | null>(null);
  const [conclusion, setConclusion] = useState<SeasonConclusion | null>(null);
  const [seasonYear, setSeasonYear] = useState<number>(2026);
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEntry[]>([]);
  const [celebrationFrom, setCelebrationFrom] = useState<"season" | "olympics" | null>(null);
  const [olympicsGoldPending, setOlympicsGoldPending] = useState(false);
  const [eventPhase, setEventPhase] = useState<"pre" | "mid" | null>(null);
  const [threadNote, setThreadNote] = useState<ThreadResolution | null>(null);

  // Autosave at the Career Hub only — the one point in the season loop
  // every other stage eventually funnels back through, and the only one
  // safe to resume into without reconstructing transient view state (an
  // in-progress event, minigame, or decision).
  useEffect(() => {
    if (stage === "hub" && state) saveCareer(state);
  }, [stage, state]);

  const continueCareer = () => {
    if (!savedCareer) return;
    setState(savedCareer);
    setStage("hub");
  };

  const startNewCareer = () => {
    clearCareer();
    setStage("creation");
  };

  const finishIntro = () => {
    markIntroSeen();
    setStage("creation");
  };

  const openHowToPlay = () => setStage("how_to_play");

  const createdPlayer = (input: PlayerInput) => {
    const seed = Math.floor(Math.random() * 1_000_000);
    const probe = createPlayer(createRNG(seed), input);
    setPending({ input, seed, ovr: computeOverall(probe.attributes, probe.playstyle) });
    setStage("team_select");
  };

  const pickedCollege = (teamId: string) => {
    if (!pending) return;
    setState(initCareer(pending.seed, { ...pending.input, collegeTeamId: teamId }));
    setStage("hub");
  };

  const proceedToSeasonEvents = (s: CareerState) => {
    const ev = getPreseasonEvent(s);
    if (ev) { setSeasonEvent(ev); setEventPhase("pre"); setStage("event"); return; }
    playSeason(s);
  };

  const pickFocus = (f: FocusKey) => {
    if (!state) return;
    const s2 = chooseFocus(state, f);
    setState(s2);
    if (hasWorkoutOpportunity(s2)) {
      setStage("workout");
      return;
    }
    proceedToSeasonEvents(s2);
  };

  const finishWorkout = (won: boolean) => {
    if (!state) return;
    const s2 = setWorkoutResult(state, won);
    setState(s2);
    proceedToSeasonEvents(s2);
  };

  const chooseEvent = (optionId: string) => {
    if (!state || !seasonEvent) return;
    const s2 = applySeasonEvent(state, seasonEvent.event, optionId);
    setState(s2);
    setSeasonEvent(null);
    if (eventPhase === "mid") {
      setEventPhase(null);
      if (s2.tournament) { setStage("tournament"); return; }
      completeSeason(s2);
      return;
    }
    setEventPhase(null);
    playSeason(s2);
  };

  const playSeason = (s: CareerState) => {
    const run = runSeason(s);
    setState(run.state);
    setSeasonView({ weeks: run.weeks, stats: run.stats, seedPlace: run.seedPlace, bracket: run.bracket, events: run.events });
    setStage("season");
  };

  // After the regular-season report: a personal-side decision may be due
  // now that the season is actually underway, THEN enter the bracket or
  // wrap the season.
  const afterSeasonReport = () => {
    if (!state) return;
    const ev = getMidseasonEvent(state);
    if (ev) { setSeasonEvent(ev); setEventPhase("mid"); setStage("event"); return; }
    if (state.tournament) { setStage("tournament"); return; }
    completeSeason();
  };

  const playRound = () => {
    if (!state) return;
    // A consequence waiting on a tournament fires before the run begins.
    const checked = tournamentThreadCheck(state);
    if (checked.resolution) {
      setState(checked.state);
      setThreadNote(checked.resolution);
      setStage("consequence");
      return;
    }
    const c = currentRoundChallenge(state);
    if (!c) { completeSeason(); return; }
    setRoundChallenge(c);
    setStage("round");
  };

  const finishRound = (outcome: GauntletOutcome) => {
    if (!state || !roundChallenge) return;
    const res = resolveTournamentRound(state, roundChallenge, outcome);
    setState(res.state);
    setRoundChallenge(null);
    if (res.tournamentOver) {
      // Olympics wrap up on their own track; club seasons continue to results.
      if (res.state.phase === "OLYMPICS") {
        const { state: done, events: olympicsEvents, year: olympicsYear } = finishOlympics(res.state);
        setState(done);
        setResultEvents(olympicsEvents);
        setSeasonYear(olympicsYear);
        // Set once, here, at the exact moment gold is confirmed — never
        // inferred later from resultEvents' contents, which get reused for
        // other things. afterResult clears this the instant it reads it.
        setOlympicsGoldPending(olympicsEvents.some((e) => e.flags.includes("olympic_gold")));
        setStage("result");
        return;
      }
      completeSeason(res.state);
      return;
    }
    setStage("tournament");
  };

  const completeSeason = (override?: CareerState) => {
    const base = override ?? state;
    if (!base) return;
    const end = finishSeason(base, null);
    setState(end.state);
    setResultEvents(end.events);
    setOlympicsPending(end.olympicsNext);
    setDevelopment(end.development);
    setConclusion(end.conclusion);
    setSeasonYear(end.year);
    if (end.careerOver) {
      setSummary(buildCareerSummary(end.state));
      clearCareer(); // this career is done — never offer it as "Continue" again
    }
    // Rare development tiers earn their own screen before the season report.
    setStage(end.development?.special ? "development" : "season_complete");
  };

  const proceedAfterResult = () => {
    if (!state) return;
    if (summary) { setStage("summary"); return; }
    if (state.phase === "DRAFT" && state.draftBoard) { setStage("draft"); return; }
    if (olympicsPending) {
      setState(startOlympics(state));
      setOlympicsPending(false);
      setStage("tournament");
      return;
    }
    setStage("hub");
  };

  const afterResult = () => {
    if (!state) return;
    if (olympicsGoldPending) {
      setOlympicsGoldPending(false);
      setCelebrationQueue([{ key: "OLYMPIC_GOLD", year: seasonYear }]);
      setCelebrationFrom("olympics");
      setStage("celebration");
      return;
    }
    proceedAfterResult();
  };

  const nextCelebration = () => {
    const rest = celebrationQueue.slice(1);
    if (rest.length > 0) {
      setCelebrationQueue(rest);
      return;
    }
    setCelebrationQueue([]);
    const from = celebrationFrom;
    setCelebrationFrom(null);
    if (from === "olympics") { proceedAfterResult(); return; }
    proceedAfterSeasonComplete();
  };

  const proceedAfterSeasonComplete = () => {
    if (!state) return;
    if (summary || (state.phase === "DRAFT" && state.draftBoard)) {
      // Career just ended, or the player is draft-bound — no free-agency call this transition.
      afterResult();
      return;
    }
    setDecision(getBigDecision(state));
    setStage("decision");
  };

  const afterSeasonComplete = () => {
    if (!state || !conclusion) { proceedAfterSeasonComplete(); return; }
    const queue = buildSeasonCelebrations(conclusion, resultEvents, seasonYear);
    if (queue.length > 0) {
      setCelebrationQueue(queue);
      setCelebrationFrom("season");
      setStage("celebration");
      return;
    }
    proceedAfterSeasonComplete();
  };

  // The decision's conclusion never gets its own interrupting screen — it's
  // folded into the same end-of-season report (SeasonResultScreen) as one
  // more narrative line, alongside awards, milestones, and everything else
  // that happened this season.
  const chooseDecision = (id: string) => {
    if (!state || !decision) return;
    const beforeTeamId = state.team.id;
    const s2 = applyBigDecision(state, id, decision);
    setState(s2);
    const moved = decision.kind === "TEAM_OFFER" && s2.team.id !== beforeTeamId;
    const status = playerStatus(s2.player.hidden.reputation, s2.player.awards, s2.nbaSeasonsPlayed);
    const text = bigDecisionConsequence(decision, id, moved, s2.team.name, status);
    if (text) {
      setResultEvents((prev) => [
        ...prev,
        {
          id: `bigdecision_${s2.season}`,
          season: s2.season,
          type: decision.kind === "TEAM_OFFER" ? "career_move" : "decision",
          narrative: text,
          flags: ["big_decision"],
        },
      ]);
    }
    setStage("result");
  };

  const draftSigned = (slot: DraftSlot) => {
    if (!state) return;
    setState(signDraftPick(state, slot));
    setStage("hub");
  };

  const restart = () => {
    clearCareer();
    setState(null); setPending(null); setDecision(null); setSeasonEvent(null);
    setSeasonView(null); setRoundChallenge(null); setResultEvents([]);
    setSummary(null); setOlympicsPending(false);
    setDevelopment(null); setConclusion(null); setEventPhase(null);
    setSeasonYear(2026); setCelebrationQueue([]); setCelebrationFrom(null); setOlympicsGoldPending(false);
    setStage("creation");
  };

  if (stage === "continue" && savedCareer) {
    return <ContinueCareer state={savedCareer} onContinue={continueCareer} onNewCareer={startNewCareer} />;
  }
  if (stage === "how_to_play") return <HowToPlay onDone={finishIntro} />;
  if (stage === "creation") return <Creation onStart={createdPlayer} onShowHowToPlay={openHowToPlay} />;
  if (stage === "team_select" && pending) return <TeamSelect incomingOvr={pending.ovr} onPick={pickedCollege} />;
  if (!state) return <Creation onStart={createdPlayer} onShowHowToPlay={openHowToPlay} />;

  switch (stage) {
    case "hub":
      return <CareerHub state={state} onContinue={() => setStage("focus")} />;
    case "focus":
      return <DevelopmentSelect state={state} options={getSeasonDevelopmentOptions(state)} onChoose={pickFocus} />;
    case "workout":
      return state.focus ? (
        <WorkoutScreen
          state={state}
          focus={state.focus}
          kind={workoutMinigame(state)}
          onDone={finishWorkout}
        />
      ) : null;
    case "decision":
      return decision ? <BigDecisionScreen state={state} decision={decision} onChoose={chooseDecision} /> : null;
    case "event":
      return seasonEvent ? (
        <SeasonEventScreen state={state} event={seasonEvent.event} prompt={seasonEvent.prompt} onChoose={chooseEvent} />
      ) : null;
    case "season":
      return seasonView ? (
        <SeasonSimScreen
          state={state}
          {...seasonView}
          nextLabel={state.tournament ? state.tournament.title : "Finish season"}
          onNext={afterSeasonReport}
        />
      ) : null;
    case "tournament":
      return state.tournament ? (
        <TournamentScreen state={state} tournament={state.tournament} onPlay={playRound} />
      ) : null;
    case "round":
      return roundChallenge ? (
        <GauntletScreen
          config={roundChallenge.config}
          gauntlet={roundChallenge.gauntlet}
          levelLabels={roundChallenge.levelLabels}
          levels={roundChallenge.levels}
          playerTeamName={roundChallenge.playerTeamName}
          playerTeamId={roundChallenge.playerTeamId}
          onFinish={finishRound}
        />
      ) : null;
    case "development":
      return development ? (
        <DevelopmentScreen result={development} onNext={() => setStage("season_complete")} />
      ) : null;
    case "season_complete":
      return conclusion ? (
        <SeasonComplete
          state={state} conclusion={conclusion} events={resultEvents}
          onNext={afterSeasonComplete}
        />
      ) : <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
    case "celebration":
      return celebrationQueue.length > 0 ? (
        <Celebration key={celebrationQueue[0].key} playerName={state.player.name} entry={celebrationQueue[0]} onNext={nextCelebration} />
      ) : null;
    case "consequence":
      return threadNote ? (
        <ConsequenceScreen
          resolution={threadNote}
          onNext={() => {
            setThreadNote(null);
            const c = currentRoundChallenge(state);
            if (!c) { completeSeason(); return; }
            setRoundChallenge(c);
            setStage("round");
          }}
        />
      ) : null;
    case "result":
      return <SeasonResultScreen events={resultEvents} onNext={afterResult} />;
    case "draft":
      return state.draftBoard ? (
        <DraftNight
          board={state.draftBoard}
          status={playerStatus(state.player.hidden.reputation, state.player.awards, state.nbaSeasonsPlayed)}
          onSign={draftSigned}
        />
      ) : null;
    case "summary":
      return summary ? <SummaryScreen state={state} summary={summary} onRestart={restart} /> : null;
    default:
      return null;
  }
}
