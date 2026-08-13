import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { rollDevelopment, TIER_BUDGET, getDevelopmentOptions, applyWorkout, totalSeasonDelta, classifyDevRarity, pickAttrFlavor, ATTR_FLAVOR, capAutomaticGrowth, AUTOMATIC_ATTR_CAP } from "./development";
import { createPlayer } from "./player";
import { PLAYSTYLE_PROFILES } from "./playstyle";
import { Playstyle } from "./types";

function primeAveragePlayer(seed: number) {
  const rng = createRNG(seed);
  const player = createPlayer(rng, {
    name: "Test", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
  });
  return { ...player, hidden: { ...player.hidden, confidence: 55 } };
}

describe("development tier budgets", () => {
  it("matches the approved ranges", () => {
    expect(TIER_BUDGET.REGRESSION).toEqual([-4, -1]);
    expect(TIER_BUDGET.POOR).toEqual([0, 1]);
    expect(TIER_BUDGET.NORMAL).toEqual([1, 3]);
    expect(TIER_BUDGET.GOOD).toEqual([3, 5]);
    expect(TIER_BUDGET.BREAKOUT).toEqual([5, 6]);
    expect(TIER_BUDGET.RARE_BREAKOUT).toEqual([6, 8]);
    expect(TIER_BUDGET.LEGENDARY).toEqual([8, 11]);
  });

  it("NORMAL is the modal tier for a prime-age, average-performance player", () => {
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < 2000; seed++) {
      const player = primeAveragePlayer(seed);
      const rng = createRNG(seed * 999 + 1);
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 26, performance: 0.72 });
      counts[result.tier] = (counts[result.tier] ?? 0) + 1;
    }
    const total = 2000;
    expect(counts.NORMAL / total).toBeGreaterThan(0.5);
    expect((counts.RARE_BREAKOUT ?? 0) / total).toBeLessThan(0.04);
    expect((counts.LEGENDARY ?? 0) / total).toBeLessThan(0.01);
  });
});

const ALL_PLAYSTYLES: Playstyle[] = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"];

describe("rollDevelopment respects the active pool", () => {
  it("never changes an inactive attribute, across all playstyles", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      const active = new Set(PLAYSTYLE_PROFILES[playstyle].active);
      for (let seed = 0; seed < 300; seed++) {
        const rng = createRNG(seed * 13 + 1);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const result = rollDevelopment({ rng, person: player, focus: PLAYSTYLE_PROFILES[playstyle].active[0], age: 24, performance: 0.7 });
        for (const c of result.changes) {
          expect(active.has(c.attribute)).toBe(true);
        }
      }
    }
  });

  it("the chosen focus attribute gets the full tier budget, not a fraction of it", () => {
    let matches = 0;
    const trials = 500;
    for (let seed = 0; seed < trials; seed++) {
      const rng = createRNG(seed * 31 + 5);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 26, performance: 0.72 });
      if (result.tier === "REGRESSION") continue;
      const [lo, hi] = TIER_BUDGET[result.tier];
      const primary = result.changes.find((c) => c.attribute === "shooting");
      if (primary && primary.delta >= Math.max(1, lo - 1) && primary.delta <= hi + 1) matches++;
    }
    expect(matches / trials).toBeGreaterThan(0.8);
  });
});

describe("getDevelopmentOptions", () => {
  it("always returns exactly 3 distinct options", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      for (let seed = 0; seed < 50; seed++) {
        const rng = createRNG(seed);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const options = getDevelopmentOptions(rng, player, [], 24, 0.7);
        expect(options.length).toBe(3);
        expect(new Set(options.map((o) => o.attribute)).size).toBe(3);
      }
    }
  });

  it("every option's attribute is in that playstyle's active pool", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      const active = new Set(PLAYSTYLE_PROFILES[playstyle].active);
      for (let seed = 0; seed < 50; seed++) {
        const rng = createRNG(seed * 3 + 1);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const options = getDevelopmentOptions(rng, player, [], 24, 0.7);
        for (const o of options) expect(active.has(o.attribute)).toBe(true);
      }
    }
  });

  it("high-weight attributes are drawn more often than low-weight ones over many seasons", () => {
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      const rng = createRNG(seed * 17 + 2);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const options = getDevelopmentOptions(rng, player, [], 24, 0.7);
      for (const o of options) counts[o.attribute] = (counts[o.attribute] ?? 0) + 1;
    }
    // shooting (weight 5) should appear more often than passing (weight 3)
    expect(counts.shooting).toBeGreaterThan(counts.passing);
  });

  it("a recently-picked attribute is deweighted, not banned", () => {
    let withCooldownCount = 0;
    let withoutCooldownCount = 0;
    const trials = 800;
    for (let seed = 0; seed < trials; seed++) {
      const rngA = createRNG(seed * 5 + 1);
      const rngB = createRNG(seed * 5 + 1);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const withCooldown = getDevelopmentOptions(rngA, player, ["shooting"], 24, 0.7);
      const withoutCooldown = getDevelopmentOptions(rngB, player, [], 24, 0.7);
      if (withCooldown.some((o) => o.attribute === "shooting")) withCooldownCount++;
      if (withoutCooldown.some((o) => o.attribute === "shooting")) withoutCooldownCount++;
    }
    expect(withCooldownCount).toBeLessThan(withoutCooldownCount);
    expect(withCooldownCount).toBeGreaterThan(0); // deweighted, never fully banned
  });
});

describe("getDevelopmentOptions returns locked, concrete rewards", () => {
  it("every option has from/to/delta consistent with the player's current attribute", () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRNG(seed);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const options = getDevelopmentOptions(rng, player, [], 24, 0.7);
      for (const o of options) {
        expect(o.from).toBe(Math.round(player.attributes[o.attribute]));
        expect(o.to - o.from).toBe(o.delta);
        expect(o.delta).toBeGreaterThan(0);
        expect(o.to).toBeLessThanOrEqual(99);
      }
    }
  });

  it("never produces a REGRESSION-tier option (cards are always an upgrade)", () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRNG(seed * 13);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "C", height: 210, playstyle: "INTERIOR",
      });
      const options = getDevelopmentOptions(rng, player, [], 33, 0.5); // old age, poor form — worst case for REGRESSION odds
      for (const o of options) expect(o.tier).not.toBe("REGRESSION");
    }
  });

  it("the majority of NORMAL-tier option deltas land in [1, 3]", () => {
    let normalCount = 0, inBand = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const rng = createRNG(seed * 7);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "PLAYMAKER",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.72);
      for (const o of options) {
        if (o.tier !== "NORMAL") continue;
        normalCount++;
        if (o.delta >= 1 && o.delta <= 3) inBand++;
      }
    }
    expect(normalCount).toBeGreaterThan(0);
    expect(inBand / normalCount).toBeGreaterThan(0.85);
  });
});

describe("rollDevelopment with a locked primary", () => {
  it("applies exactly the locked attribute/delta, never re-rolling it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRNG(seed);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      const locked = { attribute: "shooting" as const, delta: 3, tier: "NORMAL" as const };
      const result = rollDevelopment({ rng, person: player, focus: "shooting", age: 24, performance: 0.7, locked });
      const primary = result.changes.find((c) => c.attribute === "shooting");
      expect(primary?.delta).toBe(3);
      expect(result.tier).toBe("NORMAL");
    }
  });
});

describe("diminishing returns near the attribute ceiling", () => {
  it("across many seeds, a high-current attribute develops on average less than a low-current one under identical unlocked rolls", () => {
    const base = primeAveragePlayer(1);
    const lowPlayer = { ...base, attributes: { ...base.attributes, shooting: 55 } };
    const highPlayer = { ...base, attributes: { ...base.attributes, shooting: 92 } };
    let lowTotal = 0, highTotal = 0, trials = 0;
    for (let seed = 0; seed < 500; seed++) {
      const lowResult = rollDevelopment({ rng: createRNG(seed), person: lowPlayer, focus: "shooting", age: 26, performance: 0.72 });
      const highResult = rollDevelopment({ rng: createRNG(seed), person: highPlayer, focus: "shooting", age: 26, performance: 0.72 });
      if (lowResult.tier === "REGRESSION" || highResult.tier === "REGRESSION") continue;
      const lowDelta = lowResult.changes.find((c) => c.attribute === "shooting")?.delta ?? 0;
      const highDelta = highResult.changes.find((c) => c.attribute === "shooting")?.delta ?? 0;
      lowTotal += lowDelta;
      highTotal += highDelta;
      trials++;
    }
    expect(trials).toBeGreaterThan(0);
    expect(highTotal).toBeLessThan(lowTotal); // same seeds => same rolled tier/raw delta; only the scale differs
    expect(highTotal).toBeGreaterThan(0); // never fully blocked
  });

  it("getDevelopmentOptions's previewed delta already reflects diminishing returns, and matches what rollDevelopment applies for the same locked reward", () => {
    const base = primeAveragePlayer(2);
    const highPlayer = { ...base, attributes: { ...base.attributes, shooting: 92 } };
    const lowPlayer = { ...base, attributes: { ...base.attributes, shooting: 55 } };
    let highTotal = 0, lowTotal = 0, trials = 0;
    for (let seed = 0; seed < 300; seed++) {
      const highOptions = getDevelopmentOptions(createRNG(seed), highPlayer, [], 26, 0.72);
      const lowOptions = getDevelopmentOptions(createRNG(seed), lowPlayer, [], 26, 0.72);
      const highOption = highOptions.find((o) => o.attribute === "shooting");
      const lowOption = lowOptions.find((o) => o.attribute === "shooting");
      if (!highOption || !lowOption) continue;
      highTotal += highOption.delta;
      lowTotal += lowOption.delta;
      trials++;
    }
    expect(trials).toBeGreaterThan(0);
    expect(highTotal).toBeLessThan(lowTotal); // same seeds => same raw rolls; only the scale differs — proves the preview is actually scaled, not just self-consistent

    const options = getDevelopmentOptions(createRNG(5), highPlayer, [], 26, 0.72);
    const shootingOption = options.find((o) => o.attribute === "shooting");
    if (!shootingOption) return; // shooting wasn't one of the 3 drawn cards at this specific seed — not this assertion's concern
    const locked = { attribute: shootingOption.attribute, delta: shootingOption.delta, tier: shootingOption.tier };
    const applied = rollDevelopment({ rng: createRNG(5), person: highPlayer, focus: shootingOption.attribute, age: 26, performance: 0.72, locked });
    const appliedDelta = applied.changes.find((c) => c.attribute === shootingOption.attribute)!.delta;
    expect(appliedDelta).toBe(shootingOption.delta);
  });
});

describe("applyWorkout redirects the bonus off the primary attribute", () => {
  it("lands the bonus on a different active attribute than focus, when one is available", () => {
    const player = primeAveragePlayer(3);
    const base = rollDevelopment({
      rng: createRNG(3), person: player, focus: "shooting", age: 26, performance: 0.72,
      locked: { attribute: "shooting", delta: 3, tier: "NORMAL" },
    });
    const { result, bonus } = applyWorkout(createRNG(9), base, "WON", "shooting", player);
    expect(bonus).toBeGreaterThan(0);
    const shootingChange = result.changes.find((c) => c.attribute === "shooting");
    // The primary's own delta (3, from the lock) must be unchanged — the
    // bonus went to a different attribute, not stacked here.
    expect(shootingChange?.delta).toBe(3);
    const otherChanges = result.changes.filter((c) => c.attribute !== "shooting");
    expect(otherChanges.some((c) => c.delta === bonus)).toBe(true);
  });

  it("a lost or skipped workout changes nothing", () => {
    const player = primeAveragePlayer(4);
    const base = rollDevelopment({
      rng: createRNG(4), person: player, focus: "shooting", age: 26, performance: 0.72,
      locked: { attribute: "shooting", delta: 3, tier: "NORMAL" },
    });
    const lost = applyWorkout(createRNG(9), base, "LOST", "shooting", player);
    expect(lost.bonus).toBe(0);
    expect(lost.result).toEqual(base);
    const skipped = applyWorkout(createRNG(9), base, "SKIPPED", "shooting", player);
    expect(skipped.bonus).toBe(0);
  });
});

describe("totalSeasonDelta", () => {
  it("merges development, aging, and minigame sources for the same attribute into one rounded total", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "shooting", delta: 1.6 }],
      [{ attribute: "shooting", delta: 2 }]
    );
    expect(result).toEqual([{ attribute: "shooting", delta: 7 }]); // 3 + 1.6 + 2 = 6.6 -> rounds to 7
  });

  it("keeps non-overlapping attributes separate", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "athleticism", delta: 1.2 }],
      [{ attribute: "ballHandling", delta: 2 }]
    );
    const byAttr = new Map(result.map((c) => [c.attribute, c.delta]));
    expect(byAttr.get("shooting")).toBe(3);
    expect(byAttr.get("athleticism")).toBe(1);
    expect(byAttr.get("ballHandling")).toBe(2);
  });

  it("drops an attribute whose combined total nets to zero", () => {
    const result = totalSeasonDelta(
      [{ attribute: "shooting", delta: 3 }],
      [{ attribute: "shooting", delta: -3 }],
      []
    );
    expect(result).toEqual([]);
  });

  it("handles all-empty inputs", () => {
    expect(totalSeasonDelta([], [], [])).toEqual([]);
  });
});

describe("classifyDevRarity", () => {
  it("classifies 1-4 as NORMAL", () => {
    expect(classifyDevRarity(1)).toBe("NORMAL");
    expect(classifyDevRarity(2)).toBe("NORMAL");
    expect(classifyDevRarity(3)).toBe("NORMAL");
    expect(classifyDevRarity(4)).toBe("NORMAL");
  });

  it("classifies 8-9 as RARE", () => {
    expect(classifyDevRarity(8)).toBe("RARE");
    expect(classifyDevRarity(9)).toBe("RARE");
  });

  it("classifies 5, 6, 7, and 10+ as unclassified (null) — no LEGENDARY tier exists", () => {
    expect(classifyDevRarity(5)).toBeNull();
    expect(classifyDevRarity(6)).toBeNull();
    expect(classifyDevRarity(7)).toBeNull();
    expect(classifyDevRarity(10)).toBeNull();
    expect(classifyDevRarity(11)).toBeNull();
    expect(classifyDevRarity(20)).toBeNull();
  });

  it("classifies 0 and negative deltas as unclassified", () => {
    expect(classifyDevRarity(0)).toBeNull();
    expect(classifyDevRarity(-2)).toBeNull();
  });
});

describe("pickAttrFlavor", () => {
  it("always returns one of the attribute's own pool entries", () => {
    for (let season = 0; season < 20; season++) {
      const line = pickAttrFlavor("shooting", season);
      expect(ATTR_FLAVOR.shooting).toContain(line);
    }
  });

  it("is deterministic — the same season always returns the same line", () => {
    expect(pickAttrFlavor("ballHandling", 7)).toBe(pickAttrFlavor("ballHandling", 7));
  });

  it("varies across at least some seasons", () => {
    const lines = new Set(Array.from({ length: 9 }, (_, i) => pickAttrFlavor("passing", i)));
    expect(lines.size).toBeGreaterThan(1);
  });

  it("every attribute has a non-empty pool", () => {
    for (const key of Object.keys(ATTR_FLAVOR) as (keyof typeof ATTR_FLAVOR)[]) {
      expect(ATTR_FLAVOR[key].length).toBeGreaterThan(0);
    }
  });
});

describe("getDevelopmentOptions only ever offers NORMAL (1-4) or RARE (8-9) magnitudes", () => {
  it("never generates a +5, +6, or +7 option across many seeds and playstyles", () => {
    for (const playstyle of ALL_PLAYSTYLES) {
      for (let seed = 0; seed < 400; seed++) {
        const rng = createRNG(seed * 31 + 7);
        const player = createPlayer(createRNG(seed), {
          name: "T", country: "USA", position: "SG", height: 198, playstyle,
        });
        const options = getDevelopmentOptions(rng, player, [], 24, 0.72);
        for (const o of options) {
          expect([5, 6, 7]).not.toContain(o.delta);
        }
      }
    }
  });

  it("never generates a delta of 10 or higher", () => {
    for (let seed = 0; seed < 400; seed++) {
      const rng = createRNG(seed * 13 + 3);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "PG", height: 190, playstyle: "SUPERSTAR",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.8);
      for (const o of options) {
        expect(o.delta).toBeLessThan(10);
      }
    }
  });

  it("every generated delta falls in {1,2,3,4,8,9} (allowing the ceiling clamp to shrink it further near 99)", () => {
    const ALLOWED = new Set([1, 2, 3, 4, 8, 9]);
    let sawBelowCeilingSample = false;
    for (let seed = 0; seed < 500; seed++) {
      const rng = createRNG(seed * 41 + 11);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SLASHER",
      });
      const options = getDevelopmentOptions(rng, player, [], 25, 0.75);
      for (const o of options) {
        if (o.to < 99 - 9) {
          // Far enough from the ceiling that even a max +9 snap can't be clamped
          // down — the snap itself must hold.
          sawBelowCeilingSample = true;
          expect(ALLOWED.has(o.delta)).toBe(true);
        }
      }
    }
    expect(sawBelowCeilingSample).toBe(true);
  });

  it("can still generate +8 or +9 (RARE) options — the band is reachable, not accidentally dead", () => {
    let saw8 = false, saw9 = false;
    for (let seed = 0; seed < 3000; seed++) {
      const rng = createRNG(seed * 97 + 5);
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SF", height: 201, playstyle: "SUPERSTAR",
      });
      const options = getDevelopmentOptions(rng, player, [], 26, 0.88);
      for (const o of options) {
        if (o.delta === 8) saw8 = true;
        if (o.delta === 9) saw9 = true;
      }
      if (saw8 && saw9) break;
    }
    expect(saw8).toBe(true);
    expect(saw9).toBe(true);
  });
});

describe("capAutomaticGrowth", () => {
  it("leaves everything unchanged when no attribute exceeds the cap", () => {
    const player = primeAveragePlayer(1);
    const result = capAutomaticGrowth(
      player, "shooting",
      [{ attribute: "shooting", delta: 3 }], // primary — never touched regardless of cap
      [{ attribute: "passing", delta: 1.5 }],
      [{ attribute: "ballHandling", delta: 2 }]
    );
    expect(result.devChanges).toEqual([{ attribute: "shooting", delta: 3 }]);
    expect(result.ageReport).toEqual([{ attribute: "passing", delta: 1.5 }]);
    expect(result.minigameDev).toEqual([{ attribute: "ballHandling", delta: 2 }]);
  });

  it("trims an over-cap automatic total on a single attribute down to AUTOMATIC_ATTR_CAP, reducing the actual attribute value by the same amount", () => {
    const player = primeAveragePlayer(2);
    const before = player.attributes.passing;
    // capAutomaticGrowth's documented contract (see career.ts's finishSeason,
    // where it's called on out.state.player AFTER applyDevelopment/
    // applyMinigameDev/applyAging have all already run) is that `player`
    // already has the raw, uncapped automatic deltas applied — this function
    // only claws back the excess, it doesn't apply growth itself. So the
    // fixture pre-applies the raw total here (2.4 + 3 = 5.4 -> rounds to 5)
    // the same way production would, before capAutomaticGrowth ever sees it.
    const inflated = { ...player, attributes: { ...player.attributes, passing: before + 5 } };
    const result = capAutomaticGrowth(
      inflated, null, // no primary pick this call
      [],
      [{ attribute: "passing", delta: 2.4 }],
      [{ attribute: "passing", delta: 3 }] // raw automatic total for passing: 5.4 -> rounds to 5, over cap by 2
    );
    const totalAfterTrim = result.ageReport[0].delta + result.minigameDev[0].delta;
    expect(Math.round(totalAfterTrim)).toBe(AUTOMATIC_ATTR_CAP);
    expect(result.player.attributes.passing).toBe(before + AUTOMATIC_ATTR_CAP);
  });

  it("never trims the player's own primary/locked devChanges entry, but zeroes out any other automatic growth landing on that same attribute", () => {
    const player = primeAveragePlayer(3);
    const before = player.attributes.shooting;
    // player.attributes already reflects the raw total applied upstream:
    // 8 (locked pick) + 2 (aging on the same attribute) = 10.
    const inflated = { ...player, attributes: { ...player.attributes, shooting: before + 10 } };
    const result = capAutomaticGrowth(
      inflated, "shooting",
      [{ attribute: "shooting", delta: 8 }], // the player's own locked RARE pick — must survive untouched
      [{ attribute: "shooting", delta: 2 }], // aging ALSO touched the same attribute this season — must be zeroed
      []
    );
    const shootingDevEntry = result.devChanges.find((c) => c.attribute === "shooting")!;
    expect(shootingDevEntry.delta).toBe(8); // untouched — the locked pick itself is never trimmed
    const shootingAging = result.ageReport.find((a) => a.attribute === "shooting")!;
    expect(shootingAging.delta).toBe(0); // incidental automatic growth on the picked attribute is fully trimmed
    expect(result.player.attributes.shooting).toBe(before + 8); // real growth matches exactly what was picked
  });

  it("trims aging before dev secondary nudges before minigame development, in that order", () => {
    const player = primeAveragePlayer(4);
    const result = capAutomaticGrowth(
      player, null,
      [{ attribute: "defense", delta: 2 }],
      [{ attribute: "defense", delta: 2 }],
      [{ attribute: "defense", delta: 2 }]
      // raw total: 6, over cap by 3 -> aging (2) should be fully consumed first, then 1 more from dev
    );
    const aging = result.ageReport.find((a) => a.attribute === "defense")!;
    const dev = result.devChanges.find((c) => c.attribute === "defense")!;
    const mg = result.minigameDev.find((c) => c.attribute === "defense")!;
    expect(aging.delta).toBe(0);
    expect(dev.delta).toBe(1);
    expect(mg.delta).toBe(2);
    expect(Math.round(aging.delta + dev.delta + mg.delta)).toBe(AUTOMATIC_ATTR_CAP);
  });

  it("never generates a displayed automatic total of +0 — capAutomaticGrowth combined with totalSeasonDelta's existing zero-filter drops fully-trimmed rows", () => {
    const player = primeAveragePlayer(5);
    const result = capAutomaticGrowth(
      player, null,
      [],
      [{ attribute: "strength", delta: 3 }],
      [{ attribute: "strength", delta: 3 }] // total 6, capped to 3 -> aging fully consumed (3), minigame keeps 3
    );
    const merged = totalSeasonDelta([], result.ageReport, result.minigameDev);
    const strengthRow = merged.find((c) => c.attribute === "strength");
    expect(strengthRow).toBeDefined();
    expect(strengthRow!.delta).not.toBe(0);
    expect(strengthRow!.delta).toBe(AUTOMATIC_ATTR_CAP);
  });
});
