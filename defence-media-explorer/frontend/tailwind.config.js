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
        canvas: "#090D16",
        inset: "#0F172A",
        surface: "#0F172A",
        line: "#2E384D",
        institutional: "#004494",
        signal: "#1D4ED8",
        pine: "#F8FAFC",
        spring: "#004494",
        ok: "#10B981",
        warn: "#F59E0B",
        danger: "#EF4444",
      },
      borderRadius: {
        tactical: "8px",
      },
    },
  },
  plugins: [],
};
