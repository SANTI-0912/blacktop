import { describe, it, expect } from "vitest";
import { computeOverall } from "./overall";
import { Attributes } from "./types";

const BASELINE: Attributes = {
  shooting: 60, finishing: 60, passing: 60, ballHandling: 60, defense: 60,
  athleticism: 60, strength: 60, basketballIQ: 60, clutch: 60,
};

describe("computeOverall", () => {
  it("raising SHARPSHOOTER's inactive Defense to 99 does not change OVR", () => {
    const before = computeOverall(BASELINE, "SHARPSHOOTER");
    const after = computeOverall({ ...BASELINE, defense: 99 }, "SHARPSHOOTER");
    expect(after).toBe(before);
  });

  it("raising SHARPSHOOTER's active Shooting to 99 does change OVR", () => {
    const before = computeOverall(BASELINE, "SHARPSHOOTER");
    const after = computeOverall({ ...BASELINE, shooting: 99 }, "SHARPSHOOTER");
    expect(after).toBeGreaterThan(before);
  });

  it("the same attribute set moved differently is active for one playstyle and inactive for another", () => {
    const withDefense = { ...BASELINE, defense: 99 };
    const sharpshooterOvr = computeOverall(withDefense, "SHARPSHOOTER");
    const twoWayOvr = computeOverall(withDefense, "TWO_WAY");
    const sharpshooterBaseline = computeOverall(BASELINE, "SHARPSHOOTER");
    const twoWayBaseline = computeOverall(BASELINE, "TWO_WAY");
    expect(sharpshooterOvr).toBe(sharpshooterBaseline); // Defense inactive for Sharpshooter
    expect(twoWayOvr).toBeGreaterThan(twoWayBaseline); // Defense active for Two-Way
  });
});
