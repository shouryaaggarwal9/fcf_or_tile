import { describe, expect, it } from "vitest";
import { frozenCount, isSelectable, planMove, WILD_KIND } from "./game";
import type { GameState, Tile, TileKind } from "./game";
import { frozenFor, generateLevel, GENERATOR_VERSION } from "./levels";
import { hintFor } from "./hints";
import { newSession, pick, purchase, restartSession } from "./session";
import { decodeSession, loadSession, saveSession } from "./sessionStorage";

function makeTile(id: string, kind: TileKind, frozen = 0): Tile {
  return { id, kind, x: 0, y: 0, layer: 0, coveredBy: [], ...(frozen ? { frozen } : {}) };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

// Plays into a frozen level only as far as the first selectable frozen tile,
// because the generator is free to place frost on a covered tile.
function intoFrost(level: number) {
  let session = newSession(level);
  for (const id of generateLevel(level).solution) {
    const frozen = session.game.board.find(
      (tile) => frozenCount(tile) > 0 && isSelectable(session.game, tile.id),
    );
    if (frozen) return { session, id: frozen.id };
    const picked = pick(session, id);
    if (!picked) break;
    session = picked.session;
  }
  throw new Error("No frozen tile became selectable");
}

function replay(level: number): GameState {
  let game = generateLevel(level).game;
  for (const id of generateLevel(level).solution) {
    const move = planMove(game, id);
    if (!move) break;
    game = move.result;
    if (game.status === "won") break;
  }
  return game;
}

describe("frozen tile rules", () => {
  it("thaws with the first pick and collects with the second", () => {
    const game: GameState = { board: [makeTile("ice", "sun", 1)], tray: [], status: "playing" };

    const thaw = planMove(game, "ice")!;
    expect(thaw.thaw).toBe(true);
    expect(thaw.result.board.map((tile) => tile.id)).toEqual(["ice"]);
    expect(frozenCount(thaw.result.board[0])).toBe(0);
    expect(thaw.result.tray).toHaveLength(0);
    expect(thaw.result.status).toBe("playing");

    const collect = planMove(thaw.result, "ice")!;
    expect(collect.thaw).toBe(false);
    expect(collect.result.tray.map((tile) => tile.id)).toEqual(["ice"]);
    expect(collect.result.board).toHaveLength(0);
  });

  it("keeps covering the tiles beneath it until it is collected", () => {
    const game: GameState = {
      board: [
        { ...makeTile("bottom", "leaf"), coveredBy: ["ice"] },
        makeTile("ice", "sun", 1),
      ],
      tray: [],
      status: "playing",
    };

    expect(isSelectable(game, "bottom")).toBe(false);

    const thaw = planMove(game, "ice")!.result;
    expect(isSelectable(thaw, "bottom")).toBe(false);

    const collect = planMove(thaw, "ice")!.result;
    expect(isSelectable(collect, "bottom")).toBe(true);
  });

  it("thaws a whole triple into a clearing pick", () => {
    const game: GameState = {
      board: [makeTile("ice-3", "sun", 1)],
      tray: [makeTile("sun-1", "sun"), makeTile("sun-2", "sun")],
      status: "playing",
    };

    const thaw = planMove(game, "ice-3")!;
    expect(thaw.thaw).toBe(true);
    expect(thaw.result.tray).toHaveLength(2);

    const cleared = planMove(thaw.result, "ice-3")!;
    expect(cleared.matchingIds).toHaveLength(3);
    expect(cleared.result.status).toBe("won");
  });
});

describe("frozen scheduling", () => {
  it("never freezes the tutorial tiers or a gentle level", () => {
    for (let level = 1; level <= 10; level++) expect(frozenFor(level)).toBe(0);
    for (const level of [8, 16, 24, 32, 1000]) expect(frozenFor(level)).toBe(0);
  });

  it("grows with level and caps at six", () => {
    expect(frozenFor(11)).toBe(2);
    expect(frozenFor(15)).toBe(3);
    expect(frozenFor(100)).toBe(6);
    expect(frozenFor(999_999_997)).toBe(6);
  });

  it("marks exactly the scheduled number of tiles and duplicates them in the witness", () => {
    for (const level of [11, 12, 15, 20, 50, 999]) {
      const board = generateLevel(level).game.board;
      const frozen = board.filter((tile) => frozenCount(tile) > 0);
      expect(frozen).toHaveLength(frozenFor(level));
      expect(new Set(frozen.map((tile) => tile.id)).size).toBe(frozen.length);
      // Every frozen tile is thawed and then collected.
      expect(generateLevel(level).solution).toHaveLength(board.length + frozen.length);
    }
  });

  it("stays deterministic and solvable", () => {
    for (const level of [11, 14, 15, 20, 47]) {
      expect(generateLevel(level)).toEqual(generateLevel(level));
      expect(replay(level).status).toBe("won");
    }
  });
});

describe("frozen hints", () => {
  it("only offers pickable tiles and the witness still wins", () => {
    let probe = generateLevel(11).game;
    for (let step = 0; step < 80 && probe.status === "playing"; step++) {
      const hint = hintFor(probe, 11);
      if (!hint) break;
      expect(isSelectable(probe, hint.id)).toBe(true);
      probe = planMove(probe, hint.id)!.result;
    }
    expect(probe.status).toBe("won");
  });
});

describe("frozen saving", () => {
  it("round-trips a mid-level session with a thawed tile", () => {
    const { session: before, id } = intoFrost(11);
    const session = pick(before, id)!.session;
    expect(frozenCount(session.game.board.find((tile) => tile.id === id)!)).toBe(0);

    const storage = memoryStorage();
    expect(saveSession(session, storage)).toBe(true);
    expect(loadSession(storage)).toEqual({ session, warning: "" });
  });

  it("undo restores the frost, and a re-thaw round-trips too", () => {
    const { session: before, id } = intoFrost(11);
    const thawed = pick(before, id)!.session;
    const undone = purchase(thawed, "undo", thawed.revision).session;
    expect(frozenCount(undone.game.board.find((tile) => tile.id === id)!)).toBe(1);

    const storage = memoryStorage();
    expect(saveSession(undone, storage)).toBe(true);
    expect(loadSession(storage).session).toEqual(undone);
  });

  it("rejects frost on a tile that never froze", () => {
    const base = newSession(11);
    const plain = base.game.board.find((tile) => frozenCount(tile) === 0)!;
    const raw = JSON.stringify({
      ...base, version: 5, generator: GENERATOR_VERSION,
      undo: [], game: {
        ...base.game,
        board: base.game.board.map((tile) =>
          tile.id === plain.id ? { ...tile, frozen: 1 } : tile),
      },
    });

    expect(() => decodeSession(raw)).toThrow(/frozen/i);
  });

  it("keeps the generated board stable across a restart", () => {
    const session = newSession(11);
    expect(restartSession(session).game).toEqual(session.game);
    expect(generateLevel(11).game.board.some((tile) => tile.kind === WILD_KIND)).toBe(false);
  });
});
