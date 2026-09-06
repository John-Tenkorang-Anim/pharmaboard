import type { Config } from "tailwindcss";

// Editorial / institutional design system. The governing idea: a notice is a
// *published document* from an authority, not a row in a SaaS table. So the
// vocabulary is print — ink on warm paper, hairline rules, a real type scale,
// generous measure — and severity is carried by typographic weight and rule
// thickness rather than by decorative colored pills.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Newsreader", "Georgia", "Times New Roman", "serif"],
        sans: ["IBM Plex Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Warm paper, not the blue-grey of every admin template.
        paper: {
          DEFAULT: "#FAF8F3",
          raised: "#FFFFFF",
          sunken: "#F2EFE7",
        },
        ink: {
          DEFAULT: "#17150F",
          muted: "#5C574D",
          faint: "#8C8578",
        },
        rule: {
          DEFAULT: "#DDD8CC",
          strong: "#17150F",
        },
        // Ink-adjacent, print-like. Used for the severity kicker only — never
        // as a filled pastel background.
        signal: {
          info: "#2C4A5C",
          advisory: "#6B5A1E",
          urgent: "#A6521C",
          critical: "#8A1C1C",
        },
      },
      fontSize: {
        kicker: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.14em" }],
        label: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.1em" }],
        meta: ["0.75rem", { lineHeight: "1.5" }],
        "display-sm": ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "display-md": ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "display-lg": ["2.625rem", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
        "display-xl": ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
      },
      maxWidth: {
        measure: "34rem",
        prose: "42rem",
      },
      borderRadius: {
        none: "0",
        sm: "2px",
      },
      boxShadow: {
        // Print doesn't float. Kept minimal and only for true overlays.
        overlay: "0 24px 64px -16px rgb(23 21 15 / 0.28)",
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "rise": "rise 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
