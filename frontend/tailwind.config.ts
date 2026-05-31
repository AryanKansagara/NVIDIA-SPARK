import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens map onto the CSS variables defined in globals.css so every
        // utility switches automatically between dark and light themes.
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-frosted": "var(--surface-frosted)",

        line: "var(--border)",
        "line-faint": "var(--border-faint)",
        "line-focus": "var(--border-focus)",

        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",

        accent: "var(--accent)",
        "accent-tint": "var(--accent-tint)",
        "accent-subtle": "var(--accent-subtle)",
        "accent-light": "var(--accent-light)",

        green: "var(--green)",
        "green-tint": "var(--green-tint)",
        amber: "var(--amber)",
        "amber-tint": "var(--amber-tint)",
        red: "var(--red)",
        "red-tint": "var(--red-tint)",
      },
      fontFamily: {
        sans: ["var(--font)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        pill: "40px",
      },
      transitionTimingFunction: {
        mercury: "cubic-bezier(0, 0, 0.6, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(82,102,235,0.4)" },
          "70%": { boxShadow: "0 0 0 8px rgba(82,102,235,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(82,102,235,0)" },
        },
        typingBounce: {
          "0%,60%,100%": { transform: "translateY(0)" },
          "30%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.4s cubic-bezier(0,0,0.6,1) both",
        "pulse-ring": "pulse-ring 1.5s infinite",
        "typing-bounce": "typingBounce 1.2s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
