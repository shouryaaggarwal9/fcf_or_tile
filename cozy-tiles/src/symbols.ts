import type { TileKind } from "./game";

export const LABELS: Record<TileKind, string> = {
  sun: "Sun", leaf: "Leaf", drop: "Water drop", berry: "Berries",
  moon: "Moon", star: "Star", heart: "Heart", flower: "Flower",
  apple: "Apple", orange: "Orange", cherry: "Cherries", mushroom: "Mushroom",
  fish: "Fish", butterfly: "Butterfly", gem: "Gem", cup: "Teacup",
  cloud: "Cloud", bell: "Bell", honey: "Honey", acorn: "Acorn",
  wild: "Rainbow",
};

// Original SVG silhouettes, not platform-dependent emoji. Circles are written
// as two 180 degree arcs so every shape stays a single predictable path.
export const EXTRA_SYMBOLS: Partial<Record<TileKind, { color: string; path: string }>> = {
  moon: { color: "#eec66a", path: "M42 9A24 24 0 1 0 54 44 23 23 0 0 1 42 9Z" },
  star: { color: "#f9bd39", path: "m32 6 8 17 19 3-14 14 3 19-16-9-16 9 3-19L5 26l19-3Z" },
  heart: { color: "#ee6b84", path: "M32 55 9 32C-3 13 20 2 32 19 44 2 67 13 55 32Z" },
  flower: { color: "#c68de3", path: "M25 22C8 1 1 30 20 32 0 45 24 62 30 42 37 65 59 47 43 35 65 29 48 6 36 24 40 1 18 2 25 22ZM27 30h10v10H27Z" },
  apple: { color: "#ed6551", path: "M32 21C6 7 4 44 22 56l10-3 10 3C60 44 58 7 32 21ZM32 21V8m0 8Q43 1 49 7 43 18 32 16" },
  orange: { color: "#f5a23d", path: "M53 36a21 21 0 1 1-42 0 21 21 0 0 1 42 0ZM32 15Q34 3 48 7 44 18 32 15M21 27l-3 7" },
  cherry: { color: "#d94a62", path: "M29 44a11 11 0 1 1-22 0 11 11 0 0 1 22 0Zm27 0a11 11 0 1 1-22 0 11 11 0 0 1 22 0ZM18 33 33 7l12 26M33 7Q50 2 52 14 41 20 33 7" },
  mushroom: { color: "#e8815b", path: "M24 34h16l4 22H20ZM6 34C6 0 58 0 58 34ZM19 24h1m12-8h1m10 10h1" },
  fish: { color: "#54bbd3", path: "M45 22 59 12v40L45 42C25 63 4 38 5 32 4 26 25 1 45 22ZM18 27h1M30 22l7 10-7 10" },
  butterfly: { color: "#b79be8", path: "M30 31C4-12-5 40 23 37-4 60 34 65 30 34ZM34 31C60-12 69 40 41 37 68 60 30 65 34 34ZM32 18v35m0-35-7-9m7 9 7-9" },
  gem: { color: "#63c8b5", path: "M16 10h32l12 17-28 31L4 27ZM4 27h56M16 10l6 17 10 31 10-31 6-17M22 27l10-17 10 17" },
  cup: { color: "#87b8e2", path: "M10 23h35v17Q45 54 28 54 10 54 10 40ZM45 26h9Q64 40 45 43M7 57h44M20 16V6m13 10V6" },

  // A cloud reads as a cloud even when its circles overlap: filled the same
  // colour, the union has no visible seams.
  cloud: { color: "#9dc4e8", path: "M13 34a11 11 0 1 0 22 0a11 11 0 1 0-22 0ZM26 30a14 14 0 1 0 28 0a14 14 0 1 0-28 0ZM41 36a9 9 0 1 0 18 0a9 9 0 1 0-18 0Z" },
  bell: { color: "#d8a45c", path: "M22 13h20l7 23H15ZM13 38h38v4H13ZM27 46a5 5 0 1 0 10 0a5 5 0 1 0-10 0Z" },
  // The inner cell shows as a stroked outline, which the tile renderer draws.
  honey: { color: "#f0b93d", path: "M32 9 48 18v22l-16 9-16-9V18ZM32 19 40 24v12l-8 5-8-5V24Z" },
  acorn: { color: "#c9884f", path: "M16 25 32 12 48 25ZM19 37a13 13 0 1 0 26 0a13 13 0 1 0-26 0Z" },
  // Rainbow: the flexible symbol, drawn as a four point sparkle.
  wild: { color: "#e58ad6", path: "M32 5 38 25 58 32 38 39 32 59 26 39 6 32 26 25Z" },
};
