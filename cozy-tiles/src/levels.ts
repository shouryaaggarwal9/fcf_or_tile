import { createGame, PALETTE, planMove, TILE_FACE, TRAY_CAPACITY } from "./game";
import type { GameState, Goal, MoveLimit, Tile } from "./game";

export const MAX_LEVEL = 1_000_000_000;
// Bumped whenever layout, shapes, symbol assignment, or objectives change:
// a saved board is only valid against the generator that produced it.
// Version 6 is the adult difficulty overhaul: deeper boards, wider shapes,
// key tiles (locks), and a generator-side tray-overflow safeguard.
export const GENERATOR_VERSION = 6;

// The adult curve: boards grow well past the old 48-tile ceiling, and the
// tier table carries its own lock budget (see buildPuzzle).
const DIFFICULTY = [
  { through: 3, kinds: 3, layers: 2, tiles: 12, locks: 0 },
  { through: 10, kinds: 5, layers: 3, tiles: 18, locks: 0 },
  { through: 20, kinds: 8, layers: 4, tiles: 36, locks: 0 },
  { through: 30, kinds: 12, layers: 5, tiles: 48, locks: 0 },
];

// Past level 30 a single "hardest" recipe would make every later level
// identical, so difficulty cycles through distinct shapes of challenge —
// now including the lock mechanic for genuine ordering decisions. The first
// four recipes rotate through levels 31–59, the deep four through 60–99, and
// from 100 on an "abyss" board (shape: tower) interrupts every level ≡ 7 (mod 10).
const LATE_RECIPES = [
  { tiles: 60, layers: 6, kinds: 14, locks: 1 },
  { tiles: 72, layers: 7, kinds: 16, locks: 2 },
  { tiles: 66, layers: 6, kinds: 15, locks: 1 },
  { tiles: 60, layers: 5, kinds: 14, locks: 0 },
  { tiles: 84, layers: 7, kinds: 18, locks: 2 },
  { tiles: 96, layers: 8, kinds: 20, locks: 3 },
  { tiles: 78, layers: 7, kinds: 17, locks: 2 },
  { tiles: 72, layers: 6, kinds: 16, locks: 2 },
];
const MID_RECIPES = LATE_RECIPES.slice(0, 4);
const DEEP_RECIPES = LATE_RECIPES.slice(4);
const ABYSS_RECIPE = { tiles: 120, layers: 8, kinds: 20, locks: 5 };

export type ShapeName =
  | "rectangle"
  | "diamond"
  | "arch"
  | "ring"
  | "cottage"
  | "heart"
  | "tower"
  | "hourglass"
  | "pyramid";

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

// Silhouettes stay within six columns so a 320px screen still renders faces
// of roughly 40px (tappable), and within seven rows so a tall stack still fits
// after clamping. The wider shapes add chokepoints for the deeper boards.
const SHAPES: Record<ShapeName, Shape> = {
  rectangle: { positions: grid(4, 3), center: { x: 1.5, y: 1 } },
  diamond: {
    // A tall diamond: 17 slots so even the densest recipes (12 per layer)
    // can fill it without reusing a same-layer position.
    positions: grid(3, 7).filter((p) => Math.abs(p.x - 1) + Math.abs(p.y - 3) <= 3),
    center: { x: 1, y: 3 },
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
  tower: {
    // A narrow deep core with wings only at the base: chokepoints by design.
    positions: [...rows(0, [0, 1, 2, 3, 4]), ...rows(1, [0, 1, 2, 3, 4]),
      ...rows(2, [1, 2, 3]), ...rows(3, [1, 2, 3]), ...rows(4, [1, 2, 3]),
      ...rows(5, [2]), ...rows(6, [2])],
    center: { x: 2, y: 2 },
  },
  hourglass: {
    // 6-3-6 row widths pinch at the middle rows.
    positions: [...rows(0, [0, 1, 2, 3, 4, 5]), ...rows(1, [1, 2, 3, 4]),
      ...rows(2, [2, 3]), ...rows(3, [2, 3]), ...rows(4, [1, 2, 3, 4]),
      ...rows(5, [0, 1, 2, 3, 4, 5])],
    center: { x: 2.5, y: 2.5 },
  },
  pyramid: {
    // A wide base narrowing to a two-tile peak.
    positions: [...rows(0, [0, 1, 2, 3, 4, 5]), ...rows(1, [1, 2, 3, 4]),
      ...rows(2, [2, 3])],
    center: { x: 2.5, y: 1 },
  },
};

// Level 31 keeps the original rectangle, then the silhouettes rotate —
// now including the chokepoint shapes the deep recipes were designed for.
const LATE_SHAPES: ShapeName[] = [
  "rectangle", "arch", "ring", "cottage", "heart", "diamond",
  "tower", "hourglass", "pyramid",
];

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
  const abyss = late && level % 10 === 7;
  const tier = late
    ? abyss
      ? ABYSS_RECIPE
      : level > 59
        ? DEEP_RECIPES[(level - 60) % DEEP_RECIPES.length]
        : MID_RECIPES[(level - 31) % MID_RECIPES.length]
    : DIFFICULTY.find((entry) => level <= entry.through)!;
  const gentle = level % 8 === 0;
  const shape: ShapeName = late
    ? abyss
      ? "tower"
      : LATE_SHAPES[(level - 31) % LATE_SHAPES.length]
    : level % 2 === 0
      ? "diamond"
      : "rectangle";

  return {
    tiles: gentle ? Math.round((tier.tiles * 0.6) / 3) * 3 : tier.tiles,
    layers: tier.layers,
    kinds: gentle ? Math.max(3, Math.floor(tier.kinds * 0.7)) : tier.kinds,
    locks: gentle ? 0 : tier.locks,
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
  /** How many key tiles guard a buried tile on this board. */
  locks: number;
  shape: ShapeName;
  gentle: boolean;
  objective: ObjectiveKind;
};

// The removal order: one legal position at a time, drawn from the seeded RNG.
function removalOrder(board: Tile[], random: () => number): string[] {
  const remaining = new Set(board.map((tile) => tile.id));
  const order: string[] = [];
  while (remaining.size) {
    const available = board.filter((tile) => remaining.has(tile.id) &&
      tile.coveredBy.every((id) => !remaining.has(id)));
    const tile = available[Math.floor(random() * available.length)];
    order.push(tile.id);
    remaining.delete(tile.id);
  }
  return order;
}

// Replays an order through the real engine: legal at every step, winning, and
// never letting the tray come within one slot of a loss.
function beatsTheTray(board: Tile[], order: string[]): boolean {
  let node: GameState = {
    board: board.map((tile) => ({ ...tile })), tray: [], status: "playing",
  };
  for (const id of order) {
    const move = planMove(node, id);
    if (!move) return false;
    if (move.arrival.tray.length > TRAY_CAPACITY - 1) return false;
    node = move.result;
  }
  return node.status === "won";
}

// Locks force real ordering decisions: a guarded tile stays unpickable until
// its key has been collected. Keys are chosen strictly before their target in
// the witness, which proves every lock opens in time and rules out cycles by
// construction. A lock is skipped rather than failed when no valid pair
// remains, so gentle and early boards simply carry none.
function placeLocks(board: Tile[], witness: string[], count: number, random: () => number) {
  const indexOf = new Map(witness.map((id, index) => [id, index]));
  const buried = board.filter((tile) => tile.coveredBy.length > 0);
  const used = new Set<string>();
  for (let placed = 0, attempt = 0; placed < count && attempt < count * 8; attempt++) {
    const target = buried[Math.floor(random() * buried.length)];
    if (!target || used.has(target.id)) continue;
    const targetIndex = indexOf.get(target.id)!;
    if (targetIndex < 1) continue;
    // Keys must be buried: a key sitting in the open trivializes its lock.
    const keys = board.filter((tile) =>
      tile.coveredBy.length > 0 && tile.id !== target.id && !used.has(tile.id) &&
      (indexOf.get(tile.id) ?? Number.POSITIVE_INFINITY) < targetIndex);
    if (!keys.length) continue;
    // Prefer a key beyond the tile's direct cover, so the lock adds a decision
    // instead of mirroring the coverage the tile already sits under.
    const preferred = keys.filter((tile) => !target.coveredBy.includes(tile.id));
    const pool = preferred.length ? preferred : keys;
    const key = pool[Math.floor(random() * pool.length)];
    target.lockedBy = [key.id];
    used.add(target.id);
    used.add(key.id);
    placed++;
  }
}

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
  // Consecutive triples receive one symbol, which normally keeps the tray at
  // three or fewer — but a dense board with a wide palette can in principle
  // outrun it, so every candidate order is replayed through the engine and kept
  // only when its peak tray occupancy stays one slot short of a loss. Wider
  // kind spreads are retried before the palette is narrowed; the board shape
  // itself is never abandoned.
  const palette = [...PALETTE];
  for (let index = palette.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [palette[index], palette[other]] = [palette[other], palette[index]];
  }
  let witness: string[] | null = null;
  for (let kinds = recipe.kinds; !witness && kinds >= 3; kinds--) {
    for (let attempt = 0; attempt < 12 && !witness; attempt++) {
      const order = removalOrder(board, random);
      order.forEach((id, index) => {
        const group = Math.floor(index / 3);
        board.find((tile) => tile.id === id)!.kind = palette[group % kinds];
      });
      if (beatsTheTray(board, order)) witness = order;
    }
  }
  if (!witness) throw new Error("Generated level is not solvable");
  const solution = witness;

  // Locks ride on the chosen witness: the verification below replays the full
  // solution through planMove, which refuses a locked tile picked before its key.
  placeLocks(board, solution, recipe.locks, random);

  const groups = Math.floor(board.length / 3);

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

  let limit: MoveLimit | undefined;
  if (recipe.objective === "moves") {
    const slack = Math.max(3, Math.round(solution.length * 0.1));
    limit = { limit: solution.length + slack, used: 0 };
  }

  const game: GameState = { board, tray: [], status: "playing",
    ...(goal ? { goal } : {}), ...(limit ? { limit } : {}) };
  let verified = game;
  for (const id of solution) {
    const move = planMove(verified, id);
    if (!move) throw new Error("Generated solution contains an illegal move");
    verified = move.result;
    if (verified.status === "won") break;
  }
  if (verified.status !== "won") throw new Error("Generated level is not solvable");
  return { game, solution };
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
// daily should feel like a treat, not the hardest level in the game — though
// the adult curve lifts them to real mid-tier sizes, and the week's rotation
// closes with one deep board.
const DAILY_RECIPES = [
  { tiles: 48, layers: 5, kinds: 12 },
  { tiles: 54, layers: 6, kinds: 13 },
  { tiles: 60, layers: 6, kinds: 14 },
  { tiles: 66, layers: 7, kinds: 15 },
  { tiles: 72, layers: 7, kinds: 16 },
];
const DEEP_DAILY = { tiles: 84, layers: 7, kinds: 18 };

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
  const deep = positiveMod(day, 7) === 6;
  const base = deep ? DEEP_DAILY : DAILY_RECIPES[positiveMod(day, DAILY_RECIPES.length)];
  return {
    ...base,
    locks: 0,
    shape: deep ? "tower" : DAILY_SHAPES[positiveMod(day, DAILY_SHAPES.length)],
    gentle: false,
    // Dailies stay plain: no goal, no clock.
    objective: "clear",
  };
}

export function generateDailyPuzzle(day: number): { game: GameState; solution: string[] } {
  return buildPuzzle(dailyRecipe(day), hashSeed(`cozy-daily-${day}`));
}
