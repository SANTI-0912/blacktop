import { ThreadResolution } from "../../engine/threads";
import { Screen, Eyebrow } from "../components/Shell";

// The payoff screen for a decision made seasons ago. Deliberately given its
// own moment — this is where the career reveals that your choices had weight.
export function ConsequenceScreen({
  resolution, onNext,
}: { resolution: ThreadResolution; onNext: () => void }) {
  const tone = resolution.good ? "#E31E24" : "#FF4D3D";
  return (
    <Screen>
      <div className="rise mt-16">
        <Eyebrow>{resolution.label}</Eyebrow>
        <p className="mt-4 text-[23px] leading-snug" style={{ color: tone }}>
          {resolution.text}
        </p>
        <p className="mt-5 text-[13px] text-mute border-l-2 border-line pl-3 leading-relaxed">
          This traces back to a decision you made earlier in your career.
        </p>
      </div>
      <div className="mt-auto pt-12 rise rise-1">
        <button className="btn-primary" onClick={onNext}>Continue</button>
      </div>
    </Screen>
  );
}
