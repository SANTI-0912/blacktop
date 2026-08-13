import { useState } from "react";
import { Playstyle, Position } from "../../engine/types";
import { PLAYSTYLE_PROFILES } from "../../engine/playstyle";
import { Screen, Eyebrow, Title } from "../components/Shell";
import { searchCountries, findCountry } from "../../engine/countries";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

export function Creation({
  onStart, onShowHowToPlay,
}: {
  onStart: (v: { name: string; country: string; position: Position; height: number; playstyle: Playstyle }) => void;
  onShowHowToPlay: () => void;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Colombia");
  const [countryQuery, setCountryQuery] = useState("");
  const [position, setPosition] = useState<Position>("SG");
  const [height, setHeight] = useState(198);
  const [playstyle, setPlaystyle] = useState<Playstyle | null>(null);

  const ready = name.trim().length > 0 && playstyle !== null;

  return (
    <Screen>
      <div className="rise">
        <Eyebrow>Recruit profile</Eyebrow>
        <Title size="xl">
          Every career
          <br />
          starts here
        </Title>
        <p className="mt-3 text-mute text-sm">You arrive as a top prospect. Where it goes from here is on you.</p>
        <button type="button" onClick={onShowHowToPlay} className="mt-2 eyebrow text-mute/60 hover:text-amber transition-colors">
          How does this work?
        </button>
      </div>

      <div className="mt-9 rise rise-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full bg-transparent border-0 border-b border-line px-0 py-2 font-display text-[32px] uppercase tracking-wide placeholder:text-mute/30 focus:border-amber outline-none transition-colors"
        />
      </div>

      <div className="mt-6 rise rise-1">
        {findCountry(country) && !countryQuery ? (
          <button
            onClick={() => setCountryQuery(" ")}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-lg leading-none">{findCountry(country)!.flag}</span>
            <span className="text-sm text-mute">{country}</span>
            <span className="eyebrow text-mute/50">— change</span>
          </button>
        ) : (
          <>
            <input
              value={countryQuery.trim()}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder="Search country…"
              aria-label="Search country"
              autoFocus
              className="w-full bg-transparent border-0 border-b border-line px-0 py-2 text-sm placeholder:text-mute/50 focus:border-amber outline-none"
            />
            <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-line/50">
              {searchCountries(countryQuery).slice(0, 40).map((c) => (
                <button
                  key={c.code}
                  onClick={() => { setCountry(c.name); setCountryQuery(""); }}
                  className="w-full flex items-center gap-2.5 py-2.5 text-left hover:text-amber transition-colors"
                >
                  <span className="text-lg leading-none">{c.flag}</span>
                  <span className="text-sm flex-1">{c.name}</span>
                  <span className="eyebrow text-mute/50">{c.code}</span>
                </button>
              ))}
              {searchCountries(countryQuery).length === 0 && (
                <p className="py-3 text-sm text-mute">No country matches that.</p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-7 rise rise-1 flex items-center gap-8">
        <div>
          <div className="eyebrow mb-2">Position</div>
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                aria-pressed={position === p}
                onClick={() => setPosition(p)}
                className={`w-10 h-10 font-display text-base border rounded-sm transition-colors ${
                  position === p ? "border-amber bg-amber text-ink" : "border-line text-mute"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <label className="eyebrow block mb-2" htmlFor="height">
            Height — <span className="stat-num text-bone">{height}cm</span>
          </label>
          <input
            id="height"
            type="range"
            min={180}
            max={220}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-full accent-amber"
          />
        </div>
      </div>

      <div className="mt-9 rise rise-2">
        <Eyebrow>Playstyle — sets where you start, not how far you go</Eyebrow>
        <div className="mt-3 space-y-2">
          {Object.values(PLAYSTYLE_PROFILES).map((s) => {
            const on = playstyle === s.id;
            return (
              <button
                key={s.id}
                aria-pressed={on}
                onClick={() => setPlaystyle(s.id)}
                className={`w-full text-left px-4 py-3 border rounded-sm transition-colors ${
                  on ? "border-amber bg-amber/10" : "border-line hover:border-mute/50"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display uppercase text-xl tracking-wide">{s.label}</span>
                  <span className="eyebrow">{s.coreLabel}</span>
                </div>
                <p className="text-sm text-mute mt-0.5">{s.tagline}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-9 rise rise-3">
        <button
          className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={!ready}
          onClick={() => ready && onStart({ name: name.trim(), country, position, height, playstyle: playstyle! })}
        >
          Choose your program
        </button>
      </div>
    </Screen>
  );
}
