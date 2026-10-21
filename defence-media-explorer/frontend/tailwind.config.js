/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Roboto Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "#0F172A",
        inset: "#1E293B",
        surface: "#334155",
        line: "#475569",
        institutional: "#004494",
        signal: "#1D4ED8",
        pine: "#F8FAFC",
        spring: "#004494",
        ok: "#10B981",
        warn: "#F59E0B",
        danger: "#EF4444",
      },
      borderRadius: {
        tactical: "2px",
      },
    },
  },
  plugins: [],
};
