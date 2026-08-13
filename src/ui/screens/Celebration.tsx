import { useEffect, useState } from "react";
import { CareerEvent } from "../../engine/types";
import { MILESTONE_FLAGS } from "../../engine/history";
import { SeasonConclusion } from "../../engine/career";
import { Screen } from "../components/Shell";

export type CelebrationEntry = { key: string; year: number };

const CELEBRATION_COPY: Record<string, { headline: string; awardName: string; icon: string }> = {
  MVP: { headline: "THE BEST IN THE WORLD!!!!!", awardName: "NBA Most Valuable Player", icon: "👑" },
  NBA_CHAMPION: { headline: "NBA CHAMPION!!!!!", awardName: "NBA Champion", icon: "🏆" },
  NCAA_CHAMPION: { headline: "NATIONAL CHAMPION!!!!!", awardName: "NCAA Champion", icon: "🏆" },
  "FINALS MVP": { headline: "THE FINALS BELONG TO YOU!!!!!", awardName: "Finals MVP", icon: "🏅" },
  "ALL STAR": { headline: "ONE OF THE BEST!!!!!", awardName: "NBA All-Star", icon: "⭐" },
  "ALL NBA": { headline: "AMONG THE LEAGUE'S ELITE!!!!!", awardName: "All-NBA Team", icon: "🎖️" },
  "ROOKIE OF YEAR": { headline: "THE ROOKIE OF THE YEAR!!!!!", awardName: "Rookie of the Year", icon: "🌟" },
  OLYMPIC_GOLD: { headline: "OLYMPIC CHAMPION!!!!!", awardName: "Olympic Gold Medalist", icon: "🥇" },
};

// Smaller moments first, the biggest ones last — a multi-award season
// chains through these in order and ends on its highest note.
const CELEBRATION_ORDER = [
  "ROOKIE OF YEAR", "ALL STAR", "ALL NBA", "MVP", "NBA_CHAMPION", "NCAA_CHAMPION", "FINALS MVP",
];

/**
 * Builds this season's celebration queue from data finishSeason already
 * computed — never invents an award. conclusion.awards covers every
 * NBA-side type (MVP, CHAMPION, FINALS MVP, ALL STAR, ALL NBA, ROOKIE OF
 * YEAR). NCAA's tournament championship never produces a CHAMPION award
 * (rollSeasonAwards only pushes ALL_TOURNAMENT for NCAA), so it's detected
 * from the existing MILESTONE_FLAGS.CHAMPIONSHIP event flag instead — the
 * same flag finishSeason already attaches to that season's signature_moment
 * event. The two are mutually exclusive by construction (a season is either
 * NBA or NCAA), so there's no risk of double-counting one championship as
 * both.
 */
export function buildSeasonCelebrations(
  conclusion: SeasonConclusion,
  events: CareerEvent[],
  year: number
): CelebrationEntry[] {
  const queue: CelebrationEntry[] = [];
  for (const key of CELEBRATION_ORDER) {
    if (key === "NBA_CHAMPION") {
      if (conclusion.awards.includes("CHAMPION")) queue.push({ key, year });
    } else if (key === "NCAA_CHAMPION") {
      if (!conclusion.awards.includes("CHAMPION") && events.some((e) => e.flags.includes(MILESTONE_FLAGS.CHAMPIONSHIP))) {
        queue.push({ key, year });
      }
    } else if (conclusion.awards.includes(key)) {
      queue.push({ key, year });
    }
  }
  return queue;
}

/**
 * A single full-screen award reveal. Deliberately NOT another Season
 * Complete — no stats, no decisions, no league news, just the moment. The
 * Continue button stays disabled for a beat so the screen has a chance to
 * land before the player taps through it.
 */
export function Celebration({
  playerName, entry, onNext,
}: { playerName: string; entry: CelebrationEntry; onNext: () => void }) {
  const copy = CELEBRATION_COPY[entry.key];
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const id = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(id);
  }, [entry.key, entry.year]);

  if (!copy) return null;

  return (
    <Screen>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="celebration-glow rise">
          <span className="text-7xl">{copy.icon}</span>
        </div>
        <div className="rise rise-1 mt-7 font-display uppercase text-2xl tracking-wide text-bone">
          {playerName}
        </div>
        <h1 className="rise rise-2 mt-3 font-display uppercase text-[50px] leading-[0.9] text-amber">
          {copy.headline}
        </h1>
        <div className="rise rise-3 mt-6 eyebrow">{copy.awardName}</div>
        <div className="rise rise-3 mt-1 text-mute text-sm">{entry.year}</div>
      </div>
      <div
        className={`mt-auto pt-10 rise rise-3 transition-opacity duration-300 ${
          ready ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button className="btn-primary" onClick={onNext}>Continue</button>
      </div>
    </Screen>
  );
}
