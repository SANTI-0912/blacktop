import { describe, it, expect } from "vitest";
import { simulateMany } from "../../scripts/simulate-careers";

describe("playstyles produce statistically different careers", () => {
  it("INTERIOR out-rebounds SHARPSHOOTER by a wide margin", () => {
    const interior = simulateMany(20, "INTERIOR");
    const sharpshooter = simulateMany(20, "SHARPSHOOTER");
    const avgRpg = (rs: typeof interior) => rs.reduce((s, r) => s + r.careerRpg, 0) / rs.length;
    expect(avgRpg(interior)).toBeGreaterThan(avgRpg(sharpshooter) * 1.4);
  });

  it("PLAYMAKER out-assists SLASHER by a wide margin", () => {
    const playmaker = simulateMany(20, "PLAYMAKER");
    const slasher = simulateMany(20, "SLASHER");
    const avgApg = (rs: typeof playmaker) => rs.reduce((s, r) => s + r.careerApg, 0) / rs.length;
    expect(avgApg(playmaker)).toBeGreaterThan(avgApg(slasher) * 1.3);
  });

  it("SHARPSHOOTER's inactive attributes stay near baseline while active ones climb", () => {
    const results = simulateMany(20, "SHARPSHOOTER");
    const avgShooting = results.reduce((s, r) => s + r.finalAttrs.shooting, 0) / results.length;
    const avgDefense = results.reduce((s, r) => s + r.finalAttrs.defense, 0) / results.length;
    expect(avgShooting).toBeGreaterThan(avgDefense + 20);
  });

  it("no playstyle's average final OVR is wildly out of line with the others", () => {
    const PLAYSTYLES = ["SHARPSHOOTER", "PLAYMAKER", "SUPERSTAR", "SLASHER", "TWO_WAY", "INTERIOR"] as const;
    const avgOvrs = PLAYSTYLES.map((p) => {
      const rs = simulateMany(15, p);
      return rs.reduce((s, r) => s + r.finalOvr, 0) / rs.length;
    });
    const max = Math.max(...avgOvrs);
    const min = Math.min(...avgOvrs);
    expect(max - min).toBeLessThan(15);
  });
});
