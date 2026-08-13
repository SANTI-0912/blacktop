import { describe, it, expect } from "vitest";
import { buildSeasonCelebrations } from "./Celebration";
import { SeasonConclusion } from "../../engine/career";
import { CareerEvent } from "../../engine/types";
import { MILESTONE_FLAGS } from "../../engine/history";

function conclusionWithAwards(awards: string[]): SeasonConclusion {
  return {
    headline: "", lines: [],
    stats: { season: 1, phase: "NBA", gamesPlayed: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, fgPct: 0 } as any,
    awards, draftStock: null, decisions: [],
  };
}

describe("buildSeasonCelebrations", () => {
  it("returns an empty queue when nothing grand happened", () => {
    expect(buildSeasonCelebrations(conclusionWithAwards([]), [], 2027)).toEqual([]);
  });

  it("includes MVP when conclusion.awards has it", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["MVP"]), [], 2027);
    expect(queue).toEqual([{ key: "MVP", year: 2027 }]);
  });

  it("includes ALL TOURNAMENT-only seasons as an empty queue — it's a secondary award, not a grand one", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["ALL TOURNAMENT"]), [], 2027);
    expect(queue).toEqual([]);
  });

  it("maps a NBA CHAMPION award to NBA_CHAMPION, not NCAA_CHAMPION", () => {
    const queue = buildSeasonCelebrations(conclusionWithAwards(["CHAMPION"]), [], 2027);
    expect(queue).toEqual([{ key: "NBA_CHAMPION", year: 2027 }]);
  });

  it("detects an NCAA championship via the MILESTONE_FLAGS.CHAMPIONSHIP event flag when there's no CHAMPION award", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 3, type: "signature_moment", narrative: "NATIONAL CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards([]), events, 2029);
    expect(queue).toEqual([{ key: "NCAA_CHAMPION", year: 2029 }]);
  });

  it("never double-counts a championship as both NBA_CHAMPION and NCAA_CHAMPION in the same season", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 5, type: "signature_moment", narrative: "NBA CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards(["CHAMPION"]), events, 2031);
    expect(queue.filter((c) => c.key === "NBA_CHAMPION" || c.key === "NCAA_CHAMPION")).toHaveLength(1);
    expect(queue).toEqual([{ key: "NBA_CHAMPION", year: 2031 }]);
  });

  it("chains multiple grand awards in the smaller-to-biggest order, ending on the highest note", () => {
    const events: CareerEvent[] = [
      { id: "e1", season: 5, type: "signature_moment", narrative: "NBA CHAMPION.", flags: [MILESTONE_FLAGS.CHAMPIONSHIP] },
    ];
    const queue = buildSeasonCelebrations(conclusionWithAwards(["MVP", "ALL STAR", "ALL NBA", "CHAMPION", "FINALS MVP"]), events, 2031);
    expect(queue.map((c) => c.key)).toEqual(["ALL STAR", "ALL NBA", "MVP", "NBA_CHAMPION", "FINALS MVP"]);
  });
});
