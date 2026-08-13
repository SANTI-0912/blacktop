import { PlayoffResult, Round } from "./types";
import { RNG, clamp, randInt } from "./rng";

// ============================================================
// SCHEDULE
// Turns a season into something the player watches go by, week by week,
// instead of a single number appearing. Purely presentational detail derived
// from the same team quality the simulation already computed — the final
// record always matches what simulateSeasonStats produced.
// ============================================================

export type WeekResult = { week: number; result: "W" | "L"; opponent: string };

const OPP = ["Hawks", "Bulls", "Suns", "Magic", "Kings", "Nets", "Pacers", "Pistons", "Wizards", "Spurs", "Jazz", "Heat", "Bucks", "Mavericks", "Clippers", "Warriors"];
const NCAA_OPP = ["Wildcats", "Tigers", "Bulldogs", "Cougars", "Aggies", "Cardinals", "Hoosiers", "Gators", "Volunteers", "Sooners"];

// Distributes the known win total across the schedule so the ticker adds up
// exactly to the record the simulation already decided.
export function buildSchedule(rng: RNG, wins: number, losses: number, league: "NCAA" | "NBA"): WeekResult[] {
  const total = wins + losses;
  const slots: ("W" | "L")[] = [
    ...Array(wins).fill("W" as const),
    ...Array(losses).fill("L" as const),
  ];
  // Fisher-Yates with the seeded RNG, so replays are identical.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  // Compress to ~18 displayed weeks so the ticker stays readable on a phone.
  const weeks = Math.min(18, total);
  const per = Math.ceil(total / weeks);
  const out: WeekResult[] = [];
  const pool = league === "NCAA" ? NCAA_OPP : OPP;
  for (let w = 0; w < weeks; w++) {
    const chunk = slots.slice(w * per, (w + 1) * per);
    if (chunk.length === 0) break;
    const w_count = chunk.filter((c) => c === "W").length;
    out.push({
      week: w + 1,
      result: w_count >= chunk.length / 2 ? "W" : "L",
      opponent: pool[randInt(rng, 0, pool.length - 1)],
    });
  }
  return out;
}

export function conferenceSeed(rng: RNG, teamQuality: number): number {
  const base = Math.round(15 - teamQuality * 14);
  return clamp(base + randInt(rng, -1, 1), 1, 15);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// The playoff rounds actually reached, for display as a bracket run.
export type BracketStep = { round: Round; label: string; won: boolean; opponent: string };

export function buildBracket(
  rng: RNG,
  result: PlayoffResult,
  decisiveRound: Round | null,
  league: "NCAA" | "NBA",
  labels: (r: Round) => string
): BracketStep[] {
  const order: Round[] = ["FIRST_ROUND", "CONF_SEMIS", "CONF_FINALS", "FINALS"];
  const reachedIdx = {
    MISSED_PLAYOFFS: -1, PENDING: -1, FIRST_ROUND: 0, CONF_SEMIS: 1,
    CONF_FINALS: 2, FINALS_LOSS: 3, CHAMPION: 3,
  }[result];
  if (reachedIdx < 0) return [];
  const pool = league === "NCAA" ? NCAA_OPP : OPP;
  const steps: BracketStep[] = [];
  for (let i = 0; i <= reachedIdx; i++) {
    const isLast = i === reachedIdx;
    const won = !isLast || result === "CHAMPION";
    steps.push({
      round: order[i],
      label: labels(order[i]),
      won,
      opponent: pool[randInt(rng, 0, pool.length - 1)],
    });
  }
  return steps;
}
