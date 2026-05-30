import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#10212B",
        mist: "#EAF4F1",
        ember: "#E16B47",
        moss: "#2B6A57",
        brass: "#B99239",
        slate: "#5D7382",
        sand: "#F5EFE2",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(16, 33, 43, 0.14)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "meridian-radial":
          "radial-gradient(circle at top left, rgba(245, 239, 226, 0.94), rgba(234, 244, 241, 0.92) 38%, rgba(211, 228, 223, 0.84) 65%, rgba(182, 205, 197, 0.74) 100%)",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "\"Times New Roman\"", "serif"],
        body: ["\"Trebuchet MS\"", "\"Segoe UI\"", "sans-serif"],
      },
      keyframes: {
        drift: {
          "0%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(12px, -10px, 0)" },
          "100%": { transform: "translate3d(0, 0, 0)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        drift: "drift 12s ease-in-out infinite",
        rise: "rise 700ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
