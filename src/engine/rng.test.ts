import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";

describe("createRNG", () => {
  it("is deterministic for the same seed", () => {
    const a = createRNG(42);
    const b = createRNG(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRNG(7);
    for (let i = 0; i < 50; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
