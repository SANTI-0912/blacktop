import { NarrativeEffects, Person } from "./types";
import { RNG, clamp, pick, randInt } from "./rng";
import { NBA_TEAMS, NCAA_TEAMS, Team } from "./teams";
import { Role } from "./overall";
import { PlayerStatus } from "./status";
import { initialFanLoveForTeamChange, fanLoveTier } from "./fanlove";

// ============================================================
// BIG CAREER DECISION
//
// Exactly one per season, and it is the decision the player will point at
// years later. Two shapes:
//   TEAM_OFFER   — changes where you play, and therefore your role, your
//                  supporting cast, and how hard your title challenge is.
//   CAREER_CALL  — no team change, but a real fork in development/reputation.
//
// The existing narrative decision bank (decisions.ts) is still used for the
// smaller in-season events; this sits above it.
// ============================================================

export type BigDecisionKind = "TEAM_OFFER" | "CAREER_CALL";

export type TeamOption = {
  id: string;
  team: Team;
  headline: string;
  bullets: string[];
  salary?: number;
  years?: number;
  /** Applied on top of the normal team effects when chosen. */
  effects: NarrativeEffects;
};

export type CallOption = {
  id: string;
  label: string;
  detail: string;
  /** What happened as a result of this choice — shown on the Big Decision's own consequence screen. */
  result: string;
  effects: NarrativeEffects;
};

export type BigDecision =
  | { kind: "TEAM_OFFER"; id: string; season: number; prompt: string; options: TeamOption[] }
  | { kind: "CAREER_CALL"; id: string; season: number; prompt: string; options: CallOption[] };

/* ---------------- Team offers ---------------- */

function describe(team: Team, playerOvr: number, currentTeamId: string | null): { headline: string; bullets: string[] } {
  const isCurrent = team.id === currentTeamId;
  const gap = playerOvr - team.ovr;
  const bullets: string[] = [];

  bullets.push(team.ovr >= 88 ? "Championship contender" : team.ovr >= 80 ? "Playoff team" : "Rebuilding");
  if (gap >= 4) bullets.push("You'd be the franchise player");
  else if (gap >= -3) bullets.push("You'd start immediately");
  else if (gap >= -9) bullets.push("You'd share the spotlight");
  else bullets.push("Less playing time behind their stars");

  bullets.push(
    team.ovr >= 88 ? "Higher chance of winning a title" : gap >= 0 ? "The offense would run through you" : "Strong supporting cast"
  );
  if (team.market === "LARGE") bullets.push("Big market, bigger spotlight");

  return { headline: isCurrent ? "Stay where you are" : team.name, bullets };
}

/** A plain-language read on what a salary means against what the player
 * currently earns — shown on every NBA offer so price is legible everywhere.
 * `null` when there's nothing meaningful to compare against (NCAA, or no
 * prior contract yet) or the difference is small enough to just be noise. */
function salaryContextBullet(salary: number | undefined, currentSalary: number): string | null {
  if (salary === undefined || currentSalary <= 0) return null;
  const diff = salary - currentSalary;
  if (diff >= 3) return `A raise over your current $${currentSalary}M/yr`;
  if (diff <= -3) return `A pay cut from your current $${currentSalary}M/yr`;
  return `Roughly your current $${currentSalary}M/yr salary`;
}

/** Fan Love awarded for staying — see career.ts's applyBigDecision, which
 * applies these through applyFanLoveGain's diminishing-returns curve. Kept
 * here, next to the option that earns them, so the bullet text below and
 * the actual bump can never drift apart. */
export const STAY_FAN_LOVE_BUMP = 4;

export function generateTeamOffers(
  rng: RNG,
  player: Person,
  playerOvr: number,
  currentTeam: Team | null,
  league: "NCAA" | "NBA",
  age: number,
  performanceScore: number,
  currentSalary: number,
  nbaSeasonsPlayed: number
): BigDecision {
  const pool = (league === "NCAA" ? NCAA_TEAMS : NBA_TEAMS).filter((t) => t.id !== currentTeam?.id);

  // Interest scales with the player's standing — a 92 OVR hears from contenders.
  const interested = pool
    .filter((t) => playerOvr + randInt(rng, -6, 10) >= t.ovr - 14)
    .sort(() => rng.next() - 0.5)
    .slice(0, 2);

  const opts: TeamOption[] = [];

  if (currentTeam) {
    const d = describe(currentTeam, playerOvr, currentTeam.id);
    const years = rng.next() > 0.5 ? 3 : 2;
    const marketSalary = league === "NBA" ? salaryFor(playerOvr, currentTeam, age, performanceScore, rng) : undefined;
    const marketBullets = [
      ...d.bullets, "Continuity with the coaching staff",
      `Staying loyal earns +${STAY_FAN_LOVE_BUMP} Fan Love`,
    ];
    const marketContext = salaryContextBullet(marketSalary, currentSalary);
    if (marketContext) marketBullets.push(marketContext);
    opts.push({
      id: `stay_${currentTeam.id}`,
      team: currentTeam,
      headline: d.headline,
      bullets: marketBullets,
      salary: marketSalary,
      years: league === "NBA" ? years : undefined,
      effects: { chemistry: 8 },
    });
  }

  // A move costs chemistry — you're the new guy again — but the fresh
  // market and the buzz around a new face bump reputation a little. Named
  // so the Fan Love preview below can factor in the exact same bump the
  // move itself applies (applyDecisionEffects runs before the Fan Love
  // reset in career.ts's applyBigDecision), instead of previewing against
  // stale pre-move reputation.
  const JOIN_REPUTATION_BUMP = 3;
  const joinEffects: NarrativeEffects = { chemistry: -18, confidence: 4, reputation: JOIN_REPUTATION_BUMP };

  // Leaving resets Fan Love (see career.ts's applyBigDecision /
  // initialFanLoveForTeamChange) — precompute the exact same value here so
  // the player knows what they're walking into before they choose, not after.
  const reputationAfterMove = clamp(player.hidden.reputation + JOIN_REPUTATION_BUMP, 0, 100);
  const startingFanLove = Math.round(initialFanLoveForTeamChange(reputationAfterMove, player.awards, nbaSeasonsPlayed));
  const fanLoveBullet = `Starts at ${startingFanLove}/100 Fan Love (${fanLoveTier(startingFanLove)})`;

  for (const t of interested) {
    const d = describe(t, playerOvr, currentTeam?.id ?? null);
    const salary = league === "NBA" ? salaryFor(playerOvr, t, age, performanceScore, rng) : undefined;
    const bullets = [...d.bullets, fanLoveBullet];
    const context = salaryContextBullet(salary, currentSalary);
    if (context) bullets.push(context);
    opts.push({
      id: `join_${t.id}`,
      team: t,
      headline: d.headline,
      bullets,
      salary,
      years: league === "NBA" ? (rng.next() > 0.5 ? 3 : 2) : undefined,
      effects: joinEffects,
    });
  }

  const prompt =
    league === "NCAA"
      ? "Programs are calling. Where do you play next season?"
      : "Your contract is up. Every choice here changes the rest of your career.";

  return { kind: "TEAM_OFFER", id: `offer_${player.id}`, season: 0, prompt, options: opts };
}

/** Salary curve by age — teams pay for what a player IS right now, not what
 * they were or might become. Cheap on a near-rookie deal, peaks in the
 * prime years, discounted once decline risk sets in (retirementChance in
 * focus.ts starts applying pressure at the same age, 32, for the same
 * reason). */
function ageSalaryFactor(age: number): number {
  if (age <= 23) return 0.85;
  if (age <= 27) return 1.0;
  if (age <= 31) return 1.12;
  if (age <= 34) return 0.95;
  return 0.78;
}

/** How much this season's actual performance (not just OVR) nudges the
 * number — a player outplaying their rating gets a bump, one underperforming
 * takes a haircut. Never enough to overwhelm OVR as the primary driver. */
function formSalaryFactor(performanceScore: number): number {
  return clamp(0.85 + performanceScore * 0.25, 0.85, 1.15);
}

function salaryFor(playerOvr: number, team: Team, age: number, performanceScore: number, rng: RNG): number {
  const base = clamp((playerOvr - 60) * 6, 5, 240);
  const marketBump = team.market === "LARGE" ? 1.1 : team.market === "MID" ? 1.0 : 0.94;
  const total = base * marketBump * ageSalaryFactor(age) * formSalaryFactor(performanceScore);
  return Math.round(clamp(total + randInt(rng, -8, 8), 3, 250));
}

/* ---------------- Career calls (no team change) ---------------- */

const CALLS: { prompt: string; options: CallOption[] }[] = [
  {
    prompt: "The coaching staff wants to redefine your role for next season.",
    options: [
      { id: "a", label: "Ask to be the primary option", detail: "More shots, more blame when it doesn't fall.", result: "More shots came your way, and so did more of the blame on nights it didn't fall — the price of being the first name in the offense.", effects: { confidence: 8, reputation: 4 } },
      { id: "b", label: "Become the defensive anchor", detail: "The dirty work nobody puts on a highlight reel.", result: "The coaching staff leaned on you every single night for the matchups nobody wanted. It built a different kind of trust than a scoring title does.", effects: { fatigue: 8 } },
      { id: "c", label: "Run the offense", detail: "The ball starts and ends with your reads.", result: "The offense started running through your reads. The team's ball movement changed noticeably by midseason, and it started with you.", effects: { chemistry: 10 } },
      { id: "d", label: "Do whatever the team needs", detail: "No ego. Fill the gaps.", result: "You filled every gap the team asked of you all season. Nobody put your name on a highlight reel for it, but the people who mattered noticed exactly what you were doing.", effects: { chemistry: 6 } },
    ],
  },
  {
    prompt: "A veteran superstar offers to take you under his wing — on his terms.",
    options: [
      { id: "a", label: "Accept and learn from him", detail: "You defer this season. You come back sharper.", result: "You deferred for a season under his terms. It cost you some shine, but you came back the next year noticeably sharper for it.", effects: { chemistry: 12, confidence: -3 } },
      { id: "b", label: "Decline — this is your team", detail: "You didn't come here to wait your turn.", result: "You held your ground. It cost you real chemistry with a veteran who could have opened doors for you, but you kept your own identity intact.", effects: { confidence: 12, reputation: 5, chemistry: -12 } },
      { id: "c", label: "Take the advice, keep your role", detail: "Listen without stepping back.", result: "You listened without stepping back from your own role. It was the balance you wanted, and he respected that you didn't just fold into his shadow.", effects: { chemistry: 4, confidence: 2 } },
    ],
  },
  {
    prompt: "Your body is sending warnings. The medical staff wants a full shutdown.",
    options: [
      { id: "a", label: "Shut it down and heal properly", detail: "You'll miss games. You'll come back whole.", result: "You missed real time, but you came back to the floor genuinely whole instead of managing something all season.", effects: { injuryRisk: -22, fatigue: -25 } },
      { id: "b", label: "Play through everything", detail: "They'll remember that you never sat.", result: "You never sat, and everyone noticed. Your body is still paying the bill for a decision the highlight reels will never show the cost of.", effects: { injuryRisk: 22, fatigue: 14, reputation: 7 } },
      { id: "c", label: "Manage the load with the staff", detail: "Fewer minutes, smarter minutes.", result: "Fewer minutes, smarter minutes. It worked, even if it meant a few nights on a limited role that didn't feel like you.", effects: { injuryRisk: -9, fatigue: -12 } },
    ],
  },
  {
    prompt: "The offseason is yours. What do you build?",
    options: [
      { id: "a", label: "An unguardable jumper", detail: "Thousands of reps until it's automatic.", result: "Thousands of reps, alone, until the shot became automatic in your own head — whether it translates to the scoreboard is a different question than whether it felt automatic in July.", effects: { confidence: 5, fatigue: 5 } },
      { id: "b", label: "A body nobody can move", detail: "Strength, conditioning, durability.", result: "You spent the summer on strength and conditioning instead of skill work. You're noticeably harder to move off your spot, and your body held up better through the grind of the season for it.", effects: { strength: 3, athleticism: 2, injuryRisk: -10, fatigue: 6 } },
      { id: "c", label: "Ice in your veins", detail: "Late-game situations, over and over.", result: "You spent the summer running late-game situations over and over, alone in an empty gym. Whether it shows up when it matters is still an open question — but you believe it will.", effects: { confidence: 4 } },
      { id: "d", label: "A complete game", detail: "No holes for anyone to attack.", result: "You spent the summer trying to sand down every rough edge in your game instead of sharpening one specific thing. It's the kind of offseason nobody writes about, win or lose.", effects: { confidence: 3 } },
    ],
  },
  {
    prompt: "The locker room has split, and both sides are waiting to see where you stand.",
    options: [
      { id: "a", label: "Take control of the room", detail: "You say it out loud, in front of everyone.", result: "You said it out loud, in front of everyone. The room fell in line behind you — and it was clear, from that day forward, whose room it actually was.", effects: { reputation: 8, chemistry: 12, fatigue: 5 } },
      { id: "b", label: "Stay out of it and produce", detail: "Let the numbers speak.", result: "You let the numbers speak instead of getting involved. The room sorted itself out eventually, but not before a few relationships cooled off for good.", effects: { confidence: 5, chemistry: -8 } },
      { id: "c", label: "Handle it privately, one by one", detail: "No headlines. Just conversations.", result: "No headlines, just one-on-one conversations. It worked quietly, and nobody outside the locker room ever knew there'd been a problem.", effects: { chemistry: 9 } },
    ],
  },
];

export function generateCareerCall(rng: RNG, season: number): BigDecision {
  const c = pick(rng, CALLS);
  return { kind: "CAREER_CALL", id: `call_${season}`, season, prompt: c.prompt, options: c.options };
}

/** The text shown on the Big Decision's own consequence screen, right after the player chooses. */
export function bigDecisionConsequence(
  decision: BigDecision,
  optionId: string,
  moved: boolean,
  teamName: string,
  status: PlayerStatus
): string {
  if (decision.kind === "CAREER_CALL") {
    const opt = decision.options.find((o) => o.id === optionId);
    return opt?.result ?? "";
  }
  const opt = decision.options.find((o) => o.id === optionId);
  if (!opt) return "";
  if (!moved) return `You committed to ${teamName}. The organization built the next chapter around you.`;
  if (status === "LEGEND" || status === "MVP_LEVEL" || status === "ALL_STAR") {
    return `You signed with ${teamName}. Fans there already know exactly who they're getting.`;
  }
  if (status === "STARTER" || status === "ROTATION") {
    return `You signed with ${teamName}. It's a fresh start, and there's already some buzz about what you bring.`;
  }
  return `You signed with ${teamName}. It's a fresh start, and everyone there is watching to see what you do with it.`;
}
