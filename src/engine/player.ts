import { Attributes, Hidden, Person, Playstyle, Position, Rival, RivalArc } from "./types";
import { RNG, randInt, randRange, clamp } from "./rng";
import { initialDevelopmentRate } from "./growth";
import { PLAYSTYLE_PROFILES, startingBias } from "./playstyle";
import { NCAA_TEAMS } from "./teams";

const BASE_ATTRIBUTE_FLOOR = 45; // every rookie is already a top prospect, not a random scrub

function baseAttributes(rng: RNG, playstyle: Playstyle): Attributes {
  const bias = startingBias(PLAYSTYLE_PROFILES[playstyle]);
  const attrs: Attributes = {
    shooting: BASE_ATTRIBUTE_FLOOR,
    finishing: BASE_ATTRIBUTE_FLOOR,
    passing: BASE_ATTRIBUTE_FLOOR,
    ballHandling: BASE_ATTRIBUTE_FLOOR,
    defense: BASE_ATTRIBUTE_FLOOR,
    athleticism: BASE_ATTRIBUTE_FLOOR,
    strength: BASE_ATTRIBUTE_FLOOR,
    basketballIQ: BASE_ATTRIBUTE_FLOOR,
    clutch: BASE_ATTRIBUTE_FLOOR,
  };
  for (const key of Object.keys(attrs) as (keyof Attributes)[]) {
    attrs[key] += bias[key] ?? 0;
    attrs[key] += randInt(rng, -3, 3); // small variance so no two scorers start identical
    attrs[key] = clamp(attrs[key], 40, 70); // rookies have room to grow; nobody starts maxed
  }
  return attrs;
}

function baseHidden(rng: RNG): Hidden {
  return {
    confidence: randInt(rng, 55, 70),
    reputation: randInt(rng, 20, 35), // reputation is earned, starts low even for elite prospects
    fanLove: randInt(rng, 15, 30), // fans don't know you yet either
    chemistry: randInt(rng, 50, 65),
    fatigue: 0,
    injuryRisk: randInt(rng, 5, 15),
    developmentRate: initialDevelopmentRate(rng), // neutral efficiency — NOT a fixed potential ceiling.
    // Every player, including the archrival, has a genuine elite ceiling (99
    // attributes). This number only affects how fast they close the gap to it,
    // and it keeps moving every season based on how the career actually goes.
  };
}

export function createPlayer(
  rng: RNG,
  input: { name: string; country: string; position: Position; height: number; playstyle: Playstyle }
): Person {
  return {
    id: "player",
    name: input.name,
    country: input.country,
    position: input.position,
    height: input.height,
    playstyle: input.playstyle,
    attributes: baseAttributes(rng, input.playstyle),
    hidden: baseHidden(rng),
    seasonStats: [],
    awards: [],
    events: [],
    draftStock: 50,
    retired: false,
  };
}

const RIVAL_NAME_POOL = [
  "Darius Cole", "Marcus Webb", "Antoine Reyes", "Jaylen Marsh", "Devon Okafor",
  "Tyrell Banks", "Xavier Holt", "Malik Freeman", "Cedric Vance", "Isaiah Thorne",
];

const RIVAL_ARCS: RivalArc[] = ["STEADY_RISER", "EARLY_STAR_PLATEAU", "LATE_BLOOMER", "INJURY_PRONE"];

export function createRival(rng: RNG, avoidPosition?: Position): Rival {
  const playstyles = Object.keys(PLAYSTYLE_PROFILES) as Playstyle[];
  const playstyle = playstyles[randInt(rng, 0, playstyles.length - 1)];
  const arc = RIVAL_ARCS[randInt(rng, 0, RIVAL_ARCS.length - 1)];

  // NOTE: the arc no longer pins developmentRate into a fixed range — that
  // was a disguised potential ceiling. Every rival starts with the same
  // neutral developmentRate as the player (baseHidden below) and has a real
  // path to elite. The arc only biases WHEN their growth happens and which
  // decisions their AI favors (see growthBiasForArc() in rival.ts) — a
  // "late bloomer" grows slowly at first and surges later, not permanently less.
  const base = baseAttributes(rng, playstyle);
  const hidden = baseHidden(rng);
  if (arc === "INJURY_PRONE") hidden.injuryRisk = randInt(rng, 25, 40);

  const positions: Position[] = ["PG", "SG", "SF", "PF", "C"];
  const position = avoidPosition
    ? positions.filter((p) => p !== avoidPosition)[randInt(rng, 0, 3)]
    : positions[randInt(rng, 0, 4)];

  // A real registered school, not a bare "College" placeholder — so he reads
  // as an actual program when he shows up as a bracket opponent or wins a
  // title, same reasoning that already gave him a real NBA club on turning pro.
  const startingSchool = NCAA_TEAMS[randInt(rng, 0, NCAA_TEAMS.length - 1)];

  return {
    id: "rival",
    name: RIVAL_NAME_POOL[randInt(rng, 0, RIVAL_NAME_POOL.length - 1)],
    country: "USA",
    position,
    height: randInt(rng, 190, 213),
    playstyle,
    attributes: base,
    hidden,
    seasonStats: [],
    awards: [],
    events: [],
    draftStock: 50,
    retired: false,
    arc,
    narrativeState: "UNPROVEN",
    team: startingSchool.name,
    teamId: startingSchool.id,
  };
}
