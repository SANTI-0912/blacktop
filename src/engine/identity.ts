import { Team } from "./teams";

// ============================================================
// TEAM IDENTITY / LOGOS
//
// One reusable source of truth. Screens call getTeamIdentity(teamId) — no
// screen ever hardcodes a colour or a crest. Real logo assets can be dropped
// in later by filling `assetUrl` in OVERRIDES; every screen picks them up
// automatically with no other change.
// ============================================================

export type TeamIdentity = {
  id: string;
  primary: string;
  secondary: string;
  /** Short monogram drawn inside the crest. */
  monogram: string;
  /** Crest silhouette — varies so programs are visually distinguishable. */
  shape: "shield" | "circle" | "diamond" | "banner";
  /** Populate to use a real image instead of the procedural crest. */
  assetUrl?: string;
};

const PALETTES: { primary: string; secondary: string }[] = [
  { primary: "#1D4ED8", secondary: "#93C5FD" },
  { primary: "#B91C1C", secondary: "#FCA5A5" },
  { primary: "#047857", secondary: "#6EE7B7" },
  { primary: "#6D28D9", secondary: "#C4B5FD" },
  { primary: "#B45309", secondary: "#FCD34D" },
  { primary: "#0E7490", secondary: "#67E8F9" },
  { primary: "#BE185D", secondary: "#F9A8D4" },
  { primary: "#3F3F46", secondary: "#D4D4D8" },
];

const SHAPES: TeamIdentity["shape"][] = ["shield", "circle", "diamond", "banner"];

// ============================================================
// REAL LOGO ASSETS — SINGLE POINT OF REGISTRATION
//
// Drop real crest files into /public/logos/ and register them here ONCE.
// Every screen in the app already renders through getTeamIdentity + <TeamLogo>,
// so filling this map is the only change needed to swap the procedural crests
// for official artwork. Nothing is hardcoded per screen.
//
// Example once assets are available:
//   bos: "/logos/bos.svg",
//   lal: "/logos/lal.svg",
//
// Left empty by default because official NBA/NCAA marks are licensed and
// aren't redistributable with the project.
// ESPN's public CDN serves authentic crests for every NBA franchise and the
// major NCAA programs. Using a reliable external URL rather than inventing a
// fake shield, per the design brief. To self-host instead, drop files in
// /public/logos and change these strings — nothing else in the app changes.
const NBA_LOGO = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;
const NCAA_LOGO = (espnId: number) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;

// ESPN program ids for the NCAA teams in the pool.
const NCAA_IDS: Record<string, number> = {
  duke: 150, kansas: 2305, kentucky: 96, unc: 153, ucla: 26,
  gonzaga: 2250, arizona: 12, villanova: 222, uconn: 41, michigan: 130,
  houston_c: 248, creighton: 156, dayton: 2168, baylor: 239,
};

export const LOGO_ASSETS: Record<string, string> = {
  // NBA — all 30
  bos: NBA_LOGO("bos"), nyk: NBA_LOGO("ny"), phi: NBA_LOGO("phi"), bkn: NBA_LOGO("bkn"), tor: NBA_LOGO("tor"),
  mil: NBA_LOGO("mil"), cle: NBA_LOGO("cle"), ind: NBA_LOGO("ind"), chi: NBA_LOGO("chi"), det: NBA_LOGO("det"),
  mia: NBA_LOGO("mia"), orl: NBA_LOGO("orl"), atl: NBA_LOGO("atl"), cha: NBA_LOGO("cha"), was: NBA_LOGO("wsh"),
  lal: NBA_LOGO("lal"), gsw: NBA_LOGO("gs"), lac: NBA_LOGO("lac"), phx: NBA_LOGO("phx"), sac: NBA_LOGO("sac"),
  okc: NBA_LOGO("okc"), den: NBA_LOGO("den"), min: NBA_LOGO("min"), uta: NBA_LOGO("utah"), por: NBA_LOGO("por"),
  dal: NBA_LOGO("dal"), mem: NBA_LOGO("mem"), hou: NBA_LOGO("hou"), nop: NBA_LOGO("no"), sas: NBA_LOGO("sa"),
  // NCAA
  ...Object.fromEntries(Object.entries(NCAA_IDS).map(([id, espn]) => [id, NCAA_LOGO(espn)])),
};

// Real-world team colours, so the fallback crests still read as the right club.
const OVERRIDES: Record<string, Partial<TeamIdentity>> = {
  duke: { primary: "#0736A4", secondary: "#C7D6F5", shape: "shield" },
  kansas: { primary: "#0051BA", secondary: "#E8000D", shape: "shield" },
  kentucky: { primary: "#0033A0", secondary: "#FFFFFF", shape: "circle" },
  unc: { primary: "#4B9CD3", secondary: "#FFFFFF", shape: "circle" },
  ucla: { primary: "#2D68C4", secondary: "#F2A900", shape: "shield" },
  gonzaga: { primary: "#041E42", secondary: "#C8102E", shape: "banner" },
  arizona: { primary: "#AB0520", secondary: "#0C234B", shape: "shield" },
  villanova: { primary: "#00205B", secondary: "#13B5EA", shape: "diamond" },
  uconn: { primary: "#000E2F", secondary: "#E4002B", shape: "shield" },
  michigan: { primary: "#00274C", secondary: "#FFCB05", shape: "banner" },
  bos: { primary: "#007A33", secondary: "#BA9653", shape: "circle" },
  lal: { primary: "#552583", secondary: "#FDB927", shape: "circle" },
  nyk: { primary: "#006BB6", secondary: "#F58426", shape: "circle" },
  den: { primary: "#0E2240", secondary: "#FEC524", shape: "diamond" },
  okc: { primary: "#007AC1", secondary: "#EF3B24", shape: "shield" },
  mia: { primary: "#98002E", secondary: "#F9A01B", shape: "circle" },
  mem: { primary: "#5D76A9", secondary: "#12173F", shape: "shield" },
  sac: { primary: "#5A2D81", secondary: "#63727A", shape: "circle" },
  orl: { primary: "#0077C0", secondary: "#C4CED4", shape: "circle" },
  cha: { primary: "#1D1160", secondary: "#00788C", shape: "shield" },
  por: { primary: "#E03A3E", secondary: "#000000", shape: "banner" },
  hou: { primary: "#CE1141", secondary: "#000000", shape: "circle" },
  phi: { primary: "#006BB6", secondary: "#ED174C", shape: "shield" },
  tor: { primary: "#CE1141", secondary: "#000000", shape: "circle" },
  uta: { primary: "#002B5C", secondary: "#F9A01B", shape: "diamond" },
  atl: { primary: "#E03A3E", secondary: "#C1D32F", shape: "banner" },
  gsw: { primary: "#1D428A", secondary: "#FFC72C", shape: "circle" },
  dal: { primary: "#00538C", secondary: "#B8C4CA", shape: "shield" },
  mil: { primary: "#00471B", secondary: "#EEE1C6", shape: "shield" },
  min: { primary: "#0C2340", secondary: "#78BE20", shape: "diamond" },
  cle: { primary: "#860038", secondary: "#FDBB30", shape: "shield" },
  ind: { primary: "#002D62", secondary: "#FDBB30", shape: "circle" },
  chi: { primary: "#CE1141", secondary: "#000000", shape: "shield" },
  det: { primary: "#C8102E", secondary: "#1D42BA", shape: "circle" },
  bkn: { primary: "#000000", secondary: "#FFFFFF", shape: "shield" },
  was: { primary: "#002B5C", secondary: "#E31837", shape: "banner" },
  lac: { primary: "#C8102E", secondary: "#1D428A", shape: "circle" },
  phx: { primary: "#1D1160", secondary: "#E56020", shape: "diamond" },
  nop: { primary: "#0C2340", secondary: "#C8102E", shape: "shield" },
  sas: { primary: "#C4CED4", secondary: "#000000", shape: "banner" },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getTeamIdentity(team: Team | { id: string; abbr: string; name: string }): TeamIdentity {
  const h = hash(team.id);
  const pal = PALETTES[h % PALETTES.length];
  const base: TeamIdentity = {
    id: team.id,
    primary: pal.primary,
    secondary: pal.secondary,
    monogram: team.abbr.slice(0, 4).toUpperCase(),
    shape: SHAPES[(h >> 3) % SHAPES.length],
  };
  const asset = LOGO_ASSETS[team.id];
  return { ...base, ...(OVERRIDES[team.id] ?? {}), ...(asset ? { assetUrl: asset } : {}) };
}

/** Nation crest for Olympic screens — same interface, generated from country name. */
export function getNationIdentity(country: string): TeamIdentity {
  const id = `nation_${country.toLowerCase().replace(/\s+/g, "_")}`;
  const h = hash(id);
  const pal = PALETTES[h % PALETTES.length];
  return {
    id,
    primary: pal.primary,
    secondary: pal.secondary,
    monogram: country.slice(0, 3).toUpperCase(),
    shape: "shield",
  };
}
