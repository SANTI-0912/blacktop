import { Contract, ContractOffer, Person } from "./types";
import { RNG, randInt, randRange, clamp } from "./rng";

const TEAM_POOL: { name: string; market: ContractOffer["marketSize"]; baseStrength: number }[] = [
  { name: "Los Angeles", market: "LARGE", baseStrength: 0.65 },
  { name: "New York", market: "LARGE", baseStrength: 0.55 },
  { name: "Boston", market: "LARGE", baseStrength: 0.75 },
  { name: "Miami", market: "LARGE", baseStrength: 0.6 },
  { name: "Denver", market: "MID", baseStrength: 0.7 },
  { name: "Oklahoma City", market: "MID", baseStrength: 0.72 },
  { name: "Memphis", market: "MID", baseStrength: 0.58 },
  { name: "Sacramento", market: "MID", baseStrength: 0.5 },
  { name: "Charlotte", market: "SMALL", baseStrength: 0.4 },
  { name: "Indiana", market: "SMALL", baseStrength: 0.52 },
];

export function generateContractOffers(rng: RNG, player: Person, currentTeam: string | null): ContractOffer[] {
  const reputationFactor = player.hidden.reputation / 100;
  const avgPerf =
    player.seasonStats.length > 0
      ? player.seasonStats.slice(-3).reduce((s, x) => s + x.performanceScore, 0) / Math.min(3, player.seasonStats.length)
      : 0.5;

  const pool = [...TEAM_POOL].sort(() => rng.next() - 0.5).slice(0, 3);
  const offers: ContractOffer[] = [];

  if (currentTeam) {
    offers.push(buildOffer(rng, currentTeam, 0.6, reputationFactor, avgPerf, "STAR"));
  }

  for (const team of pool) {
    if (team.name === currentTeam) continue;
    const role = avgPerf > 0.75 ? "STAR" : avgPerf > 0.55 ? "CO_STAR" : "STARTER";
    offers.push(buildOffer(rng, team.name, team.baseStrength, reputationFactor, avgPerf, role));
  }

  return offers.slice(0, 4);
}

function buildOffer(
  rng: RNG,
  team: string,
  teamStrength: number,
  reputationFactor: number,
  avgPerf: number,
  role: ContractOffer["roleOffered"]
): ContractOffer {
  const years = rng.next() > 0.5 ? 3 : 2;
  const baseSalary = 15 + reputationFactor * 40 + avgPerf * 60;
  const salaryPerYear = clamp(Math.round(baseSalary + randRange(rng, -15, 15)), 8, 240);
  const champWindow = clamp(teamStrength + randRange(rng, -0.1, 0.15), 0.05, 0.95);
  const marketSize: ContractOffer["marketSize"] =
    teamStrength > 0.65 ? "LARGE" : teamStrength > 0.5 ? "MID" : "SMALL";

  return {
    team,
    years: years as 2 | 3,
    salaryPerYear,
    marketSize,
    champWindow,
    roleOffered: role,
    teamStrength: clamp(teamStrength + randRange(rng, -0.05, 0.05), 0.1, 0.95),
  };
}

export function signContract(offer: ContractOffer): Contract {
  return {
    team: offer.team,
    years: offer.years,
    salaryPerYear: offer.salaryPerYear,
    yearsRemaining: offer.years,
    teamStrength: offer.teamStrength,
    champWindow: offer.champWindow,
  };
}
