// ============================================================
// ONBOARDING FLAGS — separate from engine/save.ts on purpose. A career
// save answers "where was I in THIS career"; these answer "has this
// person, on this device, ever been shown X" — a fact that must survive
// finishing a career, starting a new one, or clearing a save entirely.
// Never throws: a broken/unavailable localStorage just means "treat
// everything as already seen" rather than repeatedly forcing hints nobody
// can dismiss permanently.
// ============================================================

const INTRO_KEY = "hardwood-career:seen-intro";
const HINT_PREFIX = "hardwood-career:hint-";

/** Whether the one-time "How this works" screen has already been shown. */
export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // Ignored — see file header.
  }
}

/** Whether a specific contextual hint (e.g. "fan-love") has already been dismissed. */
export function hasSeenHint(id: string): boolean {
  try {
    return localStorage.getItem(HINT_PREFIX + id) === "1";
  } catch {
    return true;
  }
}

export function markHintSeen(id: string): void {
  try {
    localStorage.setItem(HINT_PREFIX + id, "1");
  } catch {
    // Ignored — see file header.
  }
}
