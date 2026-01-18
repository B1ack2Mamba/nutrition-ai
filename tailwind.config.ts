import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e9f6ee",
          100: "#d7f0df",
          200: "#b0e1c0",
          300: "#86d19f",
          400: "#55bb77",
          500: "#2fa35a",
          600: "#1f7a3a",
          700: "#166534",
          800: "#125328",
          900: "#0f4322",
        },
        beige: {
          50: "#fbf7f0",
          100: "#f7f1e7",
          200: "#efe3d2",
          300: "#e6d9c7",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,.06)",
      },
    },
  },
  plugins: [],
};

export default config;
