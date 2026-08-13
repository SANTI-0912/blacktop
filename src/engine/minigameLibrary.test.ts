import { describe, it, expect } from "vitest";
import {
  modsFor, MINIGAME_NAME, MINIGAME_ATTRIBUTE, MEMORY_MATCH_BONUS_LIFE_THRESHOLD,
  MinigameKind, pickMinigame, DEVELOPMENT_MINIGAMES,
} from "./minigameLibrary";
import { Attributes } from "./types";
import { createRNG } from "./rng";

const BASELINE: Attributes = {
  shooting: 60, finishing: 60, passing: 60, ballHandling: 60, defense: 60,
  athleticism: 60, strength: 60, basketballIQ: 60, clutch: 60,
};

describe("MEMORY_MATCH registration", () => {
  it("has a name and a governing attribute like every other minigame kind", () => {
    expect(MINIGAME_NAME.MEMORY_MATCH).toBe("Memory Match");
    expect(MINIGAME_ATTRIBUTE.MEMORY_MATCH).toBe("basketballIQ");
  });

  it("is never picked by pickMinigame — no tournament run can be eliminated by it", () => {
    const importances: Array<Parameters<typeof pickMinigame>[1]> = [
      "REGULAR", "PLAYOFF", "CONF_FINALS", "FINALS", "GAME_7", "OLYMPIC",
    ];
    for (const importance of importances) {
      for (let seed = 0; seed < 100; seed++) {
        expect(
          pickMinigame(createRNG(seed), importance, []),
          `MEMORY_MATCH was picked for ${importance} at seed ${seed}`
        ).not.toBe("MEMORY_MATCH");
      }
    }
  });

  it("is reachable only through the no-risk development (workout) pool", () => {
    expect(DEVELOPMENT_MINIGAMES).toContain("MEMORY_MATCH");
  });
});

describe("modsFor — MEMORY_MATCH lives bonus", () => {
  it("grants no bonus life at or below the threshold", () => {
    const atThreshold = modsFor("MEMORY_MATCH", { ...BASELINE, basketballIQ: MEMORY_MATCH_BONUS_LIFE_THRESHOLD }, 0.5);
    expect(atThreshold.livesBonus).toBe(0);
    const below = modsFor("MEMORY_MATCH", { ...BASELINE, basketballIQ: 40 }, 0.5);
    expect(below.livesBonus).toBe(0);
  });

  it("grants exactly one bonus life above the threshold", () => {
    const above = modsFor("MEMORY_MATCH", { ...BASELINE, basketballIQ: MEMORY_MATCH_BONUS_LIFE_THRESHOLD + 1 }, 0.5);
    expect(above.livesBonus).toBe(1);
    const elite = modsFor("MEMORY_MATCH", { ...BASELINE, basketballIQ: 99 }, 0.5);
    expect(elite.livesBonus).toBe(1);
  });

  it("never grants a lives bonus to any other mechanic, regardless of attributes", () => {
    const kinds: MinigameKind[] = [
      "SIMON", "REACTION", "HOT_ZONE", "PERFECT_TIMING", "READ_THE_PLAY",
      "CLUTCH_BOARD", "CLUTCH_SHOT", "HALF_COURT",
    ];
    for (const kind of kinds) {
      const mods = modsFor(kind, { ...BASELINE, basketballIQ: 99, shooting: 99, athleticism: 99, passing: 99, clutch: 99 }, 1);
      expect(mods.livesBonus, `${kind} unexpectedly granted a lives bonus`).toBe(0);
    }
  });

  it("keeps windowScale/timeScale within their existing bounded bands for MEMORY_MATCH, same as every other kind", () => {
    const mods = modsFor("MEMORY_MATCH", { ...BASELINE, basketballIQ: 99 }, 1);
    expect(mods.windowScale).toBeLessThanOrEqual(1.3);
    expect(mods.timeScale).toBeLessThanOrEqual(1.28);
  });
});
