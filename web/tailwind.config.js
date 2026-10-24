/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Independent audit bureau" palette. One paper, one ink, one accent.
        paper: "#f2efe7",
        sink: "#e8e3d5",
        ink: "#1b1812",
        "ink-2": "#2c2820",
        line: "#dcd6c6",
        "line-strong": "#bcb39e",
        mut: "#6b6354",
        stamp: "#b0342a", // reserved: criticality, failure, seals
        pass: "#3c6b4e", // reserved: verified verdicts only
        phosphor: "#8fe3a1", // reserved: the live log island ONLY
      },
      fontFamily: {
        sans: ["Archivo Variable", "Archivo", "Helvetica Neue", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"],
      },
      // Fluid type scale: one clamp per role, no breakpoint jumps.
      fontSize: {
        display: [
          "clamp(2.5rem, 1.55rem + 4.4vw, 4.25rem)",
          { lineHeight: "1.02", letterSpacing: "-0.03em" },
        ],
        title: [
          "clamp(2rem, 1.45rem + 2.4vw, 3rem)",
          { lineHeight: "1.08", letterSpacing: "-0.02em" },
        ],
        section: [
          "clamp(1.375rem, 1.2rem + 0.7vw, 1.75rem)",
          { lineHeight: "1.2", letterSpacing: "-0.01em" },
        ],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      animation: {
        "pulse-live": "pulseLive 1.6s ease-in-out infinite",
      },
      keyframes: {
        pulseLive: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
    },
  },
  plugins: [],
};
