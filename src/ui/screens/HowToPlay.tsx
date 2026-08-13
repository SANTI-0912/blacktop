import { Screen, Eyebrow, Title } from "../components/Shell";

const BEATS: { title: string; text: string }[] = [
  {
    title: "One decision at a time",
    text: "Every season you pick a focus, play through it, and live with what happens. No stat sheets to manage — just choices.",
  },
  {
    title: "Fan Love is earned, not given",
    text: "How far you go in the playoffs, the awards you win, and the loyalty you show your team all build (or cost) Fan Love — your standing with the city you play for.",
  },
  {
    title: "One rival, one story",
    text: "You're tracked against a rival from day one. Their career runs alongside yours, whether you like it or not.",
  },
  {
    title: "Your call, every time",
    text: "Contracts, trades, free agency — the Big Decision each season is yours. There's no wrong answer, only the career it leads to.",
  },
];

/** Shown automatically the first time this app is ever opened on a device
 * (see engine/onboarding.ts), and reachable manually afterward from
 * Creation's "How does this work?" link. Orients the player on the SHAPE
 * of the game — not a mechanic-by-mechanic walkthrough, which the
 * contextual FirstTimeHint callouts handle at the moment each one first
 * comes up. */
export function HowToPlay({ onDone }: { onDone: () => void }) {
  return (
    <Screen>
      <div className="rise mt-10">
        <Eyebrow>Before you start</Eyebrow>
        <Title size="xl">How this<br />works</Title>
      </div>

      <div className="mt-8 space-y-6 rise rise-1">
        {BEATS.map((b, i) => (
          <div key={b.title} className="flex gap-3.5">
            <span className="stat-num text-mute/50 text-xl font-bold leading-none">{i + 1}</span>
            <div>
              <div className="font-display uppercase text-[17px] tracking-wide">{b.title}</div>
              <p className="text-[13px] text-mute mt-1 leading-relaxed">{b.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rise rise-2">
        <button className="btn-primary" onClick={onDone}>Let's go</button>
      </div>
    </Screen>
  );
}
