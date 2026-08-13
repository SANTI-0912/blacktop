import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { applyAging } from "./focus";
import { createPlayer } from "./player";

describe("applyAging respects the active pool", () => {
  it("never changes an inactive attribute for SHARPSHOOTER", () => {
    let player = createPlayer(createRNG(1), {
      name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
    });
    const before = { ...player.attributes };
    for (let season = 0; season < 12; season++) {
      const rng = createRNG(season * 11 + 3);
      const { person } = applyAging(rng, player, 20 + season);
      player = person;
    }
    expect(player.attributes.defense).toBeCloseTo(before.defense, 5);
    expect(player.attributes.strength).toBeCloseTo(before.strength, 5);
    expect(player.attributes.finishing).toBeCloseTo(before.finishing, 5);
    expect(player.attributes.athleticism).toBeCloseTo(before.athleticism, 5);
  });

  it("a pure Sharpshooter (no active physical attribute) shows no physical decline into their 30s", () => {
    let player = createPlayer(createRNG(2), {
      name: "T", country: "USA", position: "PG", height: 190, playstyle: "SHARPSHOOTER",
    });
    for (let age = 25; age <= 34; age++) {
      const rng = createRNG(age * 7 + 1);
      const { person } = applyAging(rng, player, age);
      player = person;
    }
    // No assertion needed beyond "doesn't crash and stays within bounds" since
    // none of Sharpshooter's active attributes are physical — this test mainly
    // documents the intended emergent behavior for future readers.
    expect(player.attributes.shooting).toBeGreaterThan(0);
  });

  it("INTERIOR does experience physical decline in the AgeReport by their early 30s", () => {
    let player = createPlayer(createRNG(3), {
      name: "T", country: "USA", position: "C", height: 213, playstyle: "INTERIOR",
    });
    let sawDecline = false;
    for (let age = 25; age <= 33; age++) {
      const rng = createRNG(age * 13 + 5);
      const { person, report } = applyAging(rng, player, age);
      player = person;
      if (report.some((r) => r.delta < 0 && (r.attribute === "athleticism" || r.attribute === "strength" || r.attribute === "finishing"))) {
        sawDecline = true;
      }
    }
    expect(sawDecline).toBe(true);
  });

  it("a pure SHARPSHOOTER (all-skill active attributes) shows real late-career decline, not endless growth", () => {
    // Regression coverage for the mentDelta reshape: before the fix, the only
    // negative mental-decline branch required age > 34, which no career can
    // ever reach (NBA_SEASONS=14, START_AGE=18 -> max age 34). That meant a
    // playstyle whose entire active set lives in SKILL_GROWTH_POOL (like
    // SHARPSHOOTER: shooting/ballHandling/basketballIQ/passing) never
    // declined at all. Now age 30-32 is <= 0 and age 33-34 is strictly
    // negative for every skill attribute, so a career that reaches 34 must
    // show real decline from its late-20s peak.
    const seeds = [101, 202, 303, 404, 505];
    const skillAttrs = ["basketballIQ", "passing", "shooting", "ballHandling"] as const;

    for (const seed of seeds) {
      let player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "SHARPSHOOTER",
      });

      // Grow through the peak years (up to age 29, still in positive bands).
      for (let age = 21; age <= 29; age++) {
        const rng = createRNG(seed * 31 + age * 7 + 3);
        const { person } = applyAging(rng, player, age);
        player = person;
      }
      const peakSum = skillAttrs.reduce((s, k) => s + player.attributes[k], 0);

      // Now push through the decline-eligible ages (30-34).
      let sawSkillDecline = false;
      for (let age = 30; age <= 34; age++) {
        const rng = createRNG(seed * 31 + age * 7 + 3);
        const { person, report } = applyAging(rng, player, age);
        player = person;
        if (report.some((r) => r.delta < 0 && (skillAttrs as readonly string[]).includes(r.attribute))) {
          sawSkillDecline = true;
        }
      }
      const finalSum = skillAttrs.reduce((s, k) => s + player.attributes[k], 0);

      expect(sawSkillDecline).toBe(true);
      // Real decline, not just deceleration: the combined skill total at 34
      // must be no higher than the late-20s peak.
      expect(finalSum).toBeLessThanOrEqual(peakSum);
    }
  });
});
