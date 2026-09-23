import { describe, expect, it } from "vitest";
import { createGame, isSelectable, planMove } from "./game";
import type { GameState, Tile, TileKind } from "./game";

function makeTile(id: string, kind: TileKind, coveredBy: string[] = []): Tile {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    layer: 0,
    coveredBy,
  };
}

function lockTile(tile: Tile, lockedBy: string[]): Tile {
  return { ...tile, lockedBy };
}

describe("tile matching rules", () => {
  it("blocks covered tiles and allows top tiles", () => {
    const game = createGame();

    expect(isSelectable(game, "b0")).toBe(false);
    expect(isSelectable(game, "t0")).toBe(true);
  });

  it("reveals tiles after their covering tile is removed", () => {
    const move = planMove(createGame(), "t0");

    expect(move).not.toBeNull();
    expect(isSelectable(move!.result, "b0")).toBe(true);
    expect(isSelectable(move!.result, "b1")).toBe(true);
  });

  it("blocks a locked tile until its key leaves the board, even when uncovered", () => {
    const game: GameState = {
      board: [
        lockTile(makeTile("guarded", "drop"), ["key"]),
        makeTile("key", "sun"),
        makeTile("other", "leaf"),
      ],
      tray: [],
      status: "playing",
    };

    // Uncovered but locked: still not pickable.
    expect(isSelectable(game, "guarded")).toBe(false);
    const move = planMove(game, "key");
    expect(move).not.toBeNull();
    expect(isSelectable(move!.result, "guarded")).toBe(true);
  });

  it("requires every key of a multi-locked tile to be collected", () => {
    const game: GameState = {
      board: [
        lockTile(makeTile("guarded", "drop"), ["key-a", "key-b"]),
        makeTile("key-a", "sun"),
        makeTile("key-b", "leaf"),
      ],
      tray: [],
      status: "playing",
    };

    const first = planMove(game, "key-a")!.result;
    expect(isSelectable(first, "guarded")).toBe(false);
    const second = planMove(first, "key-b")!.result;
    expect(isSelectable(second, "guarded")).toBe(true);
  });

  it("keeps a locked tile covered-blocked after its key is collected", () => {
    const game: GameState = {
      board: [
        lockTile(makeTile("guarded", "drop", ["cover"]), ["key"]),
        makeTile("cover", "moon"),
        makeTile("key", "sun"),
      ],
      tray: [],
      status: "playing",
    };

    const unlocked = planMove(game, "key")!.result;
    expect(isSelectable(unlocked, "guarded")).toBe(false); // still covered
  });

  it("requires every covering tile to be removed", () => {
    const game: GameState = {
      board: [
        makeTile("bottom", "drop", ["cover-a", "cover-b"]),
        makeTile("cover-a", "sun"),
        makeTile("cover-b", "leaf"),
      ],
      tray: [],
      status: "playing",
    };

    const first = planMove(game, "cover-a")!.result;
    expect(isSelectable(first, "bottom")).toBe(false);

    const second = planMove(first, "cover-b")!.result;
    expect(isSelectable(second, "bottom")).toBe(true);
  });

  it("clears a triple before checking the sixth-slot loss", () => {
    const game: GameState = {
      board: [makeTile("sun-3", "sun"), makeTile("remaining", "berry")],
      tray: [
        makeTile("sun-1", "sun"),
        makeTile("sun-2", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("drop-1", "drop"),
        makeTile("berry-1", "berry"),
      ],
      status: "playing",
    };

    const move = planMove(game, "sun-3")!;

    expect(move.arrival.tray).toHaveLength(6);
    expect(move.matchingIds).toHaveLength(3);
    expect(move.result.tray).toHaveLength(3);
    expect(move.result.status).toBe("playing");
  });

  it("loses when all six slots fill without a triple", () => {
    const game: GameState = {
      board: [makeTile("berry-2", "berry")],
      tray: [
        makeTile("sun-1", "sun"),
        makeTile("sun-2", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("leaf-2", "leaf"),
        makeTile("berry-1", "berry"),
      ],
      status: "playing",
    };

    expect(planMove(game, "berry-2")!.result.status).toBe("lost");
  });

  it("clears a triple landing in the seventh slot before any loss check", () => {
    const game: GameState = {
      board: [makeTile("sun-3", "sun"), makeTile("berry-2", "berry")],
      tray: [
        makeTile("sun-1", "sun"),
        makeTile("sun-2", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("leaf-2", "leaf"),
        makeTile("drop-1", "drop"),
        makeTile("berry-1", "berry"),
      ],
      status: "playing",
      capacity: 7,
    };

    const move = planMove(game, "sun-3")!;

    expect(move.arrival.tray).toHaveLength(7);
    expect(move.result.tray.map((tile) => tile.id)).toEqual([
      "leaf-1",
      "leaf-2",
      "drop-1",
      "berry-1",
    ]);
    expect(move.result.status).toBe("playing");
  });

  it("loses when the seventh slot fills without a triple", () => {
    const game: GameState = {
      board: [makeTile("moon-1", "moon")],
      tray: [
        makeTile("sun-1", "sun"),
        makeTile("leaf-1", "leaf"),
        makeTile("drop-1", "drop"),
        makeTile("berry-1", "berry"),
        makeTile("star-1", "star"),
        makeTile("heart-1", "heart"),
      ],
      status: "playing",
      capacity: 7,
    };

    const move = planMove(game, "moon-1")!;

    expect(move.arrival.tray).toHaveLength(7);
    expect(move.result.status).toBe("lost");
  });

  it("cannot select the same tile twice", () => {
    const next = planMove(createGame(), "t0")!.result;

    expect(planMove(next, "t0")).toBeNull();
  });

  it("inserts identical symbols together", () => {
    const game: GameState = {
      board: [makeTile("sun-2", "sun")],
      tray: [makeTile("sun-1", "sun"), makeTile("leaf-1", "leaf")],
      status: "playing",
    };

    expect(
      planMove(game, "sun-2")!.arrival.tray.map((tile) => tile.kind),
    ).toEqual(["sun", "sun", "leaf"]);
  });

  it("has a legal winning sequence", () => {
    let game = createGame();

    const solution = [
      "t0",
      "t1",
      "b0", // Suns
      "t2",
      "t3",
      "b1", // Leaves
      "b2",
      "b3",
      "b4", // Water drops
      "b5",
      "b6",
      "b7", // Berries
    ];

    for (const id of solution) {
      const move = planMove(game, id);

      expect(move, `Move ${id} must be legal`).not.toBeNull();
      game = move!.result;
    }

    expect(game.status).toBe("won");
    expect(game.board).toHaveLength(0);
    expect(game.tray).toHaveLength(0);
  });

  it("creates a fresh game for restart", () => {
    const first = createGame();
    const second = createGame();

    expect(second.board).toHaveLength(12);
    expect(second.tray).toHaveLength(0);
    expect(second.status).toBe("playing");
    expect(second.board).not.toBe(first.board);
  });
});
