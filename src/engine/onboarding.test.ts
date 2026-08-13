import { describe, it, expect, beforeEach } from "vitest";
import { hasSeenIntro, markIntroSeen, hasSeenHint, markHintSeen } from "./onboarding";

// Same rationale as save.test.ts — vitest's default "node" pool has no
// localStorage global, so this stands in for a real one.
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

describe("intro flag", () => {
  it("is unseen by default", () => {
    expect(hasSeenIntro()).toBe(false);
  });

  it("stays seen once marked", () => {
    markIntroSeen();
    expect(hasSeenIntro()).toBe(true);
  });
});

describe("hint flags", () => {
  it("each hint id is tracked independently", () => {
    markHintSeen("fan-love");
    expect(hasSeenHint("fan-love")).toBe(true);
    expect(hasSeenHint("big-decision")).toBe(false);
  });

  it("is unseen by default for an id never marked", () => {
    expect(hasSeenHint("dev-focus")).toBe(false);
  });
});
