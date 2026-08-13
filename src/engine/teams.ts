import { Position } from "./types";
import { RNG, clamp, pick, randInt } from "./rng";

// ============================================================
// TEAMS
// Teams become a place the player lives, not a data field. Every team has a
// real name, an overall rating, and a generated roster the player slots into.
// ============================================================

export type League = "NCAA" | "NBA" | "INTL";

export type Team = {
  id: string;
  name: string;
  abbr: string;
  league: League;
  conference: string;
  ovr: number; // 60-97 TEAM strength (never confuse with a player's overall)
  market: "SMALL" | "MID" | "LARGE";
  /** Optional real crest. Populate centrally in identity.ts; screens never hardcode. */
  logo?: string;
};

export type RosterSlot = {
  position: Position;
  name: string;
  ovr: number;
  isPlayer: boolean;
};

/** Recruiting profile shown on the college-choice screen. */
export type CollegeProfile = {
  team: Team;
  prestige: number;   // 1-5 stars
  competition: number; // 1-5 stars — how stacked the roster already is
  pressure: "Low" | "Medium" | "High" | "Extreme";
  expectedRole: string;
  pitch: string;
};

export const NCAA_TEAMS: Team[] = [
  { id: "kansas", name: "Kansas Jayhawks", abbr: "KU", league: "NCAA", conference: "Big 12", ovr: 87, market: "MID" },
  { id: "duke", name: "Duke Blue Devils", abbr: "DUKE", league: "NCAA", conference: "ACC", ovr: 89, market: "LARGE" },
  { id: "kentucky", name: "Kentucky Wildcats", abbr: "UK", league: "NCAA", conference: "SEC", ovr: 88, market: "LARGE" },
  { id: "unc", name: "North Carolina Tar Heels", abbr: "UNC", league: "NCAA", conference: "ACC", ovr: 86, market: "LARGE" },
  { id: "gonzaga", name: "Gonzaga Bulldogs", abbr: "GONZ", league: "NCAA", conference: "WCC", ovr: 84, market: "SMALL" },
  { id: "ucla", name: "UCLA Bruins", abbr: "UCLA", league: "NCAA", conference: "Big Ten", ovr: 83, market: "LARGE" },
  { id: "villanova", name: "Villanova Wildcats", abbr: "NOVA", league: "NCAA", conference: "Big East", ovr: 81, market: "MID" },
  { id: "baylor", name: "Baylor Bears", abbr: "BAY", league: "NCAA", conference: "Big 12", ovr: 80, market: "SMALL" },
  { id: "arizona", name: "Arizona Wildcats", abbr: "ARIZ", league: "NCAA", conference: "Big 12", ovr: 82, market: "MID" },
  { id: "michigan", name: "Michigan Wolverines", abbr: "MICH", league: "NCAA", conference: "Big Ten", ovr: 79, market: "MID" },
  { id: "uconn", name: "UConn Huskies", abbr: "UCONN", league: "NCAA", conference: "Big East", ovr: 85, market: "MID" },
  { id: "houston_c", name: "Houston Cougars", abbr: "HOU", league: "NCAA", conference: "Big 12", ovr: 82, market: "MID" },
  { id: "creighton", name: "Creighton Bluejays", abbr: "CREI", league: "NCAA", conference: "Big East", ovr: 77, market: "SMALL" },
  { id: "dayton", name: "Dayton Flyers", abbr: "DAY", league: "NCAA", conference: "A-10", ovr: 73, market: "SMALL" },
];

/**
 * Turns a program into a real choice: a blue blood means elite teammates but
 * you have to earn minutes; a mid-major hands you the offense immediately.
 * Expected role is computed against the incoming player, so it's honest.
 */
export function collegeProfile(team: Team, incomingOvr: number): CollegeProfile {
  const prestige = team.ovr >= 87 ? 5 : team.ovr >= 83 ? 4 : team.ovr >= 78 ? 3 : team.ovr >= 72 ? 2 : 1;
  const competition = prestige;
  const gap = incomingOvr - team.ovr;

  const expectedRole =
    gap >= 2 ? "Immediate star" :
    gap >= -6 ? "Starter" :
    gap >= -13 ? "Rotation" : "Bench";

  const pressure: CollegeProfile["pressure"] =
    prestige >= 5 ? "Extreme" : prestige >= 4 ? "High" : prestige >= 3 ? "Medium" : "Low";

  const pitch =
    prestige >= 4
      ? "Elite teammates and a real title shot — if you can earn the minutes."
      : prestige === 3
      ? "A balanced program where you can grow into the main option."
      : "The offense is yours from day one. Nobody here will outshine you.";

  return { team, prestige, competition, pressure, expectedRole, pitch };
}

export const NBA_TEAMS: Team[] = [
  // East — Atlantic
  { id: "bos", name: "Boston Celtics", abbr: "BOS", league: "NBA", conference: "East", ovr: 92, market: "LARGE" },
  { id: "nyk", name: "New York Knicks", abbr: "NYK", league: "NBA", conference: "East", ovr: 84, market: "LARGE" },
  { id: "phi", name: "Philadelphia 76ers", abbr: "PHI", league: "NBA", conference: "East", ovr: 85, market: "LARGE" },
  { id: "bkn", name: "Brooklyn Nets", abbr: "BKN", league: "NBA", conference: "East", ovr: 71, market: "LARGE" },
  { id: "tor", name: "Toronto Raptors", abbr: "TOR", league: "NBA", conference: "East", ovr: 73, market: "MID" },
  // East — Central
  { id: "mil", name: "Milwaukee Bucks", abbr: "MIL", league: "NBA", conference: "East", ovr: 86, market: "SMALL" },
  { id: "cle", name: "Cleveland Cavaliers", abbr: "CLE", league: "NBA", conference: "East", ovr: 84, market: "MID" },
  { id: "ind", name: "Indiana Pacers", abbr: "IND", league: "NBA", conference: "East", ovr: 82, market: "SMALL" },
  { id: "chi", name: "Chicago Bulls", abbr: "CHI", league: "NBA", conference: "East", ovr: 74, market: "LARGE" },
  { id: "det", name: "Detroit Pistons", abbr: "DET", league: "NBA", conference: "East", ovr: 68, market: "MID" },
  // East — Southeast
  { id: "mia", name: "Miami Heat", abbr: "MIA", league: "NBA", conference: "East", ovr: 83, market: "LARGE" },
  { id: "orl", name: "Orlando Magic", abbr: "ORL", league: "NBA", conference: "East", ovr: 82, market: "MID" },
  { id: "atl", name: "Atlanta Hawks", abbr: "ATL", league: "NBA", conference: "East", ovr: 77, market: "MID" },
  { id: "cha", name: "Charlotte Hornets", abbr: "CHA", league: "NBA", conference: "East", ovr: 69, market: "SMALL" },
  { id: "was", name: "Washington Wizards", abbr: "WAS", league: "NBA", conference: "East", ovr: 66, market: "MID" },
  // West — Pacific
  { id: "lal", name: "Los Angeles Lakers", abbr: "LAL", league: "NBA", conference: "West", ovr: 86, market: "LARGE" },
  { id: "gsw", name: "Golden State Warriors", abbr: "GSW", league: "NBA", conference: "West", ovr: 84, market: "LARGE" },
  { id: "lac", name: "LA Clippers", abbr: "LAC", league: "NBA", conference: "West", ovr: 80, market: "LARGE" },
  { id: "phx", name: "Phoenix Suns", abbr: "PHX", league: "NBA", conference: "West", ovr: 81, market: "MID" },
  { id: "sac", name: "Sacramento Kings", abbr: "SAC", league: "NBA", conference: "West", ovr: 78, market: "SMALL" },
  // West — Northwest
  { id: "okc", name: "Oklahoma City Thunder", abbr: "OKC", league: "NBA", conference: "West", ovr: 90, market: "SMALL" },
  { id: "den", name: "Denver Nuggets", abbr: "DEN", league: "NBA", conference: "West", ovr: 89, market: "MID" },
  { id: "min", name: "Minnesota Timberwolves", abbr: "MIN", league: "NBA", conference: "West", ovr: 85, market: "MID" },
  { id: "uta", name: "Utah Jazz", abbr: "UTA", league: "NBA", conference: "West", ovr: 67, market: "SMALL" },
  { id: "por", name: "Portland Trail Blazers", abbr: "POR", league: "NBA", conference: "West", ovr: 68, market: "SMALL" },
  // West — Southwest
  { id: "dal", name: "Dallas Mavericks", abbr: "DAL", league: "NBA", conference: "West", ovr: 87, market: "LARGE" },
  { id: "mem", name: "Memphis Grizzlies", abbr: "MEM", league: "NBA", conference: "West", ovr: 79, market: "SMALL" },
  { id: "hou", name: "Houston Rockets", abbr: "HOU", league: "NBA", conference: "West", ovr: 83, market: "MID" },
  { id: "nop", name: "New Orleans Pelicans", abbr: "NOP", league: "NBA", conference: "West", ovr: 76, market: "SMALL" },
  { id: "sas", name: "San Antonio Spurs", abbr: "SAS", league: "NBA", conference: "West", ovr: 75, market: "MID" },
];

// National teams — the player's own country is generated on the fly so any
// country works, not just the ones listed here.
const NATIONAL_OVR: Record<string, number> = {
  "united states": 96, usa: 96, spain: 88, france: 87, serbia: 87, australia: 84,
  canada: 86, argentina: 82, germany: 85, greece: 83, slovenia: 82, lithuania: 81,
  brazil: 79, italy: 80, colombia: 74, mexico: 72, "puerto rico": 75, nigeria: 78,
  japan: 73, china: 76, "dominican republic": 76, venezuela: 74, philippines: 70,
};

export function nationalTeam(country: string): Team {
  const key = country.trim().toLowerCase();
  const ovr = NATIONAL_OVR[key] ?? 75;
  return {
    id: `intl_${key.replace(/\s+/g, "_")}`,
    name: country.trim() || "Your Country",
    abbr: country.trim().slice(0, 3).toUpperCase() || "NAT",
    league: "INTL",
    conference: "International",
    ovr,
    market: "MID",
  };
}

export function teamById(id: string): Team | null {
  return [...NCAA_TEAMS, ...NBA_TEAMS].find((t) => t.id === id) ?? null;
}

/* ---------------- Roster generation ---------------- */

const FIRST = ["Marcus", "Tyrese", "Jalen", "Andre", "Devin", "Kobe", "Malik", "Trey", "Bryce", "Elijah", "Zion", "Cade", "Jaden", "Amari", "Damian", "Josiah", "Keon", "Rashad"];
const LAST = ["Whitfield", "Barnes", "Okonkwo", "Ramsey", "Delgado", "Foster", "Nakamura", "Castillo", "Boateng", "Vasquez", "Ellington", "Petrov", "Mensah", "Kowalski", "Ibarra", "Sundberg"];
const ALL_POS: Position[] = ["PG", "SG", "SF", "PF", "C"];

// The roster is derived from team OVR so a strong team visibly has strong
// teammates. The player's own slot is filled in by buildRoster's caller.
export function buildRoster(rng: RNG, team: Team, playerPosition: Position, playerOvr: number): RosterSlot[] {
  return ALL_POS.map((pos) => {
    if (pos === playerPosition) {
      return { position: pos, name: "YOU", ovr: playerOvr, isPlayer: true };
    }
    const spread = randInt(rng, -7, 7);
    return {
      position: pos,
      name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
      ovr: clamp(Math.round(team.ovr + spread - 2), 55, 97),
      isPlayer: false,
    };
  });
}

// Supporting-cast strength ignores the player's own rating, so "team quality
// around you" stays honest when the player is carrying a weak roster.
export function supportingCastOvr(roster: RosterSlot[]): number {
  const others = roster.filter((r) => !r.isPlayer);
  if (others.length === 0) return 70;
  return Math.round(others.reduce((s, r) => s + r.ovr, 0) / others.length);
}

// Team strength on the 0-1 scale the existing simulation expects.
export function teamOvrToStrength(ovr: number): number {
  return clamp((ovr - 62) / 36, 0.08, 0.96);
}
