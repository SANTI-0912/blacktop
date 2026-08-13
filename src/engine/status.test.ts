import { describe, it, expect } from "vitest";
import { playerStatus } from "./status";
import { Award } from "./types";

describe("playerStatus", () => {
  it("returns LEGEND for an MVP who has also won a title", () => {
    const awards: Award[] = [{ type: "MVP", season: 3 }, { type: "CHAMPION", season: 3 }];
    expect(playerStatus(80, awards, 3)).toBe("LEGEND");
  });

  it("returns LEGEND for an MVP with 2+ All-Star nods, even without a title", () => {
    const awards: Award[] = [
      { type: "MVP", season: 4 },
      { type: "ALL_STAR", season: 2 },
      { type: "ALL_STAR", season: 3 },
    ];
    expect(playerStatus(75, awards, 4)).toBe("LEGEND");
  });

  it("returns MVP_LEVEL for a single MVP with no title and fewer than 2 All-Star nods, regardless of a temporarily low reputation", () => {
    const awards: Award[] = [{ type: "MVP", season: 2 }];
    expect(playerStatus(5, awards, 2)).toBe("MVP_LEVEL");
  });

  it("returns ALL_STAR for a player with an All-Star nod or a title but no MVP", () => {
    expect(playerStatus(30, [{ type: "ALL_STAR", season: 1 }], 1)).toBe("ALL_STAR");
    expect(playerStatus(10, [{ type: "CHAMPION", season: 1 }], 1)).toBe("ALL_STAR");
  });

  it("returns ROOKIE for a brand-new player with no awards and low reputation, never ALL_STAR", () => {
    expect(playerStatus(5, [], 0)).toBe("ROOKIE");
  });

  it("returns ROTATION for a hyped rookie (high reputation, no awards yet, zero NBA seasons)", () => {
    expect(playerStatus(50, [], 0)).toBe("ROTATION");
  });

  it("falls back to reputation thresholds for an awardless veteran", () => {
    expect(playerStatus(50, [], 3)).toBe("STARTER");
    expect(playerStatus(25, [], 3)).toBe("ROTATION");
    expect(playerStatus(5, [], 3)).toBe("UNKNOWN");
  });
});
