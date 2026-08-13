import { useState } from "react";
import { TeamIdentity } from "../../engine/identity";

// One component, used everywhere a team appears. Swapping in real logo assets
// only requires setting `assetUrl` on the identity — no screen changes.

export function TeamLogo({
  identity, size = 40,
}: { identity: TeamIdentity; size?: number }) {
  const [failed, setFailed] = useState(false);

  // Real crest when we have one; the procedural mark is the fallback so a
  // blocked or missing asset never leaves an empty hole in the layout.
  if (identity.assetUrl && !failed) {
    return (
      <img
        src={identity.assetUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 object-contain"
      />
    );
  }

  const { primary, secondary, monogram, shape } = identity;
  const fontSize = monogram.length >= 4 ? 26 : monogram.length === 3 ? 30 : 36;

  const outline =
    shape === "circle" ? <circle cx="50" cy="50" r="44" /> :
    shape === "diamond" ? <path d="M50 4 L94 50 L50 96 L6 50 Z" /> :
    shape === "banner" ? <path d="M8 8 H92 V70 L50 94 L8 70 Z" /> :
    <path d="M50 5 L92 20 V52 C92 74 73 89 50 96 C27 89 8 74 8 52 V20 Z" />;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0" aria-hidden="true">
      <g fill={primary} stroke={secondary} strokeWidth="4">{outline}</g>
      <text
        x="50" y="50"
        textAnchor="middle" dominantBaseline="central"
        fill={secondary}
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight="700"
        fontSize={fontSize}
        letterSpacing="1"
      >
        {monogram}
      </text>
    </svg>
  );
}
