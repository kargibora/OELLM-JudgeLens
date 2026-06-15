/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f17",
        panel: "#121826",
        edge: "#1f2937",
        accent: "#6366f1",
        good: "#34d399",
        bad: "#f87171",
      },
    },
  },
  plugins: [],
};
