import { describe, it, expect } from "vitest";
import { fanLoveLine } from "./FanLove";

describe("fanLoveLine status floor", () => {
  it("never reads as a total unknown for an ALL_STAR, even at a very low numeric value", () => {
    const line = fanLoveLine(3, "Test City", "ALL_STAR");
    expect(line).not.toContain("barely know your name");
  });

  it("reads as a total unknown for a low-status player at the same low value", () => {
    const line = fanLoveLine(3, "Test City", "UNKNOWN");
    expect(line).toContain("barely know your name");
  });

  it("floors MVP_LEVEL and LEGEND one tier higher than ALL_STAR's floor", () => {
    const allStarLine = fanLoveLine(3, "Test City", "ALL_STAR");
    const mvpLine = fanLoveLine(3, "Test City", "MVP_LEVEL");
    expect(mvpLine).not.toBe(allStarLine);
  });

  it("never downgrades an already-good number regardless of status", () => {
    const line = fanLoveLine(95, "Test City", "UNKNOWN");
    expect(line).toContain("faces of the league");
  });

  it("a ROOKIE/ROTATION/STARTER status applies no floor — the number alone decides the band", () => {
    const line = fanLoveLine(3, "Test City", "ROOKIE");
    expect(line).toContain("barely know your name");
  });
});
