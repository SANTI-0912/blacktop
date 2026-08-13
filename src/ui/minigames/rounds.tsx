import { useEffect, useMemo, useRef, useState } from "react";
import { MinigameKind, RoundSpec } from "../../engine/minigameLibrary";

// ============================================================
// MINIGAME MECHANICS
//
// Every component implements the SAME contract: play one round at a given
// difficulty, then report success or failure. The Gauntlet owns rounds and
// elimination; these know nothing about careers, seasons or teams.
//
// `spec.difficulty` runs 0 (first round) -> 1 (final round) and every
// mechanic must get meaningfully harder across that range.
// `spec.mods` carries the ATTRIBUTE influence: bigger windows / more time.
// The bands are deliberately narrow — stats tilt the odds, never decide.
// ============================================================

export type RoundProps = {
  spec: RoundSpec;
  onDone: (success: boolean) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ================= 1. SIMON SEQUENCE ================= */

const SIMON_COLORS = ["#E31E24", "#C9C9C9", "#FF4D3D", "#5BD6A0"];

function Simon({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const length = Math.round(lerp(3, 8, d));
  const showMs = Math.round(lerp(620, 260, d) * spec.mods.timeScale);

  const sequence = useMemo(
    () => Array.from({ length }, () => Math.floor(Math.random() * 4)),
    [length, spec.index]
  );
  const [phase, setPhase] = useState<"SHOW" | "INPUT">("SHOW");
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [entered, setEntered] = useState<number[]>([]);

  useEffect(() => {
    if (phase !== "SHOW") return;
    if (step >= sequence.length) {
      const t = setTimeout(() => { setLit(null); setPhase("INPUT"); }, 200);
      return () => clearTimeout(t);
    }
    setLit(sequence[step]);
    const on = setTimeout(() => setLit(null), showMs * 0.6);
    const next = setTimeout(() => setStep((s) => s + 1), showMs);
    return () => { clearTimeout(on); clearTimeout(next); };
  }, [phase, step, sequence, showMs]);

  const press = (i: number) => {
    if (phase !== "INPUT") return;
    const idx = entered.length;
    if (sequence[idx] !== i) { onDone(false); return; }
    const next = [...entered, i];
    setEntered(next);
    setLit(i);
    setTimeout(() => setLit(null), 120);
    if (next.length === sequence.length) setTimeout(() => onDone(true), 220);
  };

  return (
    <div className="select-none">
      <div className="eyebrow mb-3">
        {phase === "SHOW" ? "Watch the sequence" : `Repeat it — ${entered.length}/${sequence.length}`}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {SIMON_COLORS.map((c, i) => (
          <button
            key={i}
            onClick={() => press(i)}
            disabled={phase !== "INPUT"}
            className="h-24 rounded-sm border transition-all duration-100"
            style={{
              borderColor: c,
              background: lit === i ? c : `${c}1A`,
              transform: lit === i ? "scale(0.97)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ================= 2. REACTION ================= */

function Reaction({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const windowMs = Math.round(lerp(900, 260, d) * spec.mods.timeScale);
  const fakeChance = d > 0.45 ? lerp(0, 0.55, (d - 0.45) / 0.55) : 0;

  const [state, setState] = useState<"WAIT" | "GO" | "FAKE">("WAIT");
  const armed = useRef(false);

  useEffect(() => {
    const delay = 700 + Math.random() * 1600;
    const t = setTimeout(() => {
      if (Math.random() < fakeChance) {
        setState("FAKE");
        // A false start window: pressing here is a foul.
        const back = setTimeout(() => setState("WAIT"), 500);
        const again = setTimeout(() => { armed.current = true; setState("GO"); }, 500 + 400 + Math.random() * 900);
        return () => { clearTimeout(back); clearTimeout(again); };
      }
      armed.current = true;
      setState("GO");
    }, delay);
    return () => clearTimeout(t);
  }, [fakeChance]);

  useEffect(() => {
    if (state !== "GO") return;
    const t = setTimeout(() => onDone(false), windowMs); // too slow
    return () => clearTimeout(t);
  }, [state, windowMs, onDone]);

  const tap = () => {
    if (state === "GO" && armed.current) onDone(true);
    else onDone(false); // jumped early / reacted to the fake
  };

  const label = state === "GO" ? "GO" : state === "FAKE" ? "WAIT" : "…";
  const color = state === "GO" ? "#5BD6A0" : state === "FAKE" ? "#FF4D3D" : "#2A2A2A";

  return (
    <div className="select-none">
      <div className="eyebrow mb-3">Tap the instant it turns green — not before</div>
      <button
        onClick={tap}
        className="w-full h-44 rounded-sm border-2 font-display uppercase text-4xl transition-colors duration-75"
        style={{ borderColor: color, background: `${color}22`, color }}
      >
        {label}
      </button>
    </div>
  );
}

/* ================= 3. HOT ZONE ================= */

function HotZone({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const size = lerp(88, 34, d) * spec.mods.windowScale;
  const showMs = Math.round(lerp(900, 330, d) * spec.mods.timeScale);
  const decoys = Math.round(lerp(0, 3, d));

  const target = useMemo(
    () => ({ x: 12 + Math.random() * 66, y: 12 + Math.random() * 60 }),
    [spec.index]
  );
  const fakes = useMemo(
    () => Array.from({ length: decoys }, () => ({ x: 10 + Math.random() * 70, y: 10 + Math.random() * 64 })),
    [decoys, spec.index]
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), showMs);
    return () => clearTimeout(t);
  }, [showMs]);

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    if (visible) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    const tolX = (size / r.width) * 100;
    const tolY = (size / r.height) * 100;
    onDone(Math.abs(px - target.x) < tolX && Math.abs(py - target.y) < tolY);
  };

  return (
    <div className="select-none">
      <div className="eyebrow mb-3">{visible ? "Remember the spot" : "Tap where it was"}</div>
      <div
        onClick={click}
        className="relative w-full h-64 border border-line rounded-sm bg-ink overflow-hidden cursor-crosshair"
      >
        {/* half-court markings, so it reads as a floor and not a grid */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line/60" />
        <div className="absolute left-1/2 top-1/2 w-24 h-24 border border-line/60 rounded-full -translate-x-1/2 -translate-y-1/2" />
        {visible && (
          <>
            <div
              className="absolute rounded-full border-2 border-amber bg-amber/25"
              style={{ left: `${target.x}%`, top: `${target.y}%`, width: size, height: size, transform: "translate(-50%,-50%)" }}
            />
            {fakes.map((f, i) => (
              <div
                key={i}
                className="absolute rounded-full border border-line"
                style={{ left: `${f.x}%`, top: `${f.y}%`, width: size * 0.8, height: size * 0.8, transform: "translate(-50%,-50%)" }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ================= 4. PERFECT TIMING ================= */

function PerfectTiming({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const half = lerp(11, 3.2, d) * spec.mods.windowScale;
  const speed = lerp(1.1, 3.1, d);
  const hasDecoy = d > 0.55;

  const [pos, setPos] = useState(0);
  const [locked, setLocked] = useState(false);
  const dir = useRef(1);
  const raf = useRef(0);
  const decoy = useMemo(() => 18 + Math.random() * 26, [spec.index]);

  useEffect(() => {
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last; last = t;
      setPos((p) => {
        let n = p + dir.current * speed * (dt / 16.67);
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [speed]);

  const fire = () => {
    if (locked) return;
    cancelAnimationFrame(raf.current);
    setLocked(true);
    setTimeout(() => onDone(Math.abs(pos - 50) <= half), 260);
  };

  return (
    <div className="select-none">
      <div className="eyebrow mb-3">Stop it inside the green</div>
      <div className="relative h-20 border border-line bg-ink rounded-sm overflow-hidden">
        {hasDecoy && (
          <div className="absolute inset-y-0 bg-heat/10 border-x border-heat/40" style={{ left: `${decoy}%`, width: `${half * 1.6}%` }} />
        )}
        <div className="absolute inset-y-0 bg-[#5BD6A0]/25 border-x border-[#5BD6A0]" style={{ left: `${50 - half}%`, width: `${half * 2}%` }} />
        <div className="absolute inset-y-0 w-[3px] bg-bone" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} />
      </div>
      <button className="btn-primary mt-5" onClick={fire} disabled={locked}>Shoot</button>
    </div>
  );
}

/* ================= 5. READ THE PLAY ================= */

const PLAYS = [
  { text: "Two defenders collapse on you at the rim. The corner is empty.", options: ["Shoot over both", "Pass to the corner", "Drive into the help"], best: 1 },
  { text: "Your man is playing eight feet off you at the arc.", options: ["Pass it back out", "Shoot", "Drive into the crowd"], best: 1 },
  { text: "The big switched onto you at the top of the key. Lane is clear.", options: ["Drive past him", "Contested three", "Reset the offense"], best: 0 },
  { text: "They trap you at half court. Your point guard is open behind it.", options: ["Split the trap", "Pass out of it", "Call timeout"], best: 1 },
  { text: "Shot clock at two. You're covered, everyone is covered.", options: ["Force the shot", "Pass and lose it", "Hold the ball"], best: 0 },
  { text: "The center rolls hard, the weak side rotated over late.", options: ["Lob to the roller", "Pull up mid-range", "Kick to the wing"], best: 0 },
];

function ReadThePlay({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  // Floor raised from 1400ms: at the hardest rounds, combined with a low
  // timeScale, the old floor left as little as ~1.2s to read a full
  // scenario sentence plus up to 4 options — not enough time to actually
  // read the play, just guess. 2600ms keeps the late-round tension while
  // staying readable (worst case now ~2.2s, best case still ~4.2s).
  const totalMs = Math.round(lerp(4200, 2600, d) * spec.mods.timeScale);
  const play = useMemo(() => PLAYS[Math.floor(Math.random() * PLAYS.length)], [spec.index]);
  const extraOptions = d > 0.6 ? ["Step back and reassess"] : [];
  const options = useMemo(() => [...play.options, ...extraOptions], [play, d]);

  const [left, setLeft] = useState(100);
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (picked) return;
    const step = 100 / (totalMs / 60);
    const id = setInterval(() => setLeft((l) => Math.max(0, l - step)), 60);
    return () => clearInterval(id);
  }, [picked, totalMs]);

  useEffect(() => {
    if (left <= 0 && !picked) { setPicked(true); onDone(false); }
  }, [left, picked, onDone]);

  const choose = (i: number) => {
    if (picked) return;
    setPicked(true);
    setTimeout(() => onDone(i === play.best), 260);
  };

  return (
    <div className="select-none">
      <div className="h-1 bg-line rounded-sm overflow-hidden mb-4">
        <div className="h-full bg-heat transition-[width] duration-75" style={{ width: `${left}%` }} />
      </div>
      <p className="text-[15px] mb-4 leading-snug">{play.text}</p>
      <div className="space-y-2">
        {options.map((o, i) => (
          <button key={o} className="btn" onClick={() => choose(i)} disabled={picked}>
            <span className="text-[14px]">{o}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= 6. CLUTCH BOARD (tic-tac-toe vs scaling AI) ================= */

type Cell = "X" | "O" | null;

function winner(b: Cell[]): Cell | "TIE" | null {
  const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, c, d] of L) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? "TIE" : null;
}

function bestMove(b: Cell[], me: Cell): number {
  const opp: Cell = me === "X" ? "O" : "X";
  const empty = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  for (const i of empty) { const t = [...b]; t[i] = me; if (winner(t) === me) return i; }
  for (const i of empty) { const t = [...b]; t[i] = opp; if (winner(t) === opp) return i; }
  if (b[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((i) => b[i] === null);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

function ClutchBoard({ spec, onDone }: RoundProps) {
  // Two calibrations, both found by measuring instead of guessing:
  // 1. AI skill is capped at 0.72. A perfect tic-tac-toe AI can only ever be
  //    drawn, never beaten, so the old 0.98 left no path to an outright win.
  // 2. A draw only survives EARLY levels. Measured against a competent player,
  //    "draw survives" produced a 0% loss rate at every difficulty — the level
  //    was a free pass. Late levels now demand an actual win (~44-61% for a
  //    competent player, which is a real test rather than a formality).
  const smartChance = lerp(0.12, 0.72, spec.difficulty);
  const drawSurvives = spec.difficulty <= 0.5;
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [busy, setBusy] = useState(false);

  const play = (i: number) => {
    if (busy || board[i]) return;
    const b = [...board];
    b[i] = "X";
    setBoard(b);
    const w = winner(b);
    if (w) { setTimeout(() => onDone(w === "X"), 400); return; }

    setBusy(true);
    setTimeout(() => {
      const empty = b.map((c, k) => (c ? -1 : k)).filter((k) => k >= 0);
      const move = Math.random() < smartChance
        ? bestMove(b, "O")
        : empty[Math.floor(Math.random() * empty.length)];
      const b2 = [...b];
      b2[move] = "O";
      setBoard(b2);
      setBusy(false);
      const w2 = winner(b2);
      if (w2) setTimeout(() => onDone(w2 === "X" || (w2 === "TIE" && drawSurvives)), 400);
    }, 320);
  };

  return (
    <div className="select-none">
      <div className="eyebrow mb-3">
        {drawSurvives ? "Beat them to the spot — a draw survives" : "You need the win. A draw is not enough."}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {board.map((c, i) => (
          <button
            key={i}
            onClick={() => play(i)}
            className="aspect-square border border-line rounded-sm bg-court/50 font-display text-4xl"
            style={{ color: c === "X" ? "#E31E24" : "#C9C9C9" }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= 7. CLUTCH SHOT ================= */

const SHOT_LABELS = ["Open look", "Defender closing", "Deep range", "Off the dribble, late clock", "Double-teamed", "Game winner"];

function ClutchShot({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const half = lerp(10, 3, d) * spec.mods.windowScale;
  const speed = lerp(1.3, 3.4, d);
  const label = SHOT_LABELS[Math.min(SHOT_LABELS.length - 1, Math.round(d * (SHOT_LABELS.length - 1)))];

  const [pos, setPos] = useState(0);
  const [locked, setLocked] = useState(false);
  const dir = useRef(1);
  const raf = useRef(0);

  useEffect(() => {
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last; last = t;
      setPos((p) => {
        let n = p + dir.current * speed * (dt / 16.67);
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [speed]);

  const fire = () => {
    if (locked) return;
    cancelAnimationFrame(raf.current);
    setLocked(true);
    setTimeout(() => onDone(Math.abs(pos - 50) <= half), 300);
  };

  return (
    <div className="select-none">
      <div className="font-display uppercase text-2xl mb-1">{label}</div>
      <div className="eyebrow mb-4">Release at the top of the jump</div>
      <div className="relative h-20 border border-line bg-ink rounded-sm overflow-hidden">
        <div className="absolute inset-y-0 bg-amber/25 border-x border-amber" style={{ left: `${50 - half}%`, width: `${half * 2}%` }} />
        <div className="absolute inset-y-0 w-[3px] bg-bone" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} />
      </div>
      <button className="btn-primary mt-5" onClick={fire} disabled={locked}>Shoot</button>
    </div>
  );
}

/* ================= 8. HALF-COURT CLUTCH ================= */

// Two-stage: set the power, then the line. Both must land. Reserved for the
// biggest moments in the game.
function HalfCourt({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  const half = lerp(9, 3.4, d) * spec.mods.windowScale;
  const speed = lerp(1.5, 3.2, d);

  const [stage, setStage] = useState<0 | 1>(0);
  const [pos, setPos] = useState(0);
  const [locked, setLocked] = useState(false);
  const dir = useRef(1);
  const raf = useRef(0);

  useEffect(() => {
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last; last = t;
      setPos((p) => {
        let n = p + dir.current * speed * (dt / 16.67);
        if (n >= 100) { n = 100; dir.current = -1; }
        if (n <= 0) { n = 0; dir.current = 1; }
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [speed, stage]);

  const fire = () => {
    if (locked) return;
    const ok = Math.abs(pos - 50) <= half;
    if (!ok) { cancelAnimationFrame(raf.current); setLocked(true); setTimeout(() => onDone(false), 320); return; }
    if (stage === 0) { setStage(1); setPos(0); dir.current = 1; return; }
    cancelAnimationFrame(raf.current);
    setLocked(true);
    setTimeout(() => onDone(true), 340);
  };

  return (
    <div className="select-none">
      <div className="font-display uppercase text-2xl leading-none">From half court</div>
      <div className="eyebrow mt-1 mb-4">{stage === 0 ? "Set the power" : "Now the line"}</div>
      <div className="relative h-20 border border-line bg-ink rounded-sm overflow-hidden">
        <div
          className="absolute inset-y-0 border-x"
          style={{
            left: `${50 - half}%`, width: `${half * 2}%`,
            background: stage === 0 ? "rgba(227,30,36,.25)" : "rgba(201,201,201,.25)",
            borderColor: stage === 0 ? "#E31E24" : "#C9C9C9",
          }}
        />
        <div className="absolute inset-y-0 w-[3px] bg-bone" style={{ left: `${pos}%`, transform: "translateX(-50%)" }} />
      </div>
      <div className="flex gap-1.5 mt-3">
        <div className="flex-1 h-1 rounded-sm" style={{ background: stage > 0 ? "#E31E24" : "#2A2A2A" }} />
        <div className="flex-1 h-1 rounded-sm" style={{ background: "#2A2A2A" }} />
      </div>
      <button className="btn-primary mt-5" onClick={fire} disabled={locked}>
        {stage === 0 ? "Set power" : "Release"}
      </button>
    </div>
  );
}

/* ================= 9. MEMORY MATCH ================= */

const MEMORY_SYMBOLS = ["🏀", "🔥", "⭐", "🏆", "👑", "🎯", "🛡️", "⚡"];
const MEMORY_BASE_LIVES = 3;

function shuffledDeck(): string[] {
  const deck = [...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function MemoryMatch({ spec, onDone }: RoundProps) {
  const d = spec.difficulty;
  // The grid is always 4x4 — difficulty ramps via a shorter memorization
  // window instead of a bigger board.
  const previewMs = Math.round(lerp(3200, 1400, d) * spec.mods.timeScale);
  const lives = MEMORY_BASE_LIVES + spec.mods.livesBonus;

  const cards = useMemo(shuffledDeck, [spec.index]);
  const [phase, setPhase] = useState<"PREVIEW" | "PLAY">("PREVIEW");
  const [matched, setMatched] = useState<boolean[]>(() => cards.map(() => false));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [livesLeft, setLivesLeft] = useState(lives);
  const [locked, setLocked] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setPhase("PLAY"), previewMs);
    return () => clearTimeout(t);
  }, [previewMs]);

  useEffect(() => {
    if (done.current || matched.length === 0) return;
    if (matched.every(Boolean)) {
      done.current = true;
      setTimeout(() => onDone(true), 260);
    }
  }, [matched, onDone]);

  useEffect(() => {
    if (done.current) return;
    if (livesLeft <= 0) {
      done.current = true;
      onDone(false);
    }
  }, [livesLeft, onDone]);

  const flip = (i: number) => {
    if (phase !== "PLAY" || locked || matched[i] || flipped.includes(i) || flipped.length >= 2) return;
    const next = [...flipped, i];
    setFlipped(next);
    if (next.length < 2) return;
    setLocked(true);
    const [a, b] = next;
    if (cards[a] === cards[b]) {
      setTimeout(() => {
        setMatched((m) => { const n = [...m]; n[a] = true; n[b] = true; return n; });
        setFlipped([]);
        setLocked(false);
      }, 380);
    } else {
      setTimeout(() => {
        setFlipped([]);
        setLocked(false);
        setLivesLeft((l) => l - 1);
      }, 700);
    }
  };

  const isRevealed = (i: number) => phase === "PREVIEW" || matched[i] || flipped.includes(i);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between eyebrow mb-3">
        <span>{phase === "PREVIEW" ? "Memorize the board" : "Find the pairs"}</span>
        <span>{"❤️".repeat(Math.max(0, livesLeft))}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((sym, i) => (
          <button
            key={i}
            onClick={() => flip(i)}
            disabled={phase !== "PLAY" || matched[i] || locked || flipped.includes(i)}
            className="aspect-square rounded-sm border flex items-center justify-center text-2xl transition-all duration-150"
            style={{
              borderColor: matched[i] ? "#5BD6A0" : "#2A2A2A",
              background: isRevealed(i) ? "rgba(227,30,36,.12)" : "#151515",
            }}
          >
            {isRevealed(i) ? sym : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= Router ================= */

export function MinigameRound({ spec, onDone }: RoundProps) {
  const map: Record<MinigameKind, (p: RoundProps) => JSX.Element> = {
    SIMON: Simon,
    REACTION: Reaction,
    HOT_ZONE: HotZone,
    PERFECT_TIMING: PerfectTiming,
    READ_THE_PLAY: ReadThePlay,
    CLUTCH_BOARD: ClutchBoard,
    CLUTCH_SHOT: ClutchShot,
    HALF_COURT: HalfCourt,
    MEMORY_MATCH: MemoryMatch,
  };
  const C = map[spec.kind];
  return <C spec={spec} onDone={onDone} />;
}
