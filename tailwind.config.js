/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#FF5959",
        background: "#121212",
        surface: "#1E1E1E",
        surfaceContainer: "#242424",
        surfaceContainerHigh: "#2A2A2A",
        surfaceContainerHighest: "#333333",
        subtext: "#A0A0A0",
        border: "#2C2C2C",
        error: "#FF4D4D",
      },
    },
  },
  plugins: [],
};
