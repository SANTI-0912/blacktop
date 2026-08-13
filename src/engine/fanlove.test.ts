import { describe, it, expect } from "vitest";
import {
  playoffTier, playoffOutcomeFanLoveBump, seasonsOnCurrentTeam, initialFanLoveForTeamChange, applyFanLoveGain,
  fanLoveTier, FAN_LOVE_BAND_THRESHOLDS, applyMarketFanLoveMultiplier,
} from "./fanlove";

describe("seasonsOnCurrentTeam", () => {
  it("counts trailing consecutive seasons on the current team, plus this one", () => {
    expect(seasonsOnCurrentTeam(["a", "a", "b", "b", "b"], "b")).toBe(4); // 3 trailing + this season
    expect(seasonsOnCurrentTeam([], "b")).toBe(1); // rookie season, no history yet
    expect(seasonsOnCurrentTeam(["a", "b", "a"], "a")).toBe(2); // most recent run only
  });

  it("does not let an Olympics timeline entry (undefined teamId) break the streak", () => {
    expect(seasonsOnCurrentTeam(["b", "b", undefined], "b")).toBe(3);
  });
});

describe("playoffTier", () => {
  it("maps every PlayoffResult to the expected tier", () => {
    expect(playoffTier("CHAMPION")).toBe(5);
    expect(playoffTier("FINALS_LOSS")).toBe(4);
    expect(playoffTier("CONF_FINALS")).toBe(3);
    expect(playoffTier("CONF_SEMIS")).toBe(2);
    expect(playoffTier("FIRST_ROUND")).toBe(1);
    expect(playoffTier("MISSED_PLAYOFFS")).toBe(0);
    expect(playoffTier("PENDING")).toBe(0);
  });
});

describe("playoffOutcomeFanLoveBump", () => {
  it("gives a big bump for a first-ever championship", () => {
    expect(playoffOutcomeFanLoveBump("CHAMPION", ["CONF_FINALS", "FIRST_ROUND"])).toBe(18);
  });

  it("gives a smaller bump for a repeat championship", () => {
    expect(playoffOutcomeFanLoveBump("CHAMPION", ["CHAMPION", "CONF_FINALS"])).toBe(10);
  });

  it("gives a moderate first-time bump for reaching the Conference Finals", () => {
    expect(playoffOutcomeFanLoveBump("CONF_FINALS", ["FIRST_ROUND", "MISSED_PLAYOFFS"])).toBe(5);
  });

  it("does NOT punish a season that falls short of a career-best already reached — this is the exact bug this plan fixes", () => {
    // Won a title last season, then only reaches the second round this season.
    const bump = playoffOutcomeFanLoveBump("CONF_SEMIS", ["CHAMPION"]);
    expect(bump).toBe(1);
    expect(bump).toBeGreaterThan(-5); // nowhere near the old -8, and never negative here
  });

  it("caps the only negative case (missing the playoffs) at a small, fixed penalty regardless of history", () => {
    expect(playoffOutcomeFanLoveBump("MISSED_PLAYOFFS", ["CHAMPION", "FINALS_LOSS"])).toBe(-4);
    expect(playoffOutcomeFanLoveBump("MISSED_PLAYOFFS", [])).toBe(-4);
  });

  it("gives a neutral (zero) result for a first-round exit — a fine, unremarkable season", () => {
    expect(playoffOutcomeFanLoveBump("FIRST_ROUND", [])).toBe(0);
  });
});

describe("applyMarketFanLoveMultiplier", () => {
  it("boosts a positive bump in a small market (e.g. the Kings)", () => {
    expect(applyMarketFanLoveMultiplier(5, "SMALL")).toBe(7); // 5 * 1.3 = 6.5 -> 7
  });

  it("leaves a positive bump unchanged in a mid market", () => {
    expect(applyMarketFanLoveMultiplier(5, "MID")).toBe(5);
  });

  it("shrinks a positive bump in a historic big market (e.g. the Celtics)", () => {
    expect(applyMarketFanLoveMultiplier(5, "LARGE")).toBe(4); // 5 * 0.75 = 3.75 -> 4
  });

  it("never touches a zero or negative bump, in any market", () => {
    expect(applyMarketFanLoveMultiplier(0, "SMALL")).toBe(0);
    expect(applyMarketFanLoveMultiplier(-4, "SMALL")).toBe(-4);
    expect(applyMarketFanLoveMultiplier(-4, "LARGE")).toBe(-4);
  });
});

describe("applyFanLoveGain", () => {
  it("applies a positive gain at full value when Fan Love is low", () => {
    expect(applyFanLoveGain(10, 10)).toBe(20);
  });

  it("scales a positive gain down as Fan Love climbs, via diminishing returns", () => {
    const lowGain = applyFanLoveGain(10, 20) - 10;
    const highGain = applyFanLoveGain(92, 20) - 92;
    expect(highGain).toBeLessThan(lowGain);
    expect(highGain).toBeGreaterThan(0); // never fully blocked, just much smaller
  });

  it("never softens a penalty (non-positive rawGain applies at full value regardless of current)", () => {
    expect(applyFanLoveGain(95, -4)).toBe(91);
    expect(applyFanLoveGain(20, -4)).toBe(16);
  });

  it("stays within the 0-100 range", () => {
    expect(applyFanLoveGain(98, 30)).toBeLessThanOrEqual(100);
    expect(applyFanLoveGain(2, -10)).toBeGreaterThanOrEqual(0);
  });

  it("reaching 100 requires many large gains even from a high starting point, because of diminishing returns", () => {
    let fanLove = 85;
    let seasons = 0;
    while (fanLove < 100 && seasons < 30) {
      fanLove = applyFanLoveGain(fanLove, 18); // simulate a repeated first-time-championship-caliber season
      seasons++;
    }
    expect(seasons).toBeGreaterThan(3); // not a 1-2 season sprint from 85 to 100
  });
});

describe("Fan Love does not reach 100 unrealistically early in a normal successful career", () => {
  it("a strong but not historically dominant career (a few All-Star nods, one deep run, no championship) stays well under 90 after 5 seasons", () => {
    // Simulates 5 seasons of: repeat conf-finals depth + occasional All-Star-caliber bump,
    // using the same magnitudes finishSeason actually applies.
    let fanLove = 15; // a rookie's starting Fan Love is low
    const priorResults: ("CONF_FINALS")[] = [];
    for (let season = 0; season < 5; season++) {
      const bump = playoffOutcomeFanLoveBump("CONF_FINALS", priorResults);
      fanLove = applyFanLoveGain(fanLove, bump + 1 /* tenure tick */);
      priorResults.push("CONF_FINALS");
    }
    expect(fanLove).toBeLessThan(40);
  });

  it("championships and major awards provide meaningful progression, not a trivial one", () => {
    let fanLove = 20;
    const before = fanLove;
    fanLove = applyFanLoveGain(fanLove, 18); // first championship
    fanLove = applyFanLoveGain(fanLove, 16); // first MVP, same season
    expect(fanLove - before).toBeGreaterThan(15); // a real, noticeable jump
  });
});

describe("fanLoveTier", () => {
  it("maps every band to its expected title, matching FAN_LOVE_BAND_THRESHOLDS exactly", () => {
    expect(fanLoveTier(0)).toBe("Unknown");
    expect(fanLoveTier(13)).toBe("Unknown");
    expect(fanLoveTier(14)).toBe("On the Radar");
    expect(fanLoveTier(31)).toBe("On the Radar");
    expect(fanLoveTier(32)).toBe("Familiar Face");
    expect(fanLoveTier(51)).toBe("Familiar Face");
    expect(fanLoveTier(52)).toBe("Fan Favorite");
    expect(fanLoveTier(71)).toBe("Fan Favorite");
    expect(fanLoveTier(72)).toBe("Idol");
    expect(fanLoveTier(87)).toBe("Idol");
    expect(fanLoveTier(88)).toBe("Legend");
    expect(fanLoveTier(100)).toBe("Legend");
  });

  it("gives 80 the Idol title, matching the exact example this feature was requested for", () => {
    expect(fanLoveTier(80)).toBe("Idol");
  });

  it("is exhaustive over FAN_LOVE_BAND_THRESHOLDS — every threshold boundary is covered", () => {
    for (const t of FAN_LOVE_BAND_THRESHOLDS) {
      expect(fanLoveTier(t)).not.toBe(fanLoveTier(t - 1));
    }
  });
});

describe("initialFanLoveForTeamChange", () => {
  it("gives an unknown prospect with no reputation a low starting value", () => {
    const v = initialFanLoveForTeamChange(5, [], 0);
    expect(v).toBeGreaterThanOrEqual(8);
    expect(v).toBeLessThanOrEqual(15);
  });

  it("gives a high-reputation prospect with no NBA awards yet a moderate starting value", () => {
    const v = initialFanLoveForTeamChange(60, [], 0);
    expect(v).toBeGreaterThanOrEqual(20);
    expect(v).toBeLessThanOrEqual(30);
  });

  it("gives a high-reputation All-Star a notably higher starting value", () => {
    const v = initialFanLoveForTeamChange(70, [{ type: "ALL_STAR", season: 2 }], 3);
    expect(v).toBeGreaterThanOrEqual(35);
    expect(v).toBeLessThanOrEqual(50);
  });

  it("gives a very-high-reputation MVP/champion the highest starting value, still below the hard cap", () => {
    const v = initialFanLoveForTeamChange(
      85,
      [{ type: "MVP", season: 4 }, { type: "CHAMPION", season: 4 }],
      5
    );
    expect(v).toBeGreaterThanOrEqual(50);
    expect(v).toBeLessThanOrEqual(65);
  });

  it("never exceeds the 70 ceiling even for a maximal reputation/award profile", () => {
    const v = initialFanLoveForTeamChange(
      100,
      [
        { type: "MVP", season: 5 }, { type: "CHAMPION", season: 5 },
        { type: "ALL_STAR", season: 1 }, { type: "ALL_STAR", season: 2 }, { type: "ALL_STAR", season: 3 },
        { type: "ALL_NBA", season: 5, team: 1 }, { type: "ALL_NBA", season: 4, team: 1 },
      ],
      8
    );
    expect(v).toBe(70);
  });
});
