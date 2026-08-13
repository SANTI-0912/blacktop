import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { createPlayer } from "./player";

describe("createPlayer", () => {
  it("gives every new player a starting fanLove in [15, 30]", () => {
    for (let seed = 0; seed < 20; seed++) {
      const player = createPlayer(createRNG(seed), {
        name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
      });
      expect(player.hidden.fanLove).toBeGreaterThanOrEqual(15);
      expect(player.hidden.fanLove).toBeLessThanOrEqual(30);
    }
  });
});
