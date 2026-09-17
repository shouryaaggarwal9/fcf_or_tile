import { createGame, planMove, TILE_FACE, TILE_KINDS } from "./game";
import type { GameState, Tile } from "./game";

export const MAX_LEVEL = 1_000_000_000;
export const GENERATOR_VERSION = 1;

const DIFFICULTY = [
  { through: 3, kinds: 3, layers: 2, tiles: 12 },
  { through: 10, kinds: 6, layers: 3, tiles: 18 },
  { through: 30, kinds: 10, layers: 4, tiles: 30 },
  { through: MAX_LEVEL, kinds: 16, layers: 6, tiles: 48 },
];

export function isLevelNumber(level: unknown): level is number {
  return typeof level === "number" && Number.isSafeInteger(level) &&
    level >= 1 && level <= MAX_LEVEL;
}

export function difficultyFor(level: number) {
  if (!isLevelNumber(level)) throw new Error("Invalid level number");
  const tier = DIFFICULTY.find((entry) => level <= entry.through)!;
  const gentle = level % 8 === 0;
  return {
    ...tier,
    kinds: gentle ? Math.max(3, Math.floor(tier.kinds * 0.7)) : tier.kinds,
    gentle,
    shape: level % 2 === 0 ? "diamond" as const : "rectangle" as const,
  };
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

export function boardBounds(board: Tile[]) {
  return {
    width: Math.max(...board.map((tile) => tile.x + TILE_FACE)),
    height: Math.max(...board.map((tile) => tile.y + TILE_FACE)),
  };
}

export function generateLevel(level: number): { game: GameState; solution: string[] } {
  const difficulty = difficultyFor(level);
  // Preserve the personally verified tutorial and its original tile identities.
  if (level === 1) {
    return {
      game: createGame(),
      solution: ["t0", "t1", "b0", "t2", "t3", "b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    };
  }

  const random = seededRandom(level);
  const candidates: Array<{ x: number; y: number }> = [];
  const diamond = difficulty.shape === "diamond";
  for (let y = 0; y < (diamond ? 5 : 3); y++) {
    for (let x = 0; x < (diamond ? 3 : 4); x++) {
      if (!diamond || Math.abs(x - 1) + Math.abs(y - 2) <= 2) {
        candidates.push({ x, y });
      }
    }
  }
  // Fill from the center outward, retaining a compact, readable silhouette.
  candidates.sort((a, b) => {
    const distance = (p: { x: number; y: number }) =>
      Math.abs(p.x - (diamond ? 1 : 1.5)) + Math.abs(p.y - (diamond ? 2 : 1));
    return distance(a) - distance(b) || a.y - b.y || a.x - b.x;
  });

  const board: Tile[] = [];
  for (let layer = 0; layer < difficulty.layers; layer++) {
    const count = Math.floor(difficulty.tiles / difficulty.layers) +
      (layer < difficulty.tiles % difficulty.layers ? 1 : 0);
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
  const palette = [...TILE_KINDS];
  for (let index = palette.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [palette[index], palette[other]] = [palette[other], palette[index]];
  }
  solution.forEach((id, index) => {
    board.find((tile) => tile.id === id)!.kind = palette[Math.floor(index / 3) % difficulty.kinds];
  });
  const game: GameState = { board, tray: [], status: "playing" };
  let verified = game;
  for (const id of solution) {
    const move = planMove(verified, id);
    if (!move) throw new Error("Generated solution contains an illegal move");
    verified = move.result;
  }
  if (verified.status !== "won") throw new Error("Generated level is not solvable");
  return { game, solution };
}
