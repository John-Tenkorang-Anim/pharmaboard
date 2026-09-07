import type { Config } from "tailwindcss";

// PharmaBoard — a professional, industry-shaped system: a plain light
// canvas, one confident accent colour that actually carries the product's
// interactive identity (not just a verification checkmark), a horizontal
// top nav, and plain divided list rows instead of stacked, individually
// bordered/accent-barred cards. Two things were tried and walked back:
// a full black-chrome, vertical-icon-rail clone of a specific reference
// product (too literal, too monochrome), and a list pattern where every
// row was its own rounded card with a coloured left bar (reads as boxes,
// not as the dense tables real dashboards use).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        // Tailwind ships a default `font-serif` (Georgia/Times) even though
        // this only extends the theme — override it explicitly to the sans
        // stack so a stray `font-serif` class (a leftover from an earlier
        // design pass) fails visibly-as-sans, not silently as a real serif.
        serif: ["IBM Plex Sans", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        // A soft, faintly green-tinted off-white — not a neutral gray, and
        // not the black-dominant chrome of the previous pass.
        canvas: "#F6F9F7",
        surface: "#FFFFFF",
        ink: "#151A17",
        muted: "#5C655F",
        faint: "#8B958E",
        hairline: "#DEE6E1",
        divider: "#C7D1CA",

        // The accent now carries the product's actual interactive identity
        // — primary buttons, active nav, links, verification — not just a
        // small checkmark against black chrome.
        accent: {
          50: "#EAF5EE",
          100: "#D2ECDC",
          400: "#3F9464",
          600: "#1F7A46",
          700: "#166238",
          900: "#0E2A1B",
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
