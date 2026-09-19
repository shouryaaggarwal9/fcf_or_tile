import { createGame, PALETTE, planMove, TILE_FACE } from "./game";
import type { GameState, Goal, MoveLimit, Tile } from "./game";

export const MAX_LEVEL = 1_000_000_000;
// Bumped whenever layout, shapes, symbol assignment, or objectives change:
// a saved board is only valid against the generator that produced it.
// Version 5 removes rainbow and frosted tiles.
export const GENERATOR_VERSION = 5;

const DIFFICULTY = [
  { through: 3, kinds: 3, layers: 2, tiles: 12 },
  { through: 10, kinds: 6, layers: 3, tiles: 18 },
  { through: 30, kinds: 10, layers: 4, tiles: 30 },
];

// Past level 30 a single "hardest" recipe would make every later level
// identical, so difficulty cycles through distinct shapes of challenge.
const LATE_RECIPES = [
  { tiles: 48, layers: 6, kinds: 16 },
  { tiles: 45, layers: 5, kinds: 18 },
  { tiles: 42, layers: 6, kinds: 20 },
  { tiles: 39, layers: 5, kinds: 17 },
  { tiles: 36, layers: 4, kinds: 15 },
  { tiles: 48, layers: 5, kinds: 19 },
];

export type ShapeName =
  | "rectangle"
  | "diamond"
  | "arch"
  | "ring"
  | "cottage"
  | "heart";

type Shape = {
  positions: Array<{ x: number; y: number }>;
  center: { x: number; y: number };
};

function grid(width: number, height: number) {
  return Array.from({ length: width * height }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
  }));
}

const rows = (y: number, xs: number[]) => xs.map((x) => ({ x, y }));

// Every silhouette stays within four columns so a 320px screen keeps readable
// faces, and within five rows so a tall stack still fits after clamping.
const SHAPES: Record<ShapeName, Shape> = {
  rectangle: { positions: grid(4, 3), center: { x: 1.5, y: 1 } },
  diamond: {
    positions: grid(3, 5).filter((p) => Math.abs(p.x - 1) + Math.abs(p.y - 2) <= 2),
    center: { x: 1, y: 2 },
  },
  arch: {
    positions: [...rows(0, [0, 1, 2, 3]), ...rows(1, [0, 1, 2, 3]),
      ...rows(2, [0, 3]), ...rows(3, [0, 3]), ...rows(4, [0, 3])],
    center: { x: 1.5, y: 1.5 },
  },
  ring: {
    positions: grid(4, 4).filter((p) => p.x === 0 || p.x === 3 || p.y === 0 || p.y === 3),
    center: { x: 1.5, y: 1.5 },
  },
  cottage: {
    positions: [...grid(4, 3), ...rows(3, [1, 2])],
    center: { x: 1.5, y: 1 },
  },
  heart: {
    positions: [...rows(0, [1, 2]), ...rows(1, [0, 1, 2, 3]),
      ...rows(2, [0, 1, 2, 3]), ...rows(3, [1, 2])],
    center: { x: 1.5, y: 1.5 },
  },
};

// Level 31 keeps the original rectangle, then the silhouettes rotate.
const LATE_SHAPES: ShapeName[] = ["rectangle", "arch", "ring", "cottage", "heart", "diamond"];

export function isLevelNumber(level: unknown): level is number {
  return typeof level === "number" && Number.isSafeInteger(level) &&
    level >= 1 && level <= MAX_LEVEL;
}

// The level map pages levels in fixed chapters. Only chapters that contain an
// unlocked level are reachable, so a billion levels stay navigable.
export const CHAPTER_SIZE = 20;

export function chapterOf(level: number): number {
  if (!isLevelNumber(level)) throw new Error("Invalid level number");
  return Math.floor((level - 1) / CHAPTER_SIZE) + 1;
}

export function chapterLevels(chapter: number): number[] {
  if (!Number.isSafeInteger(chapter) || chapter < 1) {
    throw new Error("Invalid chapter number");
  }
  const first = (chapter - 1) * CHAPTER_SIZE + 1;
  if (first > MAX_LEVEL) return [];
  const last = Math.min(first + CHAPTER_SIZE - 1, MAX_LEVEL);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function difficultyFor(level: number) {
  if (!isLevelNumber(level)) throw new Error("Invalid level number");
  const late = level > 30;
  const tier = late
    ? LATE_RECIPES[(level - 31) % LATE_RECIPES.length]
    : DIFFICULTY.find((entry) => level <= entry.through)!;
  const gentle = level % 8 === 0;
  const shape: ShapeName = late
    ? LATE_SHAPES[(level - 31) % LATE_SHAPES.length]
    : level % 2 === 0
      ? "diamond"
      : "rectangle";

  return {
    ...tier,
    kinds: gentle ? Math.max(3, Math.floor(tier.kinds * 0.7)) : tier.kinds,
    gentle,
    shape,
    objective: objectiveFor(level),
  };
}

// Objectives begin after the first tier and never override a gentle level.
// Odd multiples of three become collect goals, multiples of five become
// pick-limited, and everything else is a plain clear.
export function objectiveFor(level: number): ObjectiveKind {
  if (level < 12 || level % 8 === 0) return "clear";
  if (level % 3 === 0 && level % 2 === 1) return "collect";
  if (level % 5 === 0) return "moves";
  return "clear";
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function covers(upper: Tile, lower: Tile): boolean {
  return upper.layer > lower.layer &&
    Math.abs(upper.x - lower.x) < TILE_FACE &&
    Math.abs(upper.y - lower.y) < TILE_FACE;
}

export type BoardBounds = { width: number; height: number };

export function boardBounds(board: Tile[]): BoardBounds {
  return {
    width: Math.max(...board.map((tile) => tile.x + TILE_FACE)),
    height: Math.max(...board.map((tile) => tile.y + TILE_FACE)),
  };
}

// Every recipe the generator understands: campaign tiers and daily puzzles both
// reduce to this shape, so the board builder has exactly one implementation.
/** How a level can be won: clear the board, collect a target, or beat the clock. */
export type ObjectiveKind = "clear" | "collect" | "moves";

export type Recipe = {
  tiles: number;
  layers: number;
  kinds: number;
  shape: ShapeName;
  gentle: boolean;
  objective: ObjectiveKind;
};

function buildPuzzle(recipe: Recipe, seed: number): { game: GameState; solution: string[] } {
  const random = seededRandom(seed);
  const shape = SHAPES[recipe.shape];
  const candidates = shape.positions.map((position) => ({ ...position }));
  // Fill from the center outward, retaining a compact, readable silhouette.
  candidates.sort((a, b) => {
    const distance = (p: { x: number; y: number }) =>
      Math.abs(p.x - shape.center.x) + Math.abs(p.y - shape.center.y);
    return distance(a) - distance(b) || a.y - b.y || a.x - b.x;
  });

  const board: Tile[] = [];
  for (let layer = 0; layer < recipe.layers; layer++) {
    const count = Math.floor(recipe.tiles / recipe.layers) +
      (layer < recipe.tiles % recipe.layers ? 1 : 0);
    for (let index = 0; index < count; index++) {
      const position = candidates[index];
      board.push({
        id: `l${layer}-${index}`, kind: "sun", layer,
        x: position.x + (layer % 2) * 0.5,
        y: position.y + (layer % 2) * 0.5,
        coveredBy: [],
      });
    }
  }
  const minX = Math.min(...board.map((tile) => tile.x));
  const minY = Math.min(...board.map((tile) => tile.y));
  for (const tile of board) {
    tile.x -= minX;
    tile.y -= minY;
  }
  for (const tile of board) {
    tile.coveredBy = board.filter((upper) => covers(upper, tile)).map((upper) => upper.id);
  }

  // Remove ONE legal position at a time, so narrow stacks cannot deadlock.
  // Consecutive triples receive one symbol; the witness uses at most 3 slots
  // on arrival and at most 2 after matching resolves.
  const remaining = new Set(board.map((tile) => tile.id));
  const solution: string[] = [];
  while (remaining.size) {
    const available = board.filter((tile) => remaining.has(tile.id) &&
      tile.coveredBy.every((id) => !remaining.has(id)));
    const tile = available[Math.floor(random() * available.length)];
    solution.push(tile.id);
    remaining.delete(tile.id);
  }
  const palette = [...PALETTE];
  for (let index = palette.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [palette[index], palette[other]] = [palette[other], palette[index]];
  }
  const groups = Math.floor(board.length / 3);
  solution.forEach((id, index) => {
    const group = Math.floor(index / 3);
    board.find((tile) => tile.id === id)!.kind = palette[group % recipe.kinds];
  });

  // A collect goal names one symbol to gather. Its first group is placed near
  // the middle of the witness, so the goal is a genuine shortcut — reachable
  // before the board clears, but never from the opening picks. The pick limit
  // leaves the witness room to recover.
  const kindAt = (index: number) =>
    board.find((tile) => tile.id === solution[index])!.kind;
  const firstIndexOf = (kind: (typeof PALETTE)[number]) => {
    for (let index = 0; index < solution.length; index++) {
      if (kindAt(index) === kind) return index;
    }
    return -1;
  };

  let goal: Goal | undefined;
  if (recipe.objective === "collect") {
    const middle = groups / 2;
    const target = PALETTE
      .filter((kind) => board.some((tile) => tile.kind === kind))
      .sort((a, b) =>
        Math.abs(firstIndexOf(a) - middle) - Math.abs(firstIndexOf(b) - middle) ||
        PALETTE.indexOf(a) - PALETTE.indexOf(b))[0];
    goal = { target, needed: board.filter((tile) => tile.kind === target).length, collected: 0 };
  }

  // The witness is the plain removal order: every pick collects its tile.
  const witness: string[] = [...solution];

  let limit: MoveLimit | undefined;
  if (recipe.objective === "moves") {
    const slack = Math.max(5, Math.round(witness.length * 0.25));
    limit = { limit: witness.length + slack, used: 0 };
  }

  const game: GameState = { board, tray: [], status: "playing",
    ...(goal ? { goal } : {}), ...(limit ? { limit } : {}) };
  let verified = game;
  for (const id of witness) {
    const move = planMove(verified, id);
    if (!move) throw new Error("Generated solution contains an illegal move");
    verified = move.result;
    if (verified.status === "won") break;
  }
  if (verified.status !== "won") throw new Error("Generated level is not solvable");
  return { game, solution: witness };
}

export function generateLevel(level: number): { game: GameState; solution: string[] } {
  if (!isLevelNumber(level)) throw new Error("Invalid level number");
  // Preserve the personally verified tutorial and its original tile identities.
  if (level === 1) {
    return {
      game: createGame(),
      solution: ["t0", "t1", "b0", "t2", "t3", "b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    };
  }
  return buildPuzzle(difficultyFor(level), level);
}

// Daily puzzles are generated from a calendar day, never from a level number, so
// every player gets the same board on the same day. Recipes stay moderate — a
// daily should feel like a treat, not the hardest level in the game.
const DAILY_RECIPES = [
  { tiles: 18, layers: 3, kinds: 6 },
  { tiles: 24, layers: 3, kinds: 8 },
  { tiles: 30, layers: 4, kinds: 10 },
  { tiles: 36, layers: 4, kinds: 12 },
  { tiles: 42, layers: 5, kinds: 14 },
];

const DAILY_SHAPES: ShapeName[] = ["rectangle", "diamond", "arch", "ring", "cottage", "heart"];

function positiveMod(value: number, length: number) {
  return ((value % length) + length) % length;
}

function hashSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function dailyRecipe(day: number): Recipe {
  if (!Number.isSafeInteger(day)) throw new Error("Invalid day number");
  const base = DAILY_RECIPES[positiveMod(day, DAILY_RECIPES.length)];
  return {
    ...base,
    shape: DAILY_SHAPES[positiveMod(day, DAILY_SHAPES.length)],
    gentle: false,
    // Dailies stay plain: no goal, no clock.
    objective: "clear",
  };
}

export function generateDailyPuzzle(day: number): { game: GameState; solution: string[] } {
  return buildPuzzle(dailyRecipe(day), hashSeed(`cozy-daily-${day}`));
}
