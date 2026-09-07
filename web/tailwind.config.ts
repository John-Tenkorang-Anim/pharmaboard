import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["IBM Plex Sans", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        canvas: "#FFFFFF",
        surface: "#FFFFFF",
        ink: "#20252B",
        muted: "#5D6672",
        faint: "#6C7581",
        hairline: "#E4E7EB",
        divider: "#CED4DC",

        accent: {
          50: "#EFF5FF",
          100: "#DBEAFE",
          400: "#60A5FA",
          600: "#2463D4",
          700: "#1D4FA7",
          900: "#182336",
        },

        severity: {
          info: "#3B5A78",
          advisory: "#A6741B",
          urgent: "#B8511F",
          critical: "#9C1F28",
        },
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.5rem",
        lg: "0.625rem",
      },
      boxShadow: {
        overlay: "0 16px 40px -12px rgb(11 11 12 / 0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out both",
      },
      maxWidth: {
        app: "76rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
