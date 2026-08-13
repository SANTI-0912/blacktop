// Small mulberry32 PRNG so a whole career can be re-run deterministically
// from a seed if we ever want "replay this exact career" or reproducible tests.
// Nothing else in the engine calls Math.random() directly.

export type RNG = { next: () => number; seed: number };

export function createRNG(seed: number): RNG {
  let a = seed >>> 0;
  const rng: RNG = {
    seed,
    next: () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
  return rng;
}

export function randRange(rng: RNG, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

export function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pick<T>(rng: RNG, arr: T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)];
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function weighted<T>(rng: RNG, items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng.next() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.item;
  }
  return items[items.length - 1].item;
}
