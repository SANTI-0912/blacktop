/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Black / white / red minimalist sports aesthetic (design reference:
        // ChatGPT Image Aug 12, 2026, 06_35_15 PM.png). Token NAMES are kept
        // stable on purpose — hundreds of existing className references
        // (text-amber, bg-ink, etc.) point at these names, so re-theming the
        // whole app is just changing the values below, no template edits.
        ink:   "#0A0A0A", // near-black base
        court: "#151515", // elevated surface (cards)
        line:  "#2A2A2A", // hairline borders
        bone:  "#F5F5F2", // primary text — soft white
        mute:  "#8C8C8C", // secondary text — neutral gray
        amber: "#E31E24", // PRIMARY accent — vivid red (CTAs, positive deltas, active state)
        heat:  "#FF4D3D", // danger / negative — a second, distinguishable red
        cool:  "#C9C9C9", // "the other guy" accent (rival, opponent, next-vs-done) — light gray, not blue
        rare:  "#A78BFA", // unchanged — rare-tier development badge, deliberately an outlier accent
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        data: ['"Space Grotesk"', "ui-monospace", "monospace"],
      },
      borderRadius: { xs: "2px", sm: "3px" },
    },
  },
  plugins: [],
};
