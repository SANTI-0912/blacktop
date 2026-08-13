import { describe, it, expect, beforeEach } from "vitest";
import { saveCareer, loadCareer, clearCareer } from "./save";
import { initCareer, CareerState } from "./career";

// The test environment (vitest's default "node" pool) has no localStorage
// global at all, unlike a real browser — this is a minimal in-memory
// stand-in so save.ts's actual storage calls run for real, not mocked away.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
});

function sampleCareer(): CareerState {
  return initCareer(42, {
    name: "Test Player", country: "USA", position: "SG", height: 198,
    playstyle: "SHARPSHOOTER", collegeTeamId: "kansas",
  });
}

describe("saveCareer / loadCareer", () => {
  it("returns null when there is no save", () => {
    expect(loadCareer()).toBeNull();
  });

  it("round-trips a saved career", () => {
    const career = sampleCareer();
    saveCareer(career);
    expect(loadCareer()).toEqual(career);
  });

  it("overwrites a previous save rather than accumulating", () => {
    saveCareer(sampleCareer());
    const second = { ...sampleCareer(), season: 7 };
    saveCareer(second);
    expect(loadCareer()?.season).toBe(7);
  });

  it("treats corrupted JSON as no save, and clears it", () => {
    localStorage.setItem("hardwood-career:save", "{ not valid json");
    expect(loadCareer()).toBeNull();
    expect(localStorage.getItem("hardwood-career:save")).toBeNull();
  });

  it("treats a mismatched schema version as no save, and clears it", () => {
    localStorage.setItem("hardwood-career:save", JSON.stringify({ version: 999, state: sampleCareer() }));
    expect(loadCareer()).toBeNull();
    expect(localStorage.getItem("hardwood-career:save")).toBeNull();
  });
});

describe("clearCareer", () => {
  it("removes a save so loadCareer no longer returns it", () => {
    saveCareer(sampleCareer());
    clearCareer();
    expect(loadCareer()).toBeNull();
  });

  it("is a no-op when there is nothing to clear", () => {
    expect(() => clearCareer()).not.toThrow();
  });
});
