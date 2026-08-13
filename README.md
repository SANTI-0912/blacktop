# BlackTop — Career (v2)

Age-by-age basketball career sim. React + TypeScript + Vite + Tailwind.

```bash
npm install
npm run dev
```

## Season loop

```
CAREER HUB          age / team / role / OVR / current attributes / Fan Love / what's next
    v
DEVELOPMENT PICK    3 options, each showing its exact locked reward (current -> resulting value)
    v
SEASON EVENTS       mini-decisions during the season; each choice's consequence is
                     collected for that season's recap (never shown as a permanent log)
    v
REGULAR SEASON      simulated week by week (progress bar + current attributes), then final line
    v
PLAYOFFS            simulated, shown as a bracket run
    v
CHAMPIONSHIP        played — only if the run reaches a title event
    v
SEASON COMPLETE     stats, development result, Fan Love, and that season's
                     "Decisions This Season" recap (if any occurred)
    v
BIG DECISION        one per season — team offer or career fork, now fired here,
                     after the season is fully resolved, with its own consequence screen
    v
OFFSEASON           aging -> next age
```

Ages 18-20 college, draft, ages 21-30 NBA. Olympics every 4 years.

Fan Love (0-100) is a livelier companion to reputation, driven by three layers:
a slow baseline target from role, career awards, and team tenure that it eases
toward each season; large fixed spikes at big moments (championship, first MVP,
first All-Star, first All-NBA, Olympic gold) sized to be felt immediately; and
a curated few narrative decisions authored to touch it directly — never an
automatic echo of reputation. It's shown on the Career Hub and Season Complete,
never as a separate system to manage.

## File map

| File | Role | Status |
|---|---|---|
| `engine/simulation.ts` | season performance formula | reused |
| `engine/playstyle.ts` | **new** — playstyle identity and development pools |
| `engine/growth.ts` | attribute development | reused (+clutch) |
| `engine/playoffs.ts` | bracket progression | reused |
| `engine/rival.ts` | independent rival career | reused |
| `engine/awards.ts` | MVP / All-Star / titles | reused |
| `engine/decisions.ts` | narrative bank | reused (phase-gated) |
| `engine/history.ts` | milestone flags + callbacks | reused |
| `engine/teams.ts` | **new** — named teams, rosters, national teams |
| `engine/overall.ts` | **new** — OVR + relative role |
| `engine/challenge.ts` | **new** — championship challenge scaling |
| `engine/schedule.ts` | **new** — week ticker, bracket, seeding |
| `engine/bigdecision.ts` | **new** — one major decision per season |
| `engine/career.ts` | rewritten orchestrator (age/team based) |

## Championship challenge scaling

Difficulty is a function of how much you have to carry:

```
load        = (playerOVR - supportingCastOVR + 18) / 36
rounds      = 4 + load*5          (4..9)
seconds     = 13 - load*5 + skillRelief
opposition  = 0.88 + load*0.34    (per-round contest pressure)
windowScale = attributeWindow / opposition
roundsToWin = 60% of rounds       (CONSTANT — never unwinnable)
```

Attributes set each round's window directly. Clutch is weighted by how late
the round is, so it pays off exactly where it should.

Measured title rates at identical player skill:

| Scenario | Rate |
|---|---|
| Role player on superteam (75/92) | 65% |
| Superstar, elite cast (95/92) | 62% |
| Average / average (75/76) | 55% |
| Superstar carrying weak team (95/76) | 49% |

Player skill still dominates: at the same team, raw skill 35/55/75 produces
5% / 47% / 98%.

## Verified

- `tsc --noEmit` and `vite build` clean
- 150 full careers simulated headlessly: no dead ends, every career reaches a
  summary, timelines complete, ~2.8 title events and ~2 Olympics per career
- OVR progression 52 -> 84 across a career

## Known gaps

Save/resume, injuries that sideline mid-season, deeper roster simulation
(teammates don't develop yet), other sports.
