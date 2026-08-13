import { describe, it, expect } from "vitest";
import { EVENT_POOL } from "./events";

describe("EVENT_POOL content completeness", () => {
  it("every event has a non-empty title, distinct from its id", () => {
    for (const e of EVENT_POOL) {
      expect(e.title, `event "${e.id}" is missing a title`).toBeTruthy();
      expect(e.title.length).toBeGreaterThan(2);
    }
  });

  it("every option has a non-empty result, distinct from its label and detail", () => {
    for (const e of EVENT_POOL) {
      for (const o of e.options) {
        expect(o.result, `event "${e.id}" option "${o.id}" is missing a result`).toBeTruthy();
        expect(o.result).not.toBe(o.label);
        expect(o.result).not.toBe(o.detail);
      }
    }
  });

  it("has exactly 56 events (sanity check against accidental deletion)", () => {
    expect(EVENT_POOL.length).toBe(56);
  });
});
