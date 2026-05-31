import type { Config } from "tailwindcss";

// Prototype design system (meridian-prototype.html). Colors are driven by CSS
// custom properties defined in globals.css so a single `.light-mode` class on
// <html> flips the whole theme. Tailwind references those vars via `var(--x)`.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-frosted": "var(--surface-frosted)",
        border: "var(--border)",
        "border-faint": "var(--border-faint)",
        "border-focus": "var(--border-focus)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
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
      boxShadow: {
        panel: "0 16px 64px rgba(0, 0, 0, 0.3)",
        "panel-light": "0 16px 64px rgba(16, 33, 43, 0.12)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        pill: "40px",
      },
      fontFamily: {
        display: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "monospace"],
      },
      keyframes: {
        heroRise: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        chatSlideIn: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
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
          "0%, 60%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "30%": { transform: "translateY(-5px)", opacity: "1" },
        },
      },
      animation: {
        "hero-rise": "heroRise 0.7s cubic-bezier(0,0,.6,1) both",
        "chat-slide-in": "chatSlideIn 0.25s cubic-bezier(0,0,.6,1) both",
        "fade-in": "fadeIn 0.4s cubic-bezier(0,0,.6,1) both",
        "pulse-ring": "pulse-ring 1.5s infinite",
        "typing-bounce": "typingBounce 1.2s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
