export const palettes = {
  iris: {
    name: "Iris",
    description: "Violet, rose & electric blue",
    accent: "109 60 220",
    dark: "83 38 177",
    soft: "245 240 255",
  },
  ocean: {
    name: "Ocean",
    description: "Cobalt, sky & warm coral",
    accent: "37 99 210",
    dark: "25 72 166",
    soft: "236 245 255",
  },
  sunset: {
    name: "Sunset",
    description: "Berry, peach & violet",
    accent: "185 49 101",
    dark: "147 29 75",
    soft: "255 239 246",
  },
} as const;
export const fonts = {
  modern: {
    name: "Modern",
    family: '"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif',
    description: "Clean and familiar",
  },
  rounded: {
    name: "Rounded",
    family: '"Avenir Next", "Trebuchet MS", sans-serif',
    description: "Friendly and expressive",
  },
  editorial: {
    name: "Editorial",
    family: 'Georgia, "Times New Roman", serif',
    description: "A thoughtful reading feel",
  },
} as const;
export type Appearance = {
  palette: keyof typeof palettes;
  font: keyof typeof fonts;
  size: "standard" | "comfortable";
};
export const defaultAppearance: Appearance = { palette: "iris", font: "modern", size: "standard" };
export function readAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem("pharmaboard.appearance") || "null");
    return {
      palette: Object.hasOwn(palettes, saved?.palette) ? saved.palette : "iris",
      font: Object.hasOwn(fonts, saved?.font) ? saved.font : "modern",
      size: saved?.size === "comfortable" ? "comfortable" : "standard",
    };
  } catch {
    return defaultAppearance;
  }
}
export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  const palette = palettes[value.palette];
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-dark", palette.dark);
  root.style.setProperty("--accent-soft", palette.soft);
  root.style.setProperty("--app-font", fonts[value.font].family);
  root.style.fontSize = value.size === "comfortable" ? "18px" : "16px";
  root.dataset.palette = value.palette;
}
