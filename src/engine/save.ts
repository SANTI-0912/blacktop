import { CareerState } from "./career";

// ============================================================
// LOCAL SAVE — the whole career lives in-memory (App.tsx's useState) and,
// until now, a page reload wiped it. This persists the ONE thing needed to
// resume: CareerState, snapshotted only at the Career Hub — the single
// point in the season loop guaranteed safe to resume into (every other
// stage depends on transient view state — a mid-flight decision, an
// in-progress minigame — that isn't worth reconstructing). A reload mid-
// action loses that one action, never the whole career.
// ============================================================

const SAVE_KEY = "hardwood-career:save";
// Bump this if CareerState's shape ever changes incompatibly — a mismatched
// version is treated as "no save" rather than risking a crash on load.
const SAVE_VERSION = 1;

type SavePayload = { version: number; state: CareerState };

/** Snapshot the current career so it survives a reload. Never throws —
 * storage being full or unavailable (private browsing, etc.) just means
 * this session won't survive a reload; the career keeps playing fine. */
export function saveCareer(state: CareerState): void {
  try {
    const payload: SavePayload = { version: SAVE_VERSION, state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Ignored — see comment above.
  }
}

/** The saved career, or null if there is none, it's corrupted, or it was
 * written by an incompatible schema version. Never throws — any bad read
 * is treated the same as no save, and the bad entry is cleared so it
 * doesn't keep failing on every future load. */
export function loadCareer(): CareerState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<SavePayload>;
    if (payload.version !== SAVE_VERSION || !payload.state) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return payload.state;
  } catch {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignored */ }
    return null;
  }
}

/** Called when a career ends (Summary screen) or a new one starts — a
 * finished or abandoned career should never be offered as "Continue". */
export function clearCareer(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignored — see saveCareer.
  }
}
