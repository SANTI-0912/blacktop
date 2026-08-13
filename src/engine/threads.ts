import { NarrativeEffects, Person } from "./types";
import { RNG, clamp, randInt } from "./rng";

// ============================================================
// CAREER THREADS — EVENT MEMORY
//
// The gap this closes: an event used to be a card you dismissed. Now a
// decision can open a THREAD that stays alive in the career and pays off
// later, sometimes years later, sometimes triggered by context rather than
// time (a knee you played through resurfacing in the Elite Eight).
//
//   EVENT -> DECISION -> THREAD OPENS -> CONSEQUENCE -> REFERENCED AGAIN
//
// Threads are the reason a career remembers what you did at 19 when you're 28.
// ============================================================

export type ThreadTrigger =
  | { kind: "SEASONS"; min: number; max: number }      // pays off after N seasons
  | { kind: "TOURNAMENT" }                              // fires at the next tournament
  | { kind: "AGING"; fromAge: number }                  // fires once the body starts asking
  | { kind: "RIVALRY" };                                // fires at the next rival moment

export type ThreadEffects = NarrativeEffects;

export type ThreadPayoff = {
  /** Chance this resolves the good way. Choices that took a risk sit lower. */
  goodChance: number;
  good: { text: string; effects: ThreadEffects };
  bad: { text: string; effects: ThreadEffects };
};

export type ThreadDef = {
  id: string;
  label: string;
  trigger: ThreadTrigger;
  payoff: ThreadPayoff;
  /** Optional late callback that can fire many years afterwards. */
  echo?: { fromSeasons: number; text: string };
};

export type ActiveThread = {
  id: string;
  openedSeason: number;
  dueSeason: number | null;
  resolved: boolean;
  resolvedGood?: boolean;
  echoed?: boolean;
};

export type ThreadResolution = {
  threadId: string;
  label: string;
  text: string;
  good: boolean;
  effects: ThreadEffects;
};

// ============================================================
// REGISTRY
// Keyed by the event option that opens them.
// ============================================================

export const THREADS: Record<string, ThreadDef> = {
  /* ---- Injury: played through vs recovered ---- */
  injury_played_through: {
    id: "injury_played_through",
    label: "The knee",
    trigger: { kind: "TOURNAMENT" },
    payoff: {
      goodChance: 0.45,
      good: {
        text: "Your knee held up when it mattered most. Playing through it bought you the season.",
        effects: { reputation: 5, confidence: 6 },
      },
      bad: {
        text: "The injury you played through finally caught up with you at the worst possible time.",
        effects: { athleticism: -3, injuryRisk: 14, confidence: -8 },
      },
    },
    echo: {
      fromSeasons: 6,
      text: "Your old knee injury has started bothering you again. You never really let it heal.",
    },
  },
  injury_recovered: {
    id: "injury_recovered",
    label: "The rehab",
    trigger: { kind: "TOURNAMENT" },
    payoff: {
      goodChance: 0.82,
      good: {
        text: "The recovery worked. You missed games, but you enter the tournament at full strength.",
        effects: { athleticism: 2, injuryRisk: -12, confidence: 6 },
      },
      bad: {
        text: "You did everything right and the body still wasn't ready. Some things don't heal on schedule.",
        effects: { injuryRisk: 6, confidence: -4 },
      },
    },
  },

  /* ---- Mentorship accepted vs turned down ---- */
  mentor_accepted: {
    id: "mentor_accepted",
    label: "The veteran",
    trigger: { kind: "SEASONS", min: 2, max: 4 },
    payoff: {
      goodChance: 0.8,
      good: {
        text: "The veteran's advice is showing up in your game. You read situations he warned you about before they happen.",
        effects: {},
      },
      bad: {
        text: "You listened to everything he said, but his game was never really your game.",
        effects: { confidence: -2 },
      },
    },
  },
  mentor_declined: {
    id: "mentor_declined",
    label: "The advice you turned down",
    trigger: { kind: "SEASONS", min: 3, max: 6 },
    payoff: {
      goodChance: 0.4,
      good: {
        text: "You built your own way instead of borrowing his. It worked.",
        effects: { confidence: 9, reputation: 5 },
      },
      bad: {
        text: "You never forgot the advice you turned down years ago. You needed it in the end.",
        effects: { confidence: -6 },
      },
    },
    echo: {
      fromSeasons: 7,
      text: "He retired this year. You still think about the offer you turned down.",
    },
  },

  /* ---- Coach: bigger role accepted vs refused ---- */
  role_accepted: {
    id: "role_accepted",
    label: "The bigger role",
    trigger: { kind: "SEASONS", min: 1, max: 2 },
    payoff: {
      goodChance: 0.62,
      good: {
        text: "Taking on the bigger role paid off. The team runs through you now and nobody questions it.",
        effects: { confidence: 9, reputation: 6 },
      },
      bad: {
        text: "The bigger role exposed parts of your game you'd been able to hide.",
        effects: { confidence: -8 },
      },
    },
  },
  role_refused: {
    id: "role_refused",
    label: "The role you turned down",
    trigger: { kind: "SEASONS", min: 2, max: 3 },
    payoff: {
      goodChance: 0.5,
      good: {
        text: "Staying in your lane kept the locker room together. The staff noticed.",
        effects: { chemistry: 10 },
      },
      bad: {
        text: "The coach gave that role to someone else. He never fully came back to you.",
        effects: { confidence: -5 },
      },
    },
  },
  coach_conflict: {
    id: "coach_conflict",
    label: "The coach who doubted you",
    trigger: { kind: "SEASONS", min: 4, max: 7 },
    payoff: {
      goodChance: 0.6,
      good: {
        text: "The coach who once questioned your role is now trying to recruit you. You let him ask twice.",
        effects: { reputation: 8, confidence: 7 },
      },
      bad: {
        text: "That fight followed you. Front offices still bring it up.",
        effects: { reputation: -6 },
      },
    },
  },

  /* ---- Media: podcast / interview ---- */
  media_outspoken: {
    id: "media_outspoken",
    label: "What you said publicly",
    trigger: { kind: "RIVALRY" },
    payoff: {
      goodChance: 0.5,
      good: {
        text: "After your comments, you backed every word up on the floor. The league respects that.",
        effects: { reputation: 10, confidence: 8 },
      },
      bad: {
        text: "After your comments on the podcast, the rivalry got personal — and he's been better since.",
        effects: { reputation: -4, chemistry: -6 },
      },
    },
  },
  media_quiet: {
    id: "media_quiet",
    label: "Staying quiet",
    trigger: { kind: "SEASONS", min: 2, max: 4 },
    payoff: {
      goodChance: 0.7,
      good: {
        text: "You let the noise pass and kept working. The people who matter noticed.",
        effects: { chemistry: 6 },
      },
      bad: {
        text: "Saying nothing let other people write your story for you.",
        effects: { reputation: -5 },
      },
    },
  },

  /* ---- Risk-taking ---- */
  risk_taken: {
    id: "risk_taken",
    label: "The gamble",
    trigger: { kind: "SEASONS", min: 1, max: 3 },
    payoff: {
      goodChance: 0.55,
      good: {
        text: "The risk you took is the reason you're here. It could easily have gone the other way.",
        effects: { confidence: 10, reputation: 8 },
      },
      bad: {
        text: "That gamble cost you a year you don't get back.",
        effects: { confidence: -9, injuryRisk: 10 },
      },
    },
  },
};

/* ================= Runtime ================= */

export function openThread(threads: ActiveThread[], threadId: string, season: number, rng: RNG): ActiveThread[] {
  const def = THREADS[threadId];
  if (!def) return threads;
  if (threads.some((t) => t.id === threadId && !t.resolved)) return threads;

  let dueSeason: number | null = null;
  if (def.trigger.kind === "SEASONS") {
    dueSeason = season + randInt(rng, def.trigger.min, def.trigger.max);
  }
  return [...threads, { id: threadId, openedSeason: season, dueSeason, resolved: false }];
}

export type ThreadContext = {
  season: number;
  age: number;
  atTournament: boolean;
  atRivalMoment: boolean;
};

/** Finds a thread ready to pay off right now, if any. */
export function dueThread(threads: ActiveThread[], ctx: ThreadContext): ActiveThread | null {
  for (const t of threads) {
    if (t.resolved) continue;
    const def = THREADS[t.id];
    if (!def) continue;
    const trg = def.trigger;
    if (trg.kind === "SEASONS" && t.dueSeason !== null && ctx.season >= t.dueSeason) return t;
    if (trg.kind === "TOURNAMENT" && ctx.atTournament) return t;
    if (trg.kind === "RIVALRY" && ctx.atRivalMoment) return t;
    if (trg.kind === "AGING" && ctx.age >= trg.fromAge) return t;
  }
  return null;
}

export function resolveThread(rng: RNG, thread: ActiveThread): { threads: (t: ActiveThread[]) => ActiveThread[]; resolution: ThreadResolution } {
  const def = THREADS[thread.id];
  const good = rng.next() < def.payoff.goodChance;
  const side = good ? def.payoff.good : def.payoff.bad;

  return {
    threads: (list: ActiveThread[]) =>
      list.map((t) => (t.id === thread.id && !t.resolved ? { ...t, resolved: true, resolvedGood: good } : t)),
    resolution: { threadId: thread.id, label: def.label, text: side.text, good, effects: side.effects },
  };
}

/** A long-delayed callback to something resolved years ago. */
export function dueEcho(threads: ActiveThread[], season: number): { thread: ActiveThread; text: string } | null {
  for (const t of threads) {
    if (!t.resolved || t.echoed) continue;
    const def = THREADS[t.id];
    if (!def?.echo) continue;
    if (season - t.openedSeason >= def.echo.fromSeasons) {
      return { thread: t, text: def.echo.text };
    }
  }
  return null;
}

export function markEchoed(threads: ActiveThread[], id: string): ActiveThread[] {
  return threads.map((t) => (t.id === id ? { ...t, echoed: true } : t));
}

/** Applies a resolution's effects to the player. */
export function applyThreadEffects(person: Person, effects: ThreadEffects): Person {
  const attributes = { ...person.attributes };
  const hidden = { ...person.hidden };
  const attrKeys: ("athleticism" | "strength")[] = ["athleticism", "strength"];
  for (const k of attrKeys) {
    if (effects[k] !== undefined) attributes[k] = clamp(attributes[k] + (effects[k] as number), 30, 99);
  }
  for (const k of ["confidence", "reputation", "fanLove", "chemistry", "fatigue", "injuryRisk"] as const) {
    if (effects[k] !== undefined) hidden[k] = clamp(hidden[k] + (effects[k] as number), 0, 100);
  }
  return { ...person, attributes, hidden };
}
