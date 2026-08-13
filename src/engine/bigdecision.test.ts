import { describe, it, expect } from "vitest";
import {
  generateCareerCall, bigDecisionConsequence, generateTeamOffers, CallOption, TeamOption,
  STAY_FAN_LOVE_BUMP,
} from "./bigdecision";
import { createRNG } from "./rng";
import { createPlayer } from "./player";
import { NBA_TEAMS } from "./teams";
import { initialFanLoveForTeamChange, fanLoveTier } from "./fanlove";

describe("CALLS content completeness", () => {
  it("every CallOption has a non-empty result distinct from its label and detail", () => {
    // Draw every prompt at least once by sampling many seeds.
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const call = generateCareerCall(createRNG(seed), 1);
      seen.add(call.prompt);
      for (const o of call.options as CallOption[]) {
        expect(o.result, `call "${call.prompt}" option "${o.id}" is missing a result`).toBeTruthy();
        expect(o.result).not.toBe(o.label);
        expect(o.result).not.toBe(o.detail);
      }
    }
    expect(seen.size).toBe(5); // sanity: all 5 CALLS prompts got sampled
  });
});

describe("generateTeamOffers — salary reflects age and recent performance, not just OVR", () => {
  const player = createPlayer(createRNG(1), { name: "T", country: "USA", position: "SF", height: 201, playstyle: "TWO_WAY" });
  const currentTeam = NBA_TEAMS[0];

  function staySalary(age: number, performanceScore: number): number {
    const d = generateTeamOffers(createRNG(5), player, 90, currentTeam, "NBA", age, performanceScore, 20, 3);
    const stay = d.options.find((o) => (o as TeamOption).id === `stay_${currentTeam.id}`) as TeamOption;
    return stay.salary!;
  }

  it("pays a prime-age player meaningfully more than an aging veteran at the same OVR and form", () => {
    const primeSalary = staySalary(28, 0.75);
    const veteranSalary = staySalary(38, 0.75);
    expect(primeSalary).toBeGreaterThan(veteranSalary + 20);
  });

  it("pays a young, near-rookie-scale player less than a prime-age player at the same OVR and form", () => {
    const rookieSalary = staySalary(20, 0.75);
    const primeSalary = staySalary(28, 0.75);
    expect(rookieSalary).toBeLessThan(primeSalary);
  });

  it("pays a player outperforming their rating more than one underperforming it, same age and OVR", () => {
    const strongForm = staySalary(28, 1.2);
    const weakForm = staySalary(28, 0.3);
    expect(strongForm).toBeGreaterThan(weakForm);
  });

  it("never generates a salary for NCAA offers, regardless of age/performance", () => {
    const d = generateTeamOffers(createRNG(7), player, 65, NBA_TEAMS[2], "NCAA", 19, 0.8, 0, 0);
    for (const o of d.options as TeamOption[]) expect(o.salary).toBeUndefined();
  });
});

describe("generateTeamOffers — every NBA offer shows how its salary compares to the player's current deal", () => {
  const player = createPlayer(createRNG(3), { name: "T", country: "USA", position: "C", height: 213, playstyle: "INTERIOR" });
  const currentTeam = NBA_TEAMS[2];

  it("adds a raise/cut/roughly-the-same bullet to the market stay and every join offer", () => {
    const d = generateTeamOffers(createRNG(11), player, 88, currentTeam, "NBA", 29, 0.9, 20, 3);
    const options = d.options as TeamOption[];
    expect(options.length).toBeGreaterThan(1);
    for (const o of options) {
      const hasContextBullet = o.bullets.some(
        (b) => b.includes("your current $20M/yr")
      );
      expect(hasContextBullet, `option "${o.id}" (salary ${o.salary}) is missing a salary-context bullet`).toBe(true);
    }
  });

  it("labels a meaningfully higher salary as a raise", () => {
    const highSalary = generateTeamOffers(createRNG(1), player, 95, currentTeam, "NBA", 29, 1.2, 20, 3);
    const stayHigh = (highSalary.options as TeamOption[]).find((o) => o.id === `stay_${currentTeam.id}`)!;
    expect(stayHigh.salary!).toBeGreaterThan(23);
    expect(stayHigh.bullets.some((b) => b.startsWith("A raise"))).toBe(true);
  });

  it("adds no salary-context bullet when there is no prior salary to compare against (currentSalary 0)", () => {
    const d = generateTeamOffers(createRNG(11), player, 88, currentTeam, "NBA", 29, 0.9, 0, 3);
    for (const o of d.options as TeamOption[]) {
      expect(o.bullets.some((b) => b.includes("your current"))).toBe(false);
    }
  });
});

describe("generateTeamOffers — every option previews its actual Fan Love effect", () => {
  const player = createPlayer(createRNG(4), { name: "T", country: "USA", position: "SG", height: 196, playstyle: "SHARPSHOOTER" });
  const currentTeam = NBA_TEAMS[3];

  it("tells the player the exact +4 they'd earn for staying at market value", () => {
    const d = generateTeamOffers(createRNG(6), player, 84, currentTeam, "NBA", 27, 0.8, 18, 4);
    const stay = (d.options as TeamOption[]).find((o) => o.id === `stay_${currentTeam.id}`)!;
    expect(stay.bullets.some((b) => b === `Staying loyal earns +${STAY_FAN_LOVE_BUMP} Fan Love`)).toBe(true);
    expect(STAY_FAN_LOVE_BUMP).toBe(4);
  });

  it("tells the player exactly what Fan Love (and tier) they'd start at on every team they could join", () => {
    const nbaSeasonsPlayed = 4;
    const d = generateTeamOffers(createRNG(6), player, 84, currentTeam, "NBA", 27, 0.8, 18, nbaSeasonsPlayed);
    const joins = (d.options as TeamOption[]).filter((o) => o.id.startsWith("join_"));
    expect(joins.length).toBeGreaterThan(0);
    // The preview must factor in the join's own +3 reputation bump
    // (applyDecisionEffects runs before the Fan Love reset in
    // career.ts's applyBigDecision) — not the pre-move reputation.
    const join = joins[0] as TeamOption;
    expect(join.effects.reputation).toBe(3);
    const reputationAfterMove = player.hidden.reputation + (join.effects.reputation ?? 0);
    const expected = Math.round(initialFanLoveForTeamChange(reputationAfterMove, player.awards, nbaSeasonsPlayed));
    for (const j of joins) {
      expect(j.bullets.some((b) => b === `Starts at ${expected}/100 Fan Love (${fanLoveTier(expected)})`)).toBe(true);
    }
  });
});

describe("bigDecisionConsequence", () => {
  it("returns the authored result for a CAREER_CALL", () => {
    const call = generateCareerCall(createRNG(1), 1);
    const text = bigDecisionConsequence(call, call.options[0].id, false, "", "UNKNOWN");
    expect(text).toBe((call.options[0] as any).result);
  });

  it("returns a templated line for a TEAM_OFFER, distinguishing moved vs. stayed", () => {
    const decision = { kind: "TEAM_OFFER" as const, id: "x", season: 1, prompt: "p", options: [
      { id: "stay", team: {} as any, headline: "h", bullets: [], effects: {} },
      { id: "join", team: {} as any, headline: "h2", bullets: [], effects: {} },
    ] };
    const stayed = bigDecisionConsequence(decision, "stay", false, "Boston Celtics", "UNKNOWN");
    const moved = bigDecisionConsequence(decision, "join", true, "Miami Heat", "UNKNOWN");
    expect(stayed).toContain("Boston Celtics");
    expect(moved).toContain("Miami Heat");
    expect(stayed).not.toBe(moved);
  });

  it("gives a status-aware line for an accomplished player who moves teams", () => {
    const decision = { kind: "TEAM_OFFER" as const, id: "t", season: 5, prompt: "p", options: [
      { id: "join", team: {} as any, headline: "h", bullets: [], effects: {} },
    ] };
    const text = bigDecisionConsequence(decision, "join", true, "Miami Heat", "ALL_STAR");
    expect(text).toContain("already know exactly who they're getting");
  });
});
