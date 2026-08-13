import { describe, it, expect } from "vitest";
import { createRNG } from "./rng";
import { createPlayer } from "./player";
import { applyDecisionEffects } from "./decisions";
import { applyThreadEffects } from "./threads";
import { Person } from "./types";

function testPerson(seed: number, fanLove = 50, reputation = 50): Person {
  const p = createPlayer(createRNG(seed), {
    name: "T", country: "USA", position: "SG", height: 198, playstyle: "SHARPSHOOTER",
  });
  return { ...p, hidden: { ...p.hidden, fanLove, reputation } };
}

describe("applyDecisionEffects — fanLove no longer auto-derives from reputation", () => {
  it("leaves fanLove untouched when a decision only changes reputation", () => {
    const person = testPerson(1);
    const next = applyDecisionEffects(person, {
      id: "a", label: "test", effects: { reputation: 10 }, tags: [],
    });
    expect(next.hidden.reputation).toBe(60);
    expect(next.hidden.fanLove).toBe(50);
  });

  it("leaves fanLove untouched when reputation drops", () => {
    const person = testPerson(2);
    const next = applyDecisionEffects(person, {
      id: "a", label: "test", effects: { reputation: -8 }, tags: [],
    });
    expect(next.hidden.reputation).toBe(42);
    expect(next.hidden.fanLove).toBe(50);
  });

  it("leaves fanLove untouched when the decision has no reputation effect", () => {
    const person = testPerson(3);
    const next = applyDecisionEffects(person, {
      id: "a", label: "test", effects: { confidence: 5 }, tags: [],
    });
    expect(next.hidden.fanLove).toBe(50);
  });

  it("applies an explicit fanLove effect directly, clamped to [0, 100]", () => {
    const person = testPerson(4);
    const next = applyDecisionEffects(person, {
      id: "a", label: "test", effects: { fanLove: 8 }, tags: [],
    });
    expect(next.hidden.fanLove).toBe(58);

    const high = testPerson(5, 98);
    const next2 = applyDecisionEffects(high, {
      id: "a", label: "test", effects: { fanLove: 20 }, tags: [],
    });
    expect(next2.hidden.fanLove).toBe(100);

    const low = testPerson(6, 2);
    const next3 = applyDecisionEffects(low, {
      id: "a", label: "test", effects: { fanLove: -20 }, tags: [],
    });
    expect(next3.hidden.fanLove).toBe(0);
  });
});

describe("applyThreadEffects — fanLove no longer auto-derives from reputation (mirrors decisions.ts)", () => {
  it("leaves fanLove untouched when a thread payoff only changes reputation", () => {
    const person = testPerson(7);
    const next = applyThreadEffects(person, { reputation: 10 });
    expect(next.hidden.reputation).toBe(60);
    expect(next.hidden.fanLove).toBe(50);
  });

  it("leaves fanLove untouched when reputation drops", () => {
    const person = testPerson(8);
    const next = applyThreadEffects(person, { reputation: -6 });
    expect(next.hidden.reputation).toBe(44);
    expect(next.hidden.fanLove).toBe(50);
  });

  it("leaves fanLove untouched when the thread payoff has no reputation effect", () => {
    const person = testPerson(9);
    const next = applyThreadEffects(person, { confidence: 5 });
    expect(next.hidden.fanLove).toBe(50);
  });

  it("applies an explicit fanLove effect directly", () => {
    const person = testPerson(10);
    const next = applyThreadEffects(person, { fanLove: 12 });
    expect(next.hidden.fanLove).toBe(62);
  });
});
