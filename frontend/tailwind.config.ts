import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-geist-mono)", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Forest Green Palette
        forest: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          850: "#114c27",
          900: "#14532d",
          950: "#052e16",
        },
        // Warm Cream & Ivory Accents
        cream: {
          50: "#fdfcf9",
          100: "#faf6ee",
          200: "#f4edde",
          300: "#ebdcc5",
          400: "#dfc7a6",
          500: "#cca87c",
          600: "#b58e60",
          700: "#96714a",
          800: "#7a5c3e",
          900: "#644c35",
          950: "#38291b",
        },
        // Neutral Obsidian Dark Surfaces
        obsidian: {
          950: "#080b09",
          900: "#0d110f",
          850: "#121714",
          800: "#18201b",
          750: "#1e2822",
          700: "#27342c",
          600: "#38493f",
          500: "#506558",
          400: "#728a7c",
          300: "#9db3a6",
          200: "#cad7d0",
          100: "#e6ede9",
          50: "#f3f7f5",
        },
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        card: "0 4px 20px -2px rgba(4, 18, 10, 0.35)",
        glow: "0 0 25px -5px rgba(34, 197, 94, 0.15)",
        "glow-cream": "0 0 25px -5px rgba(244, 237, 222, 0.12)",
      },
      borderColor: {
        subtle: "rgba(39, 52, 44, 0.7)",
      },
    },
  },
  plugins: [],
};
export default config;
