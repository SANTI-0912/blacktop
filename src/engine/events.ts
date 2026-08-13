import { NarrativeEffects } from "./types";
import { RNG, weighted } from "./rng";

// ============================================================
// RANDOM EVENT ENGINE
//
// Events are CONTEXTUAL, not random noise. Each declares a `when` predicate
// against the player's actual situation — age, role, phase, awards, contract,
// rivalry, form — so a rookie never gets a veteran's storyline and an MVP
// gets MVP problems. Not all of them are bad; some are lucky, funny or
// career-changing.
// ============================================================

export type EventContext = {
  /** Every event id already seen this career, for one-time beats and follow-ups. */
  seen: string[];
  age: number;
  phase: "NCAA" | "NBA";
  ovr: number;
  role: string;
  seasonNumber: number;
  nbaSeasons: number;
  contractYearsLeft: number;
  hasMvp: boolean;
  hasTitle: boolean;
  allStars: number;
  lastPpg: number;
  confidence: number;
  reputation: number;
  rivalAhead: boolean;
  rivalName: string;
  teamName: string;
  madePlayoffsLast: boolean;
};

export type EventEffects = NarrativeEffects;

export type EventOption = {
  id: string;
  label: string;
  detail: string;
  effects: EventEffects;
  /** What actually happened as a result of this choice — never shown at
   * choice time, only collected into that season's "Decisions This Season"
   * recap. Must be specific to this option, not a restatement of `label`. */
  result: string;
  /** Opens a career thread — a consequence that pays off seasons later. */
  thread?: string;
};

export type GameEvent = {
  id: string;
  /** Short recap heading, e.g. "New Coach" — shown in the season recap, never the long `prompt`. */
  title: string;
  category: string;
  prompt: string;
  options: EventOption[];
  when: (c: EventContext) => boolean;
  weight?: number;
  /**
   * A story beat that can only happen once in a career. "A legend wants to
   * mentor you" is not a thing that keeps happening after you already have a
   * mentor — that repetition was the main reason careers started to feel alike.
   */
  once?: boolean;
};

const always = () => true;
const O = (id: string, label: string, detail: string, result: string, effects: EventEffects, thread?: string): EventOption =>
  ({ id, label, detail, effects, result, thread });

export const EVENT_POOL: GameEvent[] = [
  /* ---------------- COACH ---------------- */
  {
    id: "coach_primary_scorer", title: "New Role", once: true, category: "COACH",
    prompt: "Your coach wants to rebuild the offense around you as the primary scorer.",
    when: (c) => c.ovr >= 70,
    options: [
      O("a", "Accept the role", "Every possession runs through you now.", "The coach rebuilt the offense around you, and it never went back — for the rest of the season, every set started with your name called first.", { confidence: 8, fatigue: 6 }),
      O("b", "Keep playing your style", "You won't be forced into something you're not.", "You kept your game intact. The coach never brought it up again, but the offense quietly kept running through someone else for the rest of the year.", { confidence: 3, chemistry: 4 }, "role_refused"),
    ],
  },
  {
    id: "coach_defense_demand", title: "Defensive Assignment", category: "COACH",
    prompt: "The coaching staff says your defense is costing the team games.",
    when: always,
    options: [
      O("a", "Take the assignment", "You'll guard their best player every night.", "You bought in on the defensive end. The matchup wore on you physically, but the coaching staff started trusting you in different moments — crunch-time possessions you hadn't seen before.", { fatigue: 10 }),
      O("b", "Argue you're needed on offense", "Your scoring is what keeps them in games.", "You held your ground on offense. The defensive question never fully went away — it just moved to the next film session.", { confidence: 6 }),
      O("c", "Study film privately", "No announcements. Just fix it.", "You quietly fixed it in the film room. Nobody had to say anything, and the coaching staff noticed you'd solved it yourself.", {}),
    ],
  },
  {
    id: "coach_lost_confidence", title: "Losing Minutes", category: "COACH",
    prompt: "Your minutes are getting cut. The coach has stopped explaining why.",
    when: (c) => (c.role === "BENCH" || c.role === "ROTATION") && c.ovr >= 65,
    options: [
      O("a", "Ask him directly", "Get it out in the open.", "The conversation cleared the air. Your minutes started coming back within a couple of weeks, no fanfare, just more run.", { confidence: 5 }),
      O("b", "Outwork everyone in practice", "Make it impossible to sit you.", "You out-worked the doubt in every practice rep. The coach couldn't justify sitting you anymore, and the minutes followed.", { athleticism: 1, strength: 1, fatigue: 8 }),
      O("c", "Say nothing and wait", "Let it play out.", "You waited it out. The minutes never fully came back that season, and the silence between you and the coach hardened into something that hadn't been there before.", { confidence: -8 }, "coach_conflict"),
    ],
  },
  {
    id: "coach_more_responsibility", title: "Running the Offense", category: "COACH",
    prompt: "The coach wants you calling the plays on the floor.",
    when: (c) => c.ovr >= 76,
    options: [
      O("a", "Take command", "The offense is yours to run.", "You took command of the offense, and the ball started finding you in every crucial sequence — the team's identity shifted around what you could see on the floor.", { confidence: 5 }),
      O("b", "Stay focused on scoring", "Let someone else quarterback it.", "You stayed in your lane. The ball-handling role went to someone else, and the team ran two separate offenses depending on who had it.", { confidence: 4 }),
    ],
  },
  {
    id: "coach_fired", title: "Coaching Change", once: true, category: "COACH",
    prompt: "The coach who recruited you has been fired. The new staff has their own favorites.",
    when: (c) => c.seasonNumber > 2,
    options: [
      O("a", "Win them over early", "Show up first, leave last.", "You won the new staff over fast — showing up first, leaving last. Your spot in the rotation never wavered through the transition.", { fatigue: 5, chemistry: 4 }),
      O("b", "Let your play speak", "You don't audition for anyone.", "You let your play speak. It took the new staff most of the season to fully trust what they were seeing, but by spring, they did.", { confidence: 6 }),
    ],
  },

  /* ---------------- TEAMMATES ---------------- */
  {
    id: "teammate_conflict", title: "Teammate Conflict", category: "TEAMMATE",
    prompt: "A teammate confronts you in the locker room about how much you're shooting.",
    when: (c) => c.lastPpg > 18,
    options: [
      O("a", "Hear him out", "Maybe he's got a point.", "You heard him out, and the ball started moving more freely. It cost you a little swagger, but the locker room noticed the change.", { chemistry: 12, confidence: -3 }),
      O("b", "Tell him to get open", "You'll pass when there's someone to pass to.", "You held your ground. The tension in the locker room didn't clear — it just went quiet, and stayed quiet for weeks.", { confidence: 8, chemistry: -12, reputation: 2 }),
      O("c", "Take it to the coach", "Let the staff sort it out.", "The coaching staff mediated it. The issue faded on the surface, but you and your teammate never quite got back to how things were before.", { chemistry: -4 }),
    ],
  },
  {
    id: "teammate_friend", title: "A Real Friendship", once: true, category: "TEAMMATE",
    prompt: "You and the starting point guard have become close off the floor.",
    when: always,
    options: [
      O("a", "Build the two-man game", "Hours in the gym together.", "The two-man game became a real weapon on the floor — defenses started game-planning around the two of you specifically.", { chemistry: 14 }),
      O("b", "Keep it social", "Friends off the court, professionals on it.", "You kept it easy and social. The friendship held on your own terms, without ever turning into anything the front office had to manage.", { chemistry: 7, confidence: 3 }),
    ],
  },
  {
    id: "teammate_challenge", title: "The Young Challenger", category: "TEAMMATE",
    prompt: "A younger teammate is talking openly about taking your spot.",
    when: (c) => c.age >= 26,
    options: [
      O("a", "Bury him in practice", "Remind everyone who you are.", "You made your point in practice, hard. The kid backed off for now, but he remembers exactly how that day went — and so does the rest of the roster.", { confidence: 9, chemistry: -6, fatigue: 5 }),
      O("b", "Mentor him instead", "The team is bigger than the spot.", "You took him under your wing instead. The locker room noticed the leadership, and it changed how the young guys talked about you when you weren't in the room.", { chemistry: 12, reputation: 5 }),
    ],
  },
  {
    id: "teammate_trade_request", title: "Trade Request", category: "TEAMMATE",
    prompt: "Your best teammate has requested a trade. The media wants your reaction.",
    when: (c) => c.phase === "NBA",
    options: [
      O("a", "Publicly back him", "He's earned the right to choose.", "You backed him publicly. It cost you a little standing with the front office, who don't love players speaking for the organization.", { reputation: 4, chemistry: 5 }),
      O("b", "Say the team comes first", "Loyalty to the badge.", "You put the team first, publicly. The organization noticed the professionalism — and quietly filed it away for the next time they needed someone to trust.", { chemistry: -3, reputation: 2 }),
      O("c", "Refuse to comment", "Nothing good comes from this.", "You said nothing. The story moved on without you in it, which is exactly what you wanted.", { reputation: -1, chemistry: 2 }),
    ],
  },
  {
    id: "teammate_pass_more", title: "Stagnant Offense", category: "TEAMMATE",
    prompt: "The locker room feels the offense has gotten stagnant around you.",
    when: (c) => c.lastPpg > 22,
    options: [
      O("a", "Get everyone involved", "Move it, then move again.", "You got everyone involved, and the offense opened back up. Your own numbers dipped a little, but the team's record didn't.", { chemistry: 10 }),
      O("b", "Keep attacking", "The ball finds the best player.", "You kept attacking. The ball-movement complaints never fully went away, and a couple of teammates started keeping their distance in the locker room.", { confidence: 6, chemistry: -8 }),
    ],
  },

  /* ---------------- LEGENDS ---------------- */
  {
    id: "legend_mentor", title: "A Legend's Offer", once: true, category: "LEGEND",
    prompt: "A franchise legend has offered to work with you in the offseason.",
    when: always,
    options: [
      O("a", "Move to his city for the summer", "Every morning, six weeks.", "The summer with him changed how you see the game — not through any single lesson, but through six weeks of watching someone who'd already solved problems you were still running into.", { fatigue: 8 }, "mentor_accepted"),
      O("b", "Take a few sessions", "Learn what you can without losing your own game.", "You took what you could without handing over your whole summer. It wasn't the transformation he offered, but it was still yours.", { confidence: 3 }, "mentor_declined"),
    ],
  },
  {
    id: "legend_compare", title: "The Comparison", once: true, category: "LEGEND",
    prompt: "A retired MVP says on air that you remind him of himself at your age.",
    when: (c) => c.ovr >= 78,
    options: [
      O("a", "Embrace the comparison", "Say you're chasing his rings.", "You embraced the comparison publicly. It bought you headlines — and a standard everyone now expected you to chase every single night.", { confidence: 10, reputation: 6 }),
      O("b", "Deflect it", "You're trying to be the first you.", "You deflected it gracefully. People respected the humility, and the pressure that would have come with owning the comparison never quite landed on you.", { reputation: 4, confidence: 3 }),
    ],
  },
  {
    id: "legend_criticism", title: "Old-School Criticism", category: "LEGEND",
    prompt: "An all-time great says you'd never survive in his era.",
    when: (c) => c.reputation > 55,
    options: [
      O("a", "Fire back publicly", "You're not letting that slide.", "You fired back publicly. It got you attention — some of it the kind that follows you into every postgame interview for the rest of the season.", { confidence: 8, reputation: 5, chemistry: -3 }),
      O("b", "Use it in the gym", "Say nothing. Answer in the spring.", "You said nothing and let your game answer instead. By spring, the same analysts were bringing up different names.", { confidence: 4 }),
    ],
  },

  /* ---------------- MEDIA ---------------- */
  {
    id: "media_viral", title: "Gone Viral", category: "MEDIA",
    prompt: "A highlight of yours has gone viral. Overnight, everyone knows your name.",
    when: always,
    options: [
      O("a", "Lean into the spotlight", "Sponsors, interviews, all of it.", "You leaned into the spotlight — the sponsors, the interviews, all of it. The attention followed you for the rest of the season, and so did a wider audience that hadn't been paying attention before.", { reputation: 8, confidence: 6, fatigue: 5, fanLove: 6 }),
      O("b", "Stay out of it", "Keep your head down.", "You kept your head down. The moment passed, and most of the noise passed with it — though the clip itself never really stopped circulating.", { reputation: 3, fanLove: 2 }),
    ],
  },
  {
    id: "media_overrated", title: "Overrated", category: "MEDIA",
    prompt: "A national panel just voted you the most overrated player in the league.",
    when: (c) => c.reputation > 45,
    options: [
      O("a", "Print it and post it", "Motivation for the whole year.", "You used it as fuel all season, taped to the inside of your locker. By the time the panel ran their next list, they'd quietly dropped your name from it.", { confidence: 8, fatigue: 4 }),
      O("b", "Laugh it off publicly", "They'll be quiet by April.", "You laughed it off in public. Nobody brought it up again — which, in the league, is its own kind of statement.", { reputation: 4, confidence: 4 }),
      O("c", "Let it get to you", "It shouldn't, but it does.", "It got into your head more than you let on. A few too many possessions that season looked like a player trying to prove a point instead of just playing.", { confidence: -10 }),
    ],
  },
  {
    id: "media_bad_interview", title: "Bad Interview", category: "MEDIA",
    prompt: "You said something after a loss that's being replayed everywhere.",
    when: always,
    options: [
      O("a", "Apologize immediately", "Own it and move on.", "You apologized quickly and specifically. The story died within a week, and the people in the locker room appreciated that you didn't make them defend you.", { reputation: -2, chemistry: 6 }, "media_quiet"),
      O("b", "Stand by it", "You meant every word.", "You stood by what you said. It followed you into every road arena for months, but it also told people exactly where they stood with you.", { reputation: 5, chemistry: -8, confidence: 6 }, "media_outspoken"),
    ],
  },
  {
    id: "media_next_great", title: "Face of the League", category: "MEDIA",
    prompt: "The cover story calls you the future face of the league.",
    when: (c) => c.ovr >= 82,
    options: [
      O("a", "Accept the weight", "You've wanted this since you were a kid.", "You accepted the weight of the label. Every game got treated like an audition for it, all season long.", { confidence: 9, reputation: 8, fatigue: 4 }),
      O("b", "Say it's too early", "Rings first, covers later.", "You deflected the hype. People respected the perspective, and the locker room relaxed a little knowing you weren't chasing a magazine cover.", { reputation: 3, chemistry: 4 }),
    ],
  },
  {
    id: "media_fans_turn", title: "Booed at Home", category: "MEDIA",
    prompt: "The home crowd booed you during a bad stretch.",
    when: (c) => c.confidence < 45,
    options: [
      O("a", "Win them back", "Play harder than you ever have.", "You played your way back into the crowd's good graces. By the final homestand, the boos had turned into something closer to relief every time you scored.", { confidence: 6, fatigue: 8, reputation: 3, fanLove: 5 }),
      O("b", "Call them out", "You've given this city everything.", "You called the fans out at a podium, in exact words that made the local papers the next morning. It didn't land the way you hoped, and the boos got louder before they got quieter.", { confidence: 5, reputation: -5, chemistry: -4, fanLove: -8 }),
    ],
  },

  /* ---------------- RIVAL ---------------- */
  {
    id: "rival_trash_talk", title: "Rival Trash Talk", category: "RIVAL",
    prompt: "{RIVAL} called you overrated in a podcast interview.",
    when: always,
    options: [
      O("a", "Respond publicly", "Give it right back.", "You fired back publicly. What was a podcast comment turned into a real rivalry storyline the media wouldn't let go of all season.", { confidence: 8, reputation: 5 }, "media_outspoken"),
      O("b", "Say nothing, prepare", "You'll answer when you play them.", "You stayed quiet and let it build. The next time you two shared a court, everyone in the building remembered exactly why.", { confidence: 3 }),
    ],
  },
  {
    id: "rival_award", title: "Rival Wins Award", category: "RIVAL",
    prompt: "{RIVAL} just won a major award you were nominated for.",
    when: (c) => c.rivalAhead,
    options: [
      O("a", "Use it as fuel", "Next year is yours.", "You used it as motivation heading into next season, and it showed in how you trained through the whole offseason.", { confidence: 6, fatigue: 4 }),
      O("b", "Congratulate him publicly", "Class costs nothing.", "You congratulated him publicly. People noticed the class — though it stung more than the interview let on.", { reputation: 6, chemistry: 3, confidence: -2 }),
    ],
  },
  {
    id: "rival_signs_contender", title: "Rival Joins a Contender", category: "RIVAL",
    prompt: "{RIVAL} has signed with the team standing between you and a title.",
    when: (c) => c.phase === "NBA",
    options: [
      O("a", "Welcome the challenge", "You'd rather beat him than avoid him.", "You welcomed the challenge publicly. It sharpened your focus heading into every matchup with that team on the schedule.", { confidence: 7, reputation: 4 }),
      O("b", "Focus on your own team", "He's not your problem.", "You stayed focused on your own team's business. The front office appreciated not having to manage a public reaction.", { chemistry: 6 }),
    ],
  },
  {
    id: "rival_public_challenge", title: "Public Challenge", once: true, category: "RIVAL",
    prompt: "{RIVAL} challenged you to a one-on-one in front of cameras.",
    when: (c) => c.reputation > 50,
    options: [
      O("a", "Accept", "Right there, in front of everyone.", "You accepted, right there in front of the cameras. However it goes when you actually play him, that clip is already part of both your careers now.", { confidence: 9, reputation: 7, chemistry: -3 }, "risk_taken"),
      O("b", "Decline", "You play team basketball.", "You declined. Some people called it the smart move. Some called it something else, and {RIVAL} made sure that version got repeated.", { reputation: -4 }),
    ],
  },

  /* ---------------- CONTRACT ---------------- */
  {
    id: "contract_early_extension", title: "Early Extension", category: "CONTRACT",
    prompt: "The front office is offering an extension a year early — below market value.",
    when: (c) => c.phase === "NBA" && c.contractYearsLeft > 0,
    options: [
      O("a", "Sign for security", "Guaranteed money now.", "You signed for security. The front office appreciated the ease of it, though a few analysts wondered aloud if you'd left money on the table.", { chemistry: 8, reputation: -3 }),
      O("b", "Bet on yourself", "You'll be worth more next summer.", "You bet on yourself. The extension offer is gone now — whatever you make of this season is what the market decides you're worth next summer.", { confidence: 10 }, "risk_taken"),
    ],
  },
  {
    id: "contract_lowball", title: "Lowball Offer", category: "CONTRACT",
    prompt: "Your agent says the team's opening offer is an insult.",
    when: (c) => c.phase === "NBA" && c.contractYearsLeft <= 1,
    options: [
      O("a", "Let it get public", "Apply pressure through the media.", "You let it get public. The pressure worked — quietly, over the following weeks, the front office's tone in negotiations changed.", { reputation: 4, confidence: 5 }),
      O("b", "Keep it professional", "Handle it behind closed doors.", "You kept it professional, behind closed doors. The numbers moved, slowly, without either side ever having to walk anything back publicly.", { chemistry: 4 }),
    ],
  },
  {
    id: "contract_homecoming", title: "Homecoming Call", once: true, category: "CONTRACT",
    prompt: "The team you grew up watching has quietly made contact.",
    when: (c) => c.phase === "NBA" && c.nbaSeasons >= 3,
    options: [
      O("a", "It's tempting", "Some things aren't about money.", "You let the idea sit. It's not going away — and your current teammates can tell something's occupying a corner of your head.", { confidence: 7, chemistry: -5 }),
      O("b", "Not now", "You have unfinished business here.", "You shut it down. There's unfinished business here first — and the organization noticed you meant it.", { chemistry: 8 }),
    ],
  },
  {
    id: "contract_year_pressure", title: "Contract Year", category: "CONTRACT",
    prompt: "It's a contract year and everyone knows it. Every possession is being evaluated.",
    when: (c) => c.phase === "NBA" && c.contractYearsLeft <= 1,
    options: [
      O("a", "Chase the numbers", "Put up a season they can't ignore.", "You chased the numbers all year. The stats went up, and so did a quiet resentment in the locker room from guys who noticed exactly what you were doing.", { confidence: 6, chemistry: -8, fatigue: 6 }),
      O("b", "Play winning basketball", "Rings raise your price too.", "You played winning basketball instead of chasing a stat line. It paid off in ways a box score doesn't show — and in the way rival front offices talked about you.", { chemistry: 8 }),
    ],
  },

  /* ---------------- INJURY / FATIGUE ---------------- */
  {
    id: "injury_minor", title: "Rolled Ankle", category: "INJURY",
    prompt: "You rolled an ankle in practice. It's not serious, but it's not nothing.",
    when: always,
    options: [
      O("a", "Sit two weeks", "Do it properly.", "You sat and let it heal properly. It cost you two weeks of games, but the ankle never bothered you again that season.", { injuryRisk: -14, fatigue: -12 }, "injury_recovered"),
      O("b", "Tape it and play", "You've played through worse.", "You taped it and played through it. It held up this time — but the trainers noted exactly how close it came to not holding up.", { injuryRisk: 16 }, "injury_played_through"),
    ],
  },
  {
    id: "injury_serious", title: "Knee Scare", once: true, category: "INJURY",
    prompt: "Something went in your knee. The scan takes three days to come back.",
    when: (c) => c.age >= 24,
    options: [
      O("a", "Full rehab, no shortcuts", "Six months if that's what it takes.", "The full rehab took months, no shortcuts. You came back a step slower than before, but genuinely whole — and your body thanked you for it in the years that followed.", { injuryRisk: -25, athleticism: -2, fatigue: -20 }, "injury_recovered"),
      O("b", "Rush the return", "The team needs you now.", "You rushed the return. The team got you back sooner than your body wanted, and it never quite forgave you for it.", { injuryRisk: 25, athleticism: -3 }, "injury_played_through"),
    ],
  },
  {
    id: "fatigue_grind", title: "Road Grind", category: "INJURY",
    prompt: "Third road trip in a row. Your legs aren't there in the fourth quarter.",
    when: always,
    options: [
      O("a", "Ask for a night off", "One game to save ten.", "You took the night off. One missed game, and you were noticeably sharper for the rest of the trip.", { fatigue: -18 }),
      O("b", "Play every minute", "Nobody remembers tired.", "You played every minute. Nobody remembers a player who sat out a road game — your body, on the other hand, remembers everything.", { fatigue: 14, injuryRisk: 8 }),
    ],
  },
  {
    id: "injury_setback", title: "Setback", category: "INJURY",
    prompt: "Your comeback got pushed back again. You're watching from the bench.",
    when: (c) => c.age >= 27,
    options: [
      O("a", "Study the game from the sideline", "Learn what you can't do physically.", "You studied the game from the sideline, unable to do anything else. It sharpened how you read the floor once you were finally back on it.", { confidence: -4 }),
      O("b", "Push the medical staff", "You want back on the floor.", "You pushed the medical staff. They didn't love it, but they moved your timeline up — and made sure you knew exactly whose decision that was if it went wrong.", { injuryRisk: 12, confidence: 5 }),
    ],
  },

  /* ---------------- NCAA ---------------- */
  {
    id: "ncaa_transfer_interest", title: "Transfer Interest", once: true, category: "NCAA",
    prompt: "A bigger program has made it clear they'd take you tomorrow.",
    when: (c) => c.phase === "NCAA",
    options: [
      O("a", "Take the call", "You owe it to yourself to listen.", "You took the call. Word got back to your coach within days — programs talk, and now every practice has a slightly different edge to it.", { confidence: 5, reputation: 3 }),
      O("b", "Shut it down", "You committed here for a reason.", "You shut it down fast. Your coach heard about that too, and it bought you a level of trust that doesn't come from box scores.", { chemistry: 8 }),
    ],
  },
  {
    id: "ncaa_scouts", title: "Scouts Watching", category: "NCAA",
    prompt: "NBA scouts are at every game now, sitting behind your bench.",
    when: (c) => c.phase === "NCAA" && c.ovr >= 70,
    options: [
      O("a", "Play for the scouts", "Show them everything you've got.", "You played for the cameras. The tape looked good on the stat sheet, but a couple of teammates noticed exactly who you were playing for.", { confidence: 7, chemistry: -7 }),
      O("b", "Play for the team", "Winning is the best tape.", "You played for the team. Winning turned out to be the better audition — scouts wrote down more about your game by watching you make others better.", { chemistry: 9 }),
    ],
  },
  {
    id: "ncaa_one_and_done", title: "One and Done Talk", category: "NCAA",
    prompt: "Everyone assumes you're gone after this season. Your coach hasn't asked.",
    when: (c) => c.phase === "NCAA",
    options: [
      O("a", "Tell him you're leaving", "Be honest with him now.", "You told your coach the truth. He appreciated not being blindsided, even if it changed how he used you down the stretch.", { reputation: 3, chemistry: -4 }),
      O("b", "Say you haven't decided", "Keep it open.", "You kept it open. It kept everyone — teammates, coaches, reporters — guessing all season, which is exactly what you wanted.", { confidence: 3 }),
    ],
  },
  {
    id: "ncaa_expectations", title: "Championship Expectations", category: "NCAA",
    prompt: "The program hasn't made a deep tournament run in years. The fans expect you to change that.",
    when: (c) => c.phase === "NCAA",
    options: [
      O("a", "Accept the pressure", "That's exactly why you came.", "You accepted the pressure and let it drive you. Every practice that season felt like it mattered a little more than it should have.", { confidence: 6, fatigue: 5 }),
      O("b", "Lower the temperature", "One game at a time.", "You lowered the temperature publicly. The team played looser for it, and looser turned out to matter more than fired-up.", { chemistry: 6 }),
    ],
  },

  /* ---------------- OLYMPIC ---------------- */
  {
    id: "olympic_callup", title: "Olympic Call-Up", once: true, category: "OLYMPIC",
    prompt: "Your national federation has called. They want you this summer.",
    when: (c) => c.phase === "NBA" && c.ovr >= 74,
    options: [
      O("a", "Represent your country", "You've dreamed about this shirt.", "You answered the call. The whole country was watching — a different kind of attention than anything the league gives you.", { reputation: 9, confidence: 6, fatigue: 12, fanLove: 6 }),
      O("b", "Rest instead", "Your club season matters more.", "You rested instead. Your club season benefited from it, but a segment of fans back home didn't love watching someone else wear the jersey.", { fatigue: -18, injuryRisk: -8, reputation: -5, fanLove: -3 }),
    ],
  },
  {
    id: "olympic_expectation", title: "Gold or Nothing", category: "OLYMPIC",
    prompt: "Back home, they're saying anything short of a medal is a failure.",
    when: (c) => c.phase === "NBA" && c.reputation > 55,
    options: [
      O("a", "Embrace it", "Carry the whole country.", "You carried the weight of the country and never publicly blinked, even when the tournament got tight.", { confidence: 5, fatigue: 5 }),
      O("b", "Block it out", "Play the game, not the noise.", "You blocked out the noise and just played. It wasn't the story anyone wanted to write, but it was the one that got you through.", { confidence: 3 }),
    ],
  },

  /* ---------------- AGING ---------------- */
  {
    id: "aging_athleticism", title: "Losing a Step", category: "AGING",
    prompt: "Your coach mentioned, carefully, that you're not getting to the rim like you used to.",
    when: (c) => c.age >= 29,
    options: [
      O("a", "Rebuild your game around the jumper", "Adapt or disappear.", "You rebuilt your game around the jumper. It's not the player you used to be, but it's a real answer to a problem that wasn't going away.", { confidence: 3 }),
      O("b", "Train harder to keep the athleticism", "You're not done flying yet.", "You trained harder to keep the legs. It's a battle you're still fighting every single morning, and your body sends you the bill for it regularly.", { fatigue: 12, injuryRisk: 10 }, "risk_taken"),
      O("c", "Become a playmaker", "Let the game slow down for you.", "You slowed the game down and let your reads carry you instead of your legs. It's a different kind of effective, and it's real.", { confidence: 3 }),
    ],
  },
  {
    id: "aging_veteran_role", title: "Bench Role", category: "AGING",
    prompt: "The team wants you to come off the bench to stabilize the second unit.",
    when: (c) => c.age >= 31,
    options: [
      O("a", "Accept it for the team", "Ego doesn't win in June.", "You accepted the bench role for the team. It stung more than you let on, but it earned you a kind of respect that a starting job wouldn't have.", { chemistry: 12, reputation: 4, confidence: -5 }),
      O("b", "Refuse — you're still a starter", "You've earned that spot.", "You pushed back and kept your starting spot. Not everyone in the locker room loved watching you fight for it.", { confidence: 8, chemistry: -6 }),
    ],
  },
  {
    id: "aging_reinvent", title: "Reinvention", once: true, category: "AGING",
    prompt: "A skills coach thinks there's a completely different player left in you.",
    when: (c) => c.age >= 30,
    options: [
      O("a", "Reinvent yourself", "A whole new offseason of unlearning.", "You tore your game down and rebuilt it — a whole offseason of unlearning habits that used to be automatic. It's a different game now, deliberately.", { confidence: 5 }),
      O("b", "Stick with what worked", "Don't fix what got you here.", "You stuck with what worked. It still works, for now — though everyone around you can see the shot clock on that starting to run.", { confidence: 4 }),
    ],
  },
  {
    id: "aging_retirement_thoughts", title: "Thinking About the End", category: "AGING",
    prompt: "For the first time, you caught yourself thinking about life after basketball.",
    when: (c) => c.age >= 32,
    options: [
      O("a", "Push the thought away", "You're not finished.", "You pushed the thought away and kept playing like it wasn't there. Nobody in the locker room brought it up either.", { confidence: 7, fatigue: 6 }),
      O("b", "Start planning quietly", "It comes for everyone.", "You started planning quietly, without telling anyone — a few calls, nothing official. It comes for everyone eventually.", { confidence: -3, fatigue: -8 }),
    ],
  },

  /* ---------------- LUCK / FUN ---------------- */
  {
    id: "lucky_hot_streak", title: "Hot Streak", category: "LUCK",
    prompt: "Something clicked. You can't miss right now and you don't know why.",
    when: always,
    options: [
      O("a", "Ride it", "Shoot every time you're open.", "You rode it as long as it lasted. For two unbelievable weeks, every shot looked like it was already in before it left your hand.", { confidence: 12 }),
      O("b", "Stay within the offense", "Streaks end. Habits don't.", "You stayed within the offense. The streak evened out on its own, but the disciplined habits it built stuck around after it did.", { chemistry: 6, confidence: 5 }),
    ],
  },
  {
    id: "fun_kid_meeting", title: "A Young Fan", once: true, category: "LUCK",
    prompt: "A kid waited four hours outside the arena just to tell you he plays because of you.",
    when: (c) => c.reputation > 40,
    options: [
      O("a", "Give him your shoes", "He'll remember it forever.", "He'll be telling that story for the rest of his life — and by the time it made local news, so was everyone else who heard it.", { reputation: 6, confidence: 6, chemistry: 3, fanLove: 4 }),
      O("b", "Invite him to shootaround", "Let him see it up close.", "He got to see it up close, and so did everyone who watched the clip afterward — a small moment that traveled a lot further than you expected.", { reputation: 8, confidence: 5, fanLove: 5 }),
    ],
  },
  {
    id: "fun_charity", title: "Hometown Court", once: true, category: "LUCK",
    prompt: "You've been asked to fund a court rebuild in your hometown.",
    when: (c) => c.phase === "NBA",
    options: [
      O("a", "Pay for the whole thing", "Where you learned everything.", "The whole community showed up for the opening. It's the kind of thing that outlives every box score you'll ever post.", { reputation: 10, confidence: 5, fanLove: 6 }),
      O("b", "Lend your name to it", "Help without the headline.", "You helped quietly, no headline attached. The people who needed to know, knew.", { reputation: 5, fanLove: 2 }),
    ],
  },
  {
    id: "luck_gym_rat", title: "Gym Rat", category: "LUCK",
    prompt: "You've been the last one in the gym every night for a month.",
    when: always,
    options: [
      O("a", "Keep going", "Nobody outworks you.", "The extra work in an empty gym at midnight is invisible to everyone except the people who show up early enough to see the lights already on.", { fatigue: 10 }),
      O("b", "Build in recovery", "Smart beats stubborn.", "You built in real recovery instead of just grinding. It's a smarter approach than stubborn, even if nobody writes articles about it.", { fatigue: -12, injuryRisk: -8 }),
    ],
  },
  /* ---------------- FOLLOW-UPS: only exist because something happened ---------------- */
  {
    id: "coach_role_followup", title: "Adjusting to the Role", category: "COACH",
    prompt: "You've become the team's primary scorer. Defenses have adjusted, and everyone is watching how you handle it.",
    when: (c) => c.seen.includes("coach_primary_scorer") && c.lastPpg > 16,
    options: [
      O("a", "Adapt your game", "Counter what they're taking away.", "You adapted as defenses caught up to what you were doing, staying one step ahead of the coverages built specifically to stop you.", {}),
      O("b", "Force it through", "They'll tire before you do.", "You forced the issue anyway. It worked, eventually, but a few possessions down the stretch made the bench visibly uneasy.", { confidence: 6, chemistry: -5 }),
      O("c", "Give it up for a season", "Let someone else carry the scoring load.", "You gave the scoring load up for a season and let someone else carry it. The team was genuinely better for it, even if your own numbers weren't.", { chemistry: 10, confidence: -5 }),
    ],
  },
  {
    id: "legend_followup", title: "Checking In", category: "LEGEND",
    prompt: "The legend who mentored you has been watching your season closely. He wants a word.",
    when: (c) => c.seen.includes("legend_mentor"),
    options: [
      O("a", "Ask him what you're missing", "He won't soften it.", "He didn't soften it. What he told you stung for about a week, and then it started showing up in exactly the situations he'd warned you about.", {}),
      O("b", "Tell him you've got it from here", "You've outgrown the lessons.", "You told him you had it from here. He respected that too — mentors, the good ones, know when to step back.", { confidence: 8, reputation: 3 }),
    ],
  },
  {
    id: "injury_followup", title: "Old Injury, New Ache", category: "INJURY",
    prompt: "The joint you hurt before is talking to you again during back-to-backs.",
    when: (c) => c.seen.includes("injury_serious") || c.seen.includes("injury_minor"),
    options: [
      O("a", "Change how you play", "Less pounding, more thinking.", "You changed how you play around it — less pounding, more angles. It costs you a step, but the old injury stopped talking back.", { athleticism: -1, injuryRisk: -12 }),
      O("b", "Ignore it again", "It held up last time.", "You ignored it again. It held up, mostly — but 'mostly' is doing a lot of work in that sentence, and the training staff knows it.", { injuryRisk: 16, reputation: 3 }),
    ],
  },
  {
    id: "rival_followup", title: "Rival's Respect", category: "RIVAL",
    prompt: "{RIVAL} was asked about you again. This time he didn't take the bait — he said you make him better.",
    when: (c) => c.seen.includes("rival_trash_talk"),
    options: [
      O("a", "Return the respect", "You'd rather be measured against him than anyone.", "You returned the respect publicly. The rivalry got a little less bitter, without losing any of what made it worth watching.", { reputation: 6, confidence: 4 }),
      O("b", "Keep the edge", "Respect is for retirement.", "You kept the edge. Some rivalries aren't meant to soften, and the next matchup between you two got circled on every schedule in the league.", { confidence: 7, chemistry: -3 }),
    ],
  },
  {
    id: "media_followup", title: "The Long Profile", category: "MEDIA",
    prompt: "A long-form profile is being written about your career. They want real access.",
    when: (c) => c.reputation > 55 && c.seasonNumber > 3,
    options: [
      O("a", "Let them in completely", "The whole story, warts and all.", "You let them all the way in. The piece made you more human to people who'd only ever seen the highlights — and a lot of them said so.", { reputation: 9, confidence: 4, chemistry: -3, fanLove: 6 }),
      O("b", "Keep it about basketball", "Nothing off the court.", "You kept it about basketball. The piece ran shorter than the writer wanted, and so did the conversation about it afterward.", { reputation: 4 }),
    ],
  },
  {
    id: "team_rebuild", title: "The Rebuild", category: "TEAM",
    prompt: "The front office has told you privately they're tearing it down and starting over.",
    when: (c) => c.phase === "NBA" && !c.madePlayoffsLast,
    options: [
      O("a", "Ask to be part of the rebuild", "Grow with them.", "You committed to growing with the young core, publicly and without hesitation. The front office noticed exactly what that signaled.", { chemistry: 8, reputation: -3 }),
      O("b", "Ask out", "You don't have years to spare.", "You asked out. The front office understood, even if it stung — and it changed how the fanbase talked about you for the rest of the season.", { reputation: 5, chemistry: -8, fanLove: -6 }),
      O("c", "Say nothing publicly", "Wait and see who they bring in.", "You waited quietly to see who they'd bring in. It's not a statement, but silence read as one anyway.", { confidence: 2 }),
    ],
  },
  {
    id: "team_contender", title: "New Star Arrives", category: "TEAM",
    prompt: "Your front office just traded for a second star. The expectation is a title, now.",
    when: (c) => c.phase === "NBA" && c.madePlayoffsLast,
    options: [
      O("a", "Embrace the pressure", "This is what you asked for.", "You embraced the pressure publicly. This is what you signed up for when you committed to a winning roster.", { confidence: 6, fatigue: 5 }),
      O("b", "Work on fitting together", "Two stars only works if it works.", "You put in the work on fitting together. Two stars only works if it actually works, and by midseason, it was starting to.", { chemistry: 12 }),
    ],
  },
  {
    id: "coach_new_arrival", title: "New Coach, New System", category: "COACH",
    prompt: "A new head coach has arrived with a completely different system.",
    when: (c) => c.seasonNumber > 2,
    options: [
      O("a", "Learn the system first", "Buy in before asking for anything.", "You bought into the new system before asking for anything from it. The staff noticed, and it bought you real patience for the adjustment period.", {}),
      O("b", "Tell him what you do best", "Systems should fit players.", "You told him what you do best early. It took some real negotiating over the first few weeks, but the system eventually bent to fit you too.", { confidence: 6 }),
    ],
  },
  {
    id: "personal_routine", title: "Recovery Habits", category: "PERSONAL",
    prompt: "You've been told your recovery habits are costing you the fourth quarter.",
    when: (c) => c.age >= 24,
    options: [
      O("a", "Overhaul everything", "Sleep, food, the lot.", "The overhaul — sleep, food, recovery, all of it — showed up exactly where they said it would: in how your legs felt in the fourth quarter.", { athleticism: 2, injuryRisk: -12, fatigue: -12 }),
      O("b", "You're fine", "It's worked so far.", "You kept doing what worked. Mostly, it still does — though the training staff keeps a slightly closer eye on you than they used to.", { confidence: 4, injuryRisk: 6 }),
    ],
  },
  {
    id: "personal_fame", title: "Living in Public", category: "PERSONAL",
    prompt: "You can't eat dinner in this city without it becoming a photo.",
    when: (c) => c.reputation > 62,
    options: [
      O("a", "Lean into it", "It comes with what you wanted.", "You leaned into it. It comes with what you wanted, and the city has started to feel less like a place you play in and more like a place you belong.", { reputation: 7, fatigue: 4, fanLove: 5 }),
      O("b", "Pull your life back", "Smaller circle, quieter life.", "You pulled your life back — a smaller circle, quieter nights. The city still knows your name, just a little less of the rest of you.", { confidence: 6, fatigue: -8, reputation: -3, fanLove: -2 }),
    ],
  },
  {
    id: "teammate_injured", title: "Teammate Down", category: "TEAMMATE",
    prompt: "Your best teammate is out for the season. Everything falls to you now.",
    when: (c) => c.phase === "NBA",
    options: [
      O("a", "Carry it", "Every night, every minute.", "You carried the load every single night. By the time your teammate was back, the whole league had noticed exactly how much you could shoulder.", { confidence: 7, fatigue: 14, reputation: 6 }),
      O("b", "Spread the load", "Get everyone involved instead.", "You spread it around instead of trying to do it all. The team held together because of it, and everyone in that locker room knows it.", { chemistry: 10 }),
    ],
  },
  {
    id: "ncaa_first_start", title: "First Start", category: "NCAA",
    prompt: "You're getting your first career start, and the building knows it.",
    when: (c) => c.phase === "NCAA" && c.seasonNumber <= 2,
    options: [
      O("a", "Come out attacking", "Announce yourself.", "You came out swinging in your first start. The building remembers exactly what that looked like — some of your teammates remember it a little less fondly.", { confidence: 8, chemistry: -2 }),
      O("b", "Let the game come to you", "No need to force it.", "You let the game come to you instead of forcing it. It came — quietly, patiently, exactly the way a coach hopes a rookie's first start goes.", { chemistry: 4 }),
    ],
  },
];

/** Picks one contextually valid event, weighted, avoiding recent repeats. */
export function pickEvent(
  rng: RNG,
  ctx: EventContext,
  recentIds: string[],
  /** Categories already used THIS season — keeps one season varied. */
  usedCategories: string[] = [],
  /** When set, only events whose category is in this list are eligible. */
  allowedCategories?: string[]
): GameEvent | null {
  const valid = EVENT_POOL.filter((e) => {
    if (!e.when(ctx)) return false;
    // One-time story beats never come back around.
    if (e.once && ctx.seen.includes(e.id)) return false;
    if (allowedCategories && !allowedCategories.includes(e.category)) return false;
    return true;
  });
  if (valid.length === 0) return null;

  // Prefer a category this season hasn't touched yet, so six events read as six
  // different parts of a career rather than six versions of the same one.
  const fresh = valid.filter((e) => !usedCategories.includes(e.category));
  const pool = fresh.length > 0 ? fresh : valid;

  const entries = pool.map((e) => {
    let w = e.weight ?? 1;
    const idx = recentIds.indexOf(e.id);
    // Much steeper cooldown, over a longer window, than before.
    if (idx >= 0) w *= idx < 2 ? 0.005 : idx < 5 ? 0.08 : 0.3;
    // Anything already seen this career is dampened even once off cooldown.
    else if (ctx.seen.includes(e.id)) w *= 0.35;
    return { item: e, weight: Math.max(w, 0.005) };
  });
  return weighted(rng, entries);
}

/** Substitutes runtime names into event copy. */
export function renderPrompt(text: string, ctx: EventContext): string {
  return text.replace(/\{RIVAL\}/g, ctx.rivalName).replace(/\{TEAM\}/g, ctx.teamName);
}
