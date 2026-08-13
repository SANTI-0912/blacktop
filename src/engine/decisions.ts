import { Attributes, DecisionOption, Hidden, Person, SeasonDecision } from "./types";
import { RNG, pick, clamp } from "./rng";

// ============================================================
// DECISION BANK
// The player only ever sees `prompt` and each option's `label`.
// `effects` is read by applyDecision() and never surfaced in the UI.
// Multiple prompts per category so replays don't feel identical.
// ============================================================

// `phases` gates scenarios that only make sense in one part of a career —
// e.g. trade rumors and franchise commitment have no meaning in college.
type DecisionTemplate = Omit<SeasonDecision, "id" | "season"> & {
  phases?: ("NCAA" | "NBA")[];
};

const TEMPLATES: DecisionTemplate[] = [
  {
    category: "DEFENSE",
    prompt: "You're averaging strong numbers, but opponents keep attacking you defensively and it's costing your team close games.",
    options: [
      { id: "a", label: "Accept the challenge and focus on defense.", effects: { defense: 3, fatigue: 8, reputation: 2 }, tags: ["defense", "grind"] },
      { id: "b", label: "Tell the coach the offense should run through you instead.", effects: { shooting: 2, ballHandling: 2, confidence: 8, reputation: -2 }, tags: ["offense", "assertive"] },
      { id: "c", label: "Ask a veteran teammate to help you improve.", effects: { defense: 2, basketballIQ: 2, chemistry: 10 }, tags: ["defense", "mentorship"] },
      { id: "d", label: "Ignore the criticism and keep doing what works.", effects: { confidence: 5, reputation: -3 }, tags: ["stubborn"] },
    ],
  },
  {
    category: "OFFENSE",
    prompt: "The coaching staff wants to redesign the offense around a specific identity for next season.",
    options: [
      { id: "a", label: "Push for more shot attempts and a bigger scoring role.", effects: { shooting: 3, confidence: 6, reputation: 3 }, tags: ["offense", "scoring"] },
      { id: "b", label: "Volunteer to facilitate and get teammates more involved.", effects: { passing: 3, basketballIQ: 2, chemistry: 8 }, tags: ["playmaking", "unselfish"] },
      { id: "c", label: "Ask to develop a more complete, balanced game.", effects: { shooting: 1, passing: 1, defense: 1, basketballIQ: 1 }, tags: ["balanced"] },
      { id: "d", label: "Let the coaches decide — just show up and play.", effects: { chemistry: 4, confidence: -2 }, tags: ["passive"] },
    ],
  },
  {
    category: "LEADERSHIP",
    prompt: "The locker room is fractured after a rough stretch of losses. Some teammates look to you for direction.",
    options: [
      { id: "a", label: "Call a players-only meeting and set the tone yourself.", effects: { reputation: 5, chemistry: 10, confidence: 6, fatigue: 4 }, tags: ["leadership"] },
      { id: "b", label: "Let the veterans handle it — stay focused on your own game.", effects: { confidence: 3, chemistry: -4 }, tags: ["heads_down"] },
      { id: "c", label: "Talk to the coach privately about what's going wrong.", effects: { basketballIQ: 2 }, tags: ["quiet_leadership"] },
      { id: "d", label: "Publicly call out the effort level after the next loss.", effects: { reputation: 3, chemistry: -10, confidence: 5 }, tags: ["risky", "confrontational"] },
    ],
  },
  {
    category: "CHEMISTRY",
    prompt: "A new star teammate wants the ball in their hands late in games — the same moments you've owned all year.",
    options: [
      { id: "a", label: "Share the spotlight and build real chemistry with them.", effects: { chemistry: 14, passing: 2, reputation: -1 }, tags: ["chemistry", "unselfish"] },
      { id: "b", label: "Compete for it — the best player should close games.", effects: { confidence: 8, chemistry: -8, reputation: 2 }, tags: ["competitive"] },
      { id: "c", label: "Talk it out directly and agree on a plan together.", effects: { chemistry: 8, basketballIQ: 2 }, tags: ["communication"] },
      { id: "d", label: "Let the coach sort it out during the game.", effects: { chemistry: 2 }, tags: ["passive"] },
    ],
  },
  {
    category: "RECOVERY",
    prompt: "You're dealing with nagging soreness. The trainers suggest resting, but the team needs you.",
    options: [
      { id: "a", label: "Sit out and prioritize long-term health.", effects: { injuryRisk: -12, fatigue: -15, reputation: -1 }, tags: ["recovery", "cautious"] },
      { id: "b", label: "Play through it — the team comes first.", effects: { injuryRisk: 15, fatigue: 10, reputation: 4, confidence: 4, clutch: 2 }, tags: ["risk", "toughness"] },
      { id: "c", label: "Modify your workload with the training staff's plan.", effects: { injuryRisk: -4, fatigue: -5 }, tags: ["balanced"] },
      { id: "d", label: "Push through without telling anyone how bad it is.", effects: { injuryRisk: 20, confidence: 6 }, tags: ["risky", "hidden"] },
    ],
  },
  {
    category: "MEDIA",
    prompt: "A reporter asks you directly about your future and whether you're happy with the team's direction.",
    options: [
      { id: "a", label: "Stay diplomatic and deflect the question.", effects: { reputation: 1 }, tags: ["safe"] },
      { id: "b", label: "Be honest about wanting more help around you.", effects: { reputation: 4, confidence: 3 }, tags: ["honest", "bold"] },
      { id: "c", label: "Publicly commit to the team and the city.", effects: { reputation: 2, chemistry: 4 }, tags: ["loyalty"] },
      { id: "d", label: "Use the moment to send a message to a rival.", effects: { confidence: 6, reputation: 3, chemistry: -2 }, tags: ["rivalry", "bold"] },
    ],
  },
  {
    category: "TRAINING",
    prompt: "You have a full offseason ahead of you for the first time in years. How do you spend it?",
    options: [
      { id: "a", label: "Obsess over one signature skill until it's elite.", effects: { shooting: 4, confidence: 4, fatigue: 5 }, tags: ["specialist"] },
      { id: "b", label: "Work on becoming a more complete, versatile player.", effects: { passing: 2, defense: 2, ballHandling: 2 }, tags: ["balanced"] },
      { id: "c", label: "Focus entirely on strength and conditioning.", effects: { strength: 3, athleticism: 3, injuryRisk: -6 }, tags: ["physical"] },
      { id: "d", label: "Rest and recover fully before the grind starts again.", effects: { fatigue: -20, injuryRisk: -10, confidence: 3 }, tags: ["recovery"] },
    ],
  },
  {
    category: "RISK",
    prompt: "An opportunity comes up to play in a high-profile international showcase during the break.",
    options: [
      { id: "a", label: "Go all in — the exposure and competition are worth it.", effects: { reputation: 6, confidence: 5, fatigue: 10, injuryRisk: 6 }, tags: ["risk", "exposure"] },
      { id: "b", label: "Pass and prioritize rest for the season ahead.", effects: { fatigue: -10, injuryRisk: -4, reputation: -2 }, tags: ["cautious"] },
      { id: "c", label: "Go, but manage your minutes carefully.", effects: { reputation: 3, fatigue: 3, injuryRisk: 1 }, tags: ["balanced"] },
    ],
  },
  {
    category: "LOYALTY",
    phases: ["NBA"],
    prompt: "Trade rumors are swirling. Your name keeps coming up in speculation even though nothing's official.",
    options: [
      { id: "a", label: "Publicly ask to stay and commit to the franchise.", effects: { chemistry: 8, reputation: -1 }, tags: ["loyalty"] },
      { id: "b", label: "Stay quiet and let your agent handle it.", effects: { confidence: -2, chemistry: 2 }, tags: ["passive"] },
      { id: "c", label: "Make it known you'd welcome a fresh start.", effects: { reputation: 2, chemistry: -6, confidence: 4 }, tags: ["bold", "risky"] },
    ],
  },
  {
    category: "LOYALTY",
    phases: ["NCAA"],
    prompt: "A bigger program is quietly reaching out about a transfer. Your current coach recruited you personally.",
    options: [
      { id: "a", label: "Stay loyal to the coach who believed in you.", effects: { chemistry: 8, reputation: 1 }, tags: ["loyalty"] },
      { id: "b", label: "Take the meeting — you owe it to yourself to look.", effects: { reputation: 3, confidence: 4 }, tags: ["bold", "risky"] },
      { id: "c", label: "Use the interest as leverage for a bigger role here.", effects: { confidence: 6, reputation: 2 }, tags: ["assertive"] },
    ],
  },
  {
    category: "MEDIA",
    phases: ["NCAA"],
    prompt: "Draft analysts are debating your stock on national television, and not all of it is flattering.",
    options: [
      { id: "a", label: "Tune it out entirely and focus on the season.", effects: { confidence: 4, basketballIQ: 1 }, tags: ["focused"] },
      { id: "b", label: "Use it as motivation and say so publicly.", effects: { confidence: 7, reputation: 4, chemistry: -2 }, tags: ["bold"] },
      { id: "c", label: "Study the criticism and fix what's fair.", effects: { basketballIQ: 3, defense: 2 }, tags: ["balanced", "mentorship"] },
    ],
  },
];

export function generateSeasonDecision(
  rng: RNG,
  season: number,
  recentCategories: string[],
  phase: "NCAA" | "NBA" = "NBA"
): SeasonDecision {
  // Only scenarios valid for the current career phase.
  const phaseValid = TEMPLATES.filter((t) => !t.phases || t.phases.includes(phase));
  // Avoid repeating the same category two seasons in a row for variety.
  const pool = phaseValid.filter((t) => !recentCategories.includes(t.category));
  const template = pick(rng, pool.length > 0 ? pool : phaseValid);
  const { phases, ...rest } = template;
  return {
    ...rest,
    id: `decision_${season}_${template.category.toLowerCase()}`,
    season,
  };
}

export function applyDecisionEffects(person: Person, option: DecisionOption): Person {
  const attributes: Attributes = { ...person.attributes };
  const hidden: Hidden = { ...person.hidden };

  const attrKeys: (keyof Attributes)[] = [
    "shooting", "finishing", "passing", "ballHandling",
    "defense", "athleticism", "strength", "basketballIQ",
  ];
  const hiddenKeys: (keyof Omit<Hidden, "developmentRate">)[] = [
    "confidence", "reputation", "fanLove", "chemistry", "fatigue", "injuryRisk",
  ];

  for (const key of attrKeys) {
    if (option.effects[key] !== undefined) {
      attributes[key] = clamp(attributes[key] + (option.effects[key] as number), 30, 99);
    }
  }
  for (const key of hiddenKeys) {
    if (option.effects[key] !== undefined) {
      hidden[key] = clamp(hidden[key] + (option.effects[key] as number), 0, 100);
    }
  }

  return { ...person, attributes, hidden };
}
