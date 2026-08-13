import { ReactNode, useState } from "react";
import { hasSeenHint, markHintSeen } from "../../engine/onboarding";

/**
 * A small dismissible callout for a genuinely non-obvious mechanic, shown
 * only the first time its `id` is ever encountered on this device — never
 * repeats itself, even across brand new careers. Renders nothing once
 * dismissed (or if it was already dismissed in a prior career).
 */
export function FirstTimeHint({ id, children }: { id: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(() => hasSeenHint(id));
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2.5 border border-amber/40 bg-amber/5 rounded-sm px-3 py-2.5">
      <span className="text-[15px] leading-none mt-0.5">💡</span>
      <p className="flex-1 text-[12px] text-bone/90 leading-snug">{children}</p>
      <button
        type="button"
        aria-label="Dismiss hint"
        className="text-mute/60 hover:text-bone text-[13px] leading-none shrink-0"
        onClick={() => { markHintSeen(id); setDismissed(true); }}
      >
        ✕
      </button>
    </div>
  );
}
