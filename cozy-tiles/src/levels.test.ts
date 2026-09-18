import { describe, expect, it } from "vitest";
import { planMove, TILE_FACE, TILE_KINDS } from "./game";
import { boardBounds, chapterLevels, chapterOf, covers, difficultyFor, generateLevel, MAX_LEVEL } from "./levels";
import { EXTRA_SYMBOLS, LABELS } from "./symbols";

describe("generated levels", () => {
  it.each([...Array.from({ length: 200 }, (_, i) => i + 1), 999, 10000, MAX_LEVEL])(
    "level %i is deterministic, geometrically consistent and winnable", (level) => {
      const generated = generateLevel(level);
      expect(generateLevel(level)).toEqual(generated);
      let game = generated.game;
      const bounds = boardBounds(game.board);
      expect(new Set(game.board.map((tile) => tile.id)).size).toBe(game.board.length);
      expect(game.board.length % 3).toBe(0);
      expect(game.board.length).toBeLessThanOrEqual(48);
      // A 320px screen with 40px horizontal padding still has readable faces.
      expect(280 * TILE_FACE / bounds.width).toBeGreaterThanOrEqual(48);
      for (const tile of game.board) {
        expect(tile.coveredBy.slice().sort()).toEqual(
          game.board.filter((upper) => covers(upper, tile)).map((upper) => upper.id).sort(),
        );
        expect(tile.x + TILE_FACE).toBeLessThanOrEqual(bounds.width);
        expect(tile.y + TILE_FACE).toBeLessThanOrEqual(bounds.height);
        expect(game.board.filter((other) => other.kind === tile.kind).length % 3).toBe(0);
        expect(game.board.some((other) => other.id !== tile.id && other.layer === tile.layer &&
          Math.abs(other.x - tile.x) < TILE_FACE && Math.abs(other.y - tile.y) < TILE_FACE)).toBe(false);
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
    expect(difficultyFor(31).tiles).toBe(48);
    expect(difficultyFor(31).layers).toBe(6);
    expect(new Set(generateLevel(31).game.board.map((tile) => tile.kind)).size).toBe(16);
  });

  it("varies late levels instead of repeating one hardest recipe", () => {
    const signature = (level: number) => {
      const d = difficultyFor(level);
      return `${d.shape}/${d.tiles}/${d.layers}/${d.kinds}`;
    };

    // Level 31 stays the original hardest rectangle.
    expect(signature(31)).toBe("rectangle/48/6/16");

    const late = Array.from({ length: 12 }, (_, i) => signature(32 + i));
    expect(new Set(late).size).toBeGreaterThanOrEqual(6);
    expect(signature(32)).not.toBe(signature(33));
  });

  it("rotates every silhouette across late levels", () => {
    const shapes = new Set<string>();
    for (let level = 31; level < 91; level++) shapes.add(difficultyFor(level).shape);

    for (const name of ["rectangle", "diamond", "arch", "ring", "cottage", "heart"]) {
      expect(shapes).toContain(name);
    }
  });

  it("does not block touching edges or side neighbors", () => {
    const lower = generateLevel(1).game.board[0];
    expect(covers({ ...lower, layer: 1, x: lower.x + TILE_FACE }, lower)).toBe(false);
    expect(covers({ ...lower, layer: 1, x: lower.x + TILE_FACE - 0.01 }, lower)).toBe(true);
    expect(covers({ ...lower, x: lower.x + 0.1 }, lower)).toBe(false);
  });

  it("provides labels and artwork for all sixteen symbols", () => {
    for (const kind of TILE_KINDS) {
      expect(LABELS[kind]).toBeTruthy();
      if (!["sun", "leaf", "drop", "berry"].includes(kind)) {
        expect(EXTRA_SYMBOLS[kind]?.path).toBeTruthy();
      }
    }
  });
});
