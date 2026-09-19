import { describe, expect, it } from "vitest";
import { planMove, TILE_FACE, TILE_KINDS } from "./game";
import {
  boardBounds,
  chapterLevels,
  chapterOf,
  covers,
  difficultyFor,
  generateLevel,
  MAX_LEVEL,
} from "./levels";
import { EXTRA_SYMBOLS, LABELS } from "./symbols";

describe("generated levels", () => {
  it.each([...Array.from({ length: 200 }, (_, i) => i + 1), 999, 10000, MAX_LEVEL])(
    "level %i is deterministic, geometrically consistent and winnable",
    (level) => {
      const generated = generateLevel(level);
      expect(generateLevel(level)).toEqual(generated);
      let game = generated.game;
      const bounds = boardBounds(game.board);
      expect(new Set(game.board.map((tile) => tile.id)).size).toBe(game.board.length);
      expect(game.board.length % 3).toBe(0);
      // The adult curve reaches 120 tiles on the abyss boards.
      expect(game.board.length).toBeLessThanOrEqual(120);
      // A 320px screen with 40px horizontal padding still keeps faces tappable:
      // 40px for the six-column shapes, 48px where the silhouette stays narrow.
      const face = 280 * TILE_FACE / bounds.width;
      expect(face).toBeGreaterThanOrEqual(bounds.width > 4.5 ? 40 : 48);
      for (const tile of game.board) {
        expect(tile.coveredBy.slice().sort()).toEqual(
          game.board.filter((upper) => covers(upper, tile)).map((upper) => upper.id).sort(),
        );
        expect(tile.x + TILE_FACE).toBeLessThanOrEqual(bounds.width);
        expect(tile.y + TILE_FACE).toBeLessThanOrEqual(bounds.height);
        expect(game.board.filter((other) => other.kind === tile.kind).length % 3).toBe(0);
        expect(game.board.some((other) => other.id !== tile.id && other.layer === tile.layer &&
          Math.abs(other.x - tile.x) < TILE_FACE && Math.abs(other.y - tile.y) < TILE_FACE)).toBe(false);
        // Every key named by a lock exists, and no key is itself guarded.
        for (const key of tile.lockedBy ?? []) {
          expect(game.board.some((other) => other.id === key)).toBe(true);
          expect(game.board.find((other) => other.id === key)!.lockedBy).toBeUndefined();
        }
      }
      // Locked tiles hold at most one key in this design, and keys are buried.
      for (const key of new Set(game.board.flatMap((tile) => tile.lockedBy ?? []))) {
        const keyTile = game.board.find((tile) => tile.id === key)!;
        expect(keyTile.coveredBy.length).toBeGreaterThan(0);
      }
      for (const id of generated.solution) {
        if (game.status !== "playing") break;
        const move = planMove(game, id);
        expect(move).not.toBeNull();
        expect(move!.arrival.tray.length).toBeLessThanOrEqual(3);
        game = move!.result;
      }
      expect(game.status).toBe("won");
      // A collect goal can win with tiles still on the board; a plain clear
      // (with or without a pick limit) always empties it.
      if (!generated.game.goal) {
        expect(game.board).toHaveLength(0);
        expect(game.tray).toHaveLength(0);
      }
    },
  );

  it("keeps every kind count a multiple of three and orders locks before their targets", () => {
    for (const level of [31, 37, 60, 67, 97, 107, 5000, 999_999_997]) {
      const { game, solution } = generateLevel(level);
      for (const kind of TILE_KINDS) {
        const count = game.board.filter((tile) => tile.kind === kind).length;
        expect(count % 3).toBe(0);
      }
      const indexOf = new Map(solution.map((id, index) => [id, index]));
      for (const tile of game.board) {
        for (const key of tile.lockedBy ?? []) {
          expect(indexOf.get(key)!).toBeLessThan(indexOf.get(tile.id)!);
          expect(key).not.toBe(tile.id);
        }
      }
      // Locked tiles are never the first picks: the key must come off first.
      const firstTile = game.board.find((tile) => tile.id === solution[0])!;
      expect(firstTile.lockedBy).toBeUndefined();
    }
  });

  it("pages levels into chapters that never pass the last level", () => {
    expect(chapterOf(1)).toBe(1);
    expect(chapterOf(20)).toBe(1);
    expect(chapterOf(21)).toBe(2);
    expect(chapterLevels(1)).toEqual([...Array.from({ length: 20 }, (_, i) => i + 1)]);

    const final = chapterLevels(chapterOf(MAX_LEVEL));
    expect(final).toHaveLength(20);
    expect(final[final.length - 1]).toBe(MAX_LEVEL);

    expect(chapterLevels(20_000_000)).toHaveLength(20);
    expect(chapterLevels(chapterOf(MAX_LEVEL) + 1)).toEqual([]);
    expect(() => chapterOf(0)).toThrow();
    expect(() => chapterLevels(0)).toThrow();
  });

  it("rejects invalid level numbers", () => {
    for (const value of [0, -1, NaN, Infinity, 1.5, MAX_LEVEL + 1]) {
      expect(() => generateLevel(value)).toThrow();
    }
  });

  it("uses both shapes and eases every eighth level", () => {
    expect(difficultyFor(7).shape).toBe("rectangle");
    expect(difficultyFor(8).shape).toBe("diamond");
    expect(difficultyFor(8).kinds).toBeLessThan(difficultyFor(7).kinds);
    expect(difficultyFor(8).tiles).toBeLessThan(difficultyFor(7).tiles);
    expect(difficultyFor(8).locks).toBe(0);
  });

  it("grows the early curve toward the adult boards", () => {
    expect(difficultyFor(2).tiles).toBe(12);
    expect(difficultyFor(5).tiles).toBe(18);
    expect(difficultyFor(15).tiles).toBe(36);
    expect(difficultyFor(25).tiles).toBe(48);
    expect(difficultyFor(31).tiles).toBe(60);
    expect(difficultyFor(31).locks).toBe(1);
    expect(difficultyFor(31).shape).toBe("rectangle");
    expect(new Set(generateLevel(31).game.board.map((tile) => tile.kind)).size).toBe(14);
  });

  it("bands late levels into mid, deep, and abyss rotations", () => {
    expect(difficultyFor(45).tiles).toBe(66);
    expect(difficultyFor(59).tiles).toBe(60);
    expect(difficultyFor(60).tiles).toBe(84);
    expect(difficultyFor(60).locks).toBe(2);
    expect(difficultyFor(61).tiles).toBe(96);
    expect(difficultyFor(61).locks).toBe(3);
    expect(difficultyFor(77).tiles).toBe(120);
    expect(difficultyFor(77).shape).toBe("tower");
    expect(difficultyFor(77).locks).toBe(5);
    expect(difficultyFor(96).tiles).toBe(84);
    expect(difficultyFor(97).tiles).toBe(120);
    expect(difficultyFor(97).shape).toBe("tower");
    expect(difficultyFor(107).tiles).toBe(120);
    for (const level of [38, 48, 58, 68, 78, 88, 98, 108]) {
      if (level % 10 !== 7) {
        expect(difficultyFor(level).tiles).not.toBe(120);
        expect(difficultyFor(level).shape).not.toBe("tower");
      }
    }
  });

  it("varies late levels instead of repeating one hardest recipe", () => {
    const signature = (level: number) => {
      const d = difficultyFor(level);
      return `${d.shape}/${d.tiles}/${d.layers}/${d.kinds}`;
    };

    // Level 31 keeps the original rectangle silhouette.
    expect(signature(31)).toBe("rectangle/60/6/14");

    const late = Array.from({ length: 12 }, (_, i) => signature(32 + i));
    expect(new Set(late).size).toBeGreaterThanOrEqual(6);
    expect(signature(32)).not.toBe(signature(33));
  });

  it("rotates every silhouette across late levels", () => {
    const shapes = new Set<string>();
    for (let level = 31; level < 131; level++) shapes.add(difficultyFor(level).shape);

    for (const name of [
      "rectangle", "diamond", "arch", "ring", "cottage", "heart",
      "tower", "hourglass", "pyramid",
    ]) {
      expect(shapes).toContain(name);
    }
  });

  it("keeps every late recipe inside the six-column readability budget", () => {
    for (const name of ["tower", "hourglass", "pyramid", "diamond"] as const) {
      const level = [31, 32, 33, 34, 35, 36, 37, 38, 39].find(
        (candidate) => difficultyFor(candidate).shape === name,
      )!;
      const bounds = boardBounds(generateLevel(level).game.board);
      expect(280 * TILE_FACE / bounds.width).toBeGreaterThanOrEqual(40);
      expect(bounds.width).toBeLessThanOrEqual(6.5);
    }
  });

  it("does not block touching edges or side neighbors", () => {
    const lower = generateLevel(1).game.board[0];
    expect(covers({ ...lower, layer: 1, x: lower.x + TILE_FACE }, lower)).toBe(false);
    expect(covers({ ...lower, layer: 1, x: lower.x + TILE_FACE - 0.01 }, lower)).toBe(true);
    expect(covers({ ...lower, x: lower.x + 0.1 }, lower)).toBe(false);
  });

  it("provides labels and artwork for all twenty symbols", () => {
    expect(TILE_KINDS).toHaveLength(20);
    for (const kind of TILE_KINDS) {
      expect(LABELS[kind]).toBeTruthy();
      if (!["sun", "leaf", "drop", "berry"].includes(kind)) {
        expect(EXTRA_SYMBOLS[kind]?.path).toBeTruthy();
      }
    }
  });
});
