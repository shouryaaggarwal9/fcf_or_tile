// Chapters are named rather than numbered alone: "Meadow" reads like progress
// where "Levels 41-60" reads like arithmetic. Names cycle with a numeral so
// they stay unique across a billion levels.
const NAMES = [
  "Meadow", "Orchard", "Cottage", "Brook", "Lantern", "Pillow",
  "Teapot", "Kitten", "Firefly", "Quilt", "Garden", "Hearth",
] as const;

export function chapterName(chapter: number): string {
  if (!Number.isSafeInteger(chapter) || chapter < 1) {
    throw new Error("Invalid chapter number");
  }
  const cycle = Math.floor((chapter - 1) / NAMES.length);
  const name = NAMES[(chapter - 1) % NAMES.length];
  return cycle === 0 ? name : `${name} ${cycle + 1}`;
}
