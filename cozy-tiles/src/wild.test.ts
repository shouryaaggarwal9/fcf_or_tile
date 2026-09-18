import { describe, expect, it } from "vitest";
import { holdsTriple, planMove, TILE_KINDS, WILD_KIND } from "./game";
import type { GameState, Tile, TileKind } from "./game";
import { difficultyFor, generateLevel } from "./levels";
import { wand } from "./boosters";

function makeTile(id: string, kind: TileKind): Tile {
  return { id, kind, x: 0, y: 0, layer: 0, coveredBy: [] };
}

function state(board: Tile[], tray: Tile[]): GameState {
  return { board, tray, status: "playing" };
}

describe("rainbow matching", () => {
  it("finishes a pair of any kind", () => {
    const game = state(
      [makeTile("wild", "wild"), makeTile("berry-1", "berry")],
      [makeTile("sun-1", "sun"), makeTile("sun-2", "sun")],
    );

    const move = planMove(game, "wild")!;

    expect([...move.matchingIds].sort()).toEqual(["sun-1", "sun-2", "wild"]);
    expect(move.result.tray).toHaveLength(0);
    expect(move.result.board.map((tile) => tile.id)).toEqual(["berry-1"]);
  });

  it("finishes a lone symbol when two rainbows are held", () => {
    const game = state(
      [makeTile("wild-2", "wild"), makeTile("leaf-1", "leaf")],
      [makeTile("sun-1", "sun"), makeTile("wild-1", "wild")],
    );

    const move = planMove(game, "wild-2")!;

    expect([...move.matchingIds].sort()).toEqual(["sun-1", "wild-1", "wild-2"]);
    expect(move.result.tray).toHaveLength(0);
  });

  it("clears three rainbows as a plain triple", () => {
    const game = state([makeTile("wild-3", "wild")], [
      makeTile("wild-1", "wild"),
      makeTile("wild-2", "wild"),
    ]);

    const move = planMove(game, "wild-3")!;

    expect(move.matchingIds).toHaveLength(3);
    expect(move.result.status).toBe("won");
  });

  it("spends a rainbow on the pair with the most tiles still on the board", () => {
    const game = state(
      [
        makeTile("wild", "wild"),
        makeTile("leaf-a", "leaf"),
        makeTile("leaf-b", "leaf"),
        makeTile("leaf-c", "leaf"),
      ],
      [
        makeTile("sun-1", "sun"),
        makeTile("sun-2", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("leaf-2", "leaf"),
      ],
    );

    // Sun and leaf are both held as pairs, but only leaves still have work
    // ahead of them, so the rainbow is spent there.
    const move = planMove(game, "wild")!;

    expect([...move.matchingIds].sort()).toEqual(["leaf-1", "leaf-2", "wild"]);
  });

  it("holds a rainbow that has nothing to finish", () => {
    const game = state(
      [makeTile("wild", "wild")],
      [makeTile("sun-1", "sun"), makeTile("leaf-1", "leaf")],
    );

    const move = planMove(game, "wild")!;

    expect(move.matchingIds).toEqual([]);
    expect(move.result.tray).toHaveLength(3);
    expect(move.result.status).toBe("playing");
  });

  it("still loses when a rainbow fills the last slot", () => {
    const game = state(
      [makeTile("wild", "wild")],
      [
        makeTile("sun-1", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("drop-1", "drop"),
        makeTile("berry-1", "berry"),
        makeTile("moon-1", "moon"),
      ],
    );

    expect(planMove(game, "wild")!.result.status).toBe("lost");
  });

  it("chooses the same triple every time for the same board", () => {
    const build = () =>
      state(
        [makeTile("wild", "wild")],
        [
          makeTile("sun-1", "sun"),
          makeTile("sun-2", "sun"),
          makeTile("leaf-1", "leaf"),
          makeTile("leaf-2", "leaf"),
        ],
      );

    expect(planMove(build(), "wild")!.matchingIds).toEqual(
      planMove(build(), "wild")!.matchingIds,
    );
  });

  it("lets the wand finish a pair with a rainbow", () => {
    // Two suns held plus the rainbow standing alone genuinely complete the level,
    // so the wand is allowed to use it.
    const game = state([makeTile("wild", "wild")], [makeTile("sun-1", "sun"), makeTile("sun-2", "sun")]);

    const cleared = wand(game)!;

    expect(cleared.tray).toHaveLength(0);
    expect(cleared.board).toHaveLength(0);
    expect(cleared.status).toBe("won");
  });

  it("recognises every completable triple a tray could hold", () => {
    const tray = (...tiles: Array<Tile>) => tiles;

    expect(holdsTriple(tray(makeTile("a", "sun"), makeTile("b", "sun"), makeTile("c", "sun")))).toBe(true);
    expect(holdsTriple(tray(makeTile("a", "sun"), makeTile("b", "sun"), makeTile("c", "wild")))).toBe(true);
    expect(holdsTriple(tray(makeTile("a", "sun"), makeTile("b", "wild"), makeTile("c", "wild")))).toBe(true);
    expect(holdsTriple(tray(makeTile("a", "sun"), makeTile("b", "leaf"), makeTile("c", "wild")))).toBe(false);
    expect(holdsTriple(tray(makeTile("a", "sun"), makeTile("b", "sun"), makeTile("c", "leaf")))).toBe(false);
  });
});

describe("rainbow levels", () => {
  const wildTiles = (level: number) =>
    generateLevel(level).game.board.filter((tile) => tile.kind === WILD_KIND);

  it("schedules rainbows only on late levels", () => {
    expect(difficultyFor(1).wilds).toBe(0);
    expect(difficultyFor(12).wilds).toBe(0);
    expect(difficultyFor(15).wilds).toBe(0);
    expect(difficultyFor(16).wilds).toBe(1);
    expect(difficultyFor(20).wilds).toBe(1);
    expect(difficultyFor(60).wilds).toBe(2);
    expect(difficultyFor(64).wilds).toBe(2);

    expect(wildTiles(1)).toHaveLength(0);
    expect(wildTiles(16)).toHaveLength(3);
    expect(wildTiles(60)).toHaveLength(6);
    expect(wildTiles(64)).toHaveLength(6);
  });

  it("assigns rainbows in whole triples so the level stays clearable", () => {
    for (const level of [16, 20, 60, 64, 100, 128]) {
      const board = generateLevel(level).game.board;
      expect(wildTiles(level).length % 3).toBe(0);
      for (const kind of new Set(board.map((tile) => tile.kind))) {
        expect(board.filter((tile) => tile.kind === kind).length % 3).toBe(0);
      }
    }
  });

  it("never asks for more kinds than the palette holds", () => {
    expect(TILE_KINDS).toContain(WILD_KIND);
    for (let level = 31; level < 200; level++) {
      const board = generateLevel(level).game.board;
      const kinds = new Set(
        board.filter((tile) => tile.kind !== WILD_KIND).map((tile) => tile.kind),
      );
      expect(kinds.size).toBeLessThanOrEqual(difficultyFor(level).kinds);
    }
  });

  it("reaches every symbol in the palette at high difficulty", () => {
    const seen = new Set<TileKind>();
    for (let level = 31; level < 150; level++) {
      for (const tile of generateLevel(level).game.board) seen.add(tile.kind);
    }

    for (const kind of ["cloud", "bell", "honey", "acorn", WILD_KIND] as const) {
      expect(seen).toContain(kind);
    }
    expect(seen.size).toBe(TILE_KINDS.length);
  });
});
