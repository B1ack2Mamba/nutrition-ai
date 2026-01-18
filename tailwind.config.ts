import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind types (v4) expect either "class" or ["class", selector].
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Soft medical-teal palette that sits nicely on beige backgrounds
          50: "#e6fbf7",
          100: "#c9f6ee",
          200: "#9feee0",
          300: "#6ee2cf",
          400: "#3ccfb7",
          500: "#18b89f",
          600: "#0f8f7c",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
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
