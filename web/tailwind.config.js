/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d181d",
        panel: "#15252b",
        line: "#30454b",
        acid: "#d5f477",
        acidDim: "#768d35",
      },
      fontFamily: {
        sans: ["Arial", "Helvetica Neue", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "Consolas", "monospace"],
      },
      animation: {
        "cursor-blink": "cursorBlink 1s step-end infinite",
        "terminal-pulse": "terminalPulse 1.6s ease-in-out infinite",
      },
      keyframes: {
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        terminalPulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
    },
  },
  plugins: [],
};
