import { describe, it, expect } from "vitest";
import { PLAYSTYLE_PROFILES, startingBias, isActive } from "./playstyle";
import { Playstyle } from "./types";

const ALL_PLAYSTYLES: Playstyle[] = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"];

describe("PLAYSTYLE_PROFILES", () => {
  it("defines exactly the 6 approved playstyles", () => {
    expect(Object.keys(PLAYSTYLE_PROFILES).sort()).toEqual([...ALL_PLAYSTYLES].sort());
  });

  it("every profile has at least 4 active attributes (3-of-N draw always possible)", () => {
    for (const p of ALL_PLAYSTYLES) {
      expect(PLAYSTYLE_PROFILES[p].active.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("never includes clutch as an active attribute", () => {
    for (const p of ALL_PLAYSTYLES) {
      expect(PLAYSTYLE_PROFILES[p].active).not.toContain("clutch");
    }
  });

  it("every active attribute has a positive weight", () => {
    for (const p of ALL_PLAYSTYLES) {
      const profile = PLAYSTYLE_PROFILES[p];
      for (const attr of profile.active) {
        expect(profile.weights[attr]).toBeGreaterThan(0);
      }
    }
  });

  it("SUPERSTAR includes Ball Handling as active (explicit user requirement)", () => {
    expect(PLAYSTYLE_PROFILES.SUPERSTAR.active).toContain("ballHandling");
  });

  it("SHARPSHOOTER never includes Defense, Strength, Finishing or Athleticism", () => {
    const active = PLAYSTYLE_PROFILES.SHARPSHOOTER.active;
    expect(active).not.toContain("defense");
    expect(active).not.toContain("strength");
    expect(active).not.toContain("finishing");
    expect(active).not.toContain("athleticism");
  });

  it("isActive() agrees with the profile's active list", () => {
    expect(isActive("SHARPSHOOTER", "shooting")).toBe(true);
    expect(isActive("SHARPSHOOTER", "defense")).toBe(false);
  });
});

describe("startingBias", () => {
  it("only biases active attributes", () => {
    const bias = startingBias(PLAYSTYLE_PROFILES.INTERIOR);
    expect(Object.keys(bias).sort()).toEqual([...PLAYSTYLE_PROFILES.INTERIOR.active].sort());
  });

  it("gives a bigger bias to VERY_HIGH-weight attributes than SUPPORT-weight ones", () => {
    const bias = startingBias(PLAYSTYLE_PROFILES.SHARPSHOOTER);
    expect(bias.shooting!).toBeGreaterThan(bias.passing!);
  });
});
