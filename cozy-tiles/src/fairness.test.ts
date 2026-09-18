import { describe, expect, it } from "vitest";
import { isSolvable, planMove, wouldStrand } from "./game";
import type { GameState, Tile, TileKind } from "./game";
import { hintFor } from "./hints";
import { generateLevel, MAX_LEVEL } from "./levels";
import { newSession, pick, recoverStranded, stranded } from "./session";
import type { Session } from "./session";

function makeTile(id: string, kind: TileKind): Tile {
  return { id, kind, x: 0, y: 0, layer: 0, coveredBy: [] };
}

/**
 * The board shape a rainbow level produces: one group of three rainbows plus
 * three full groups of ordinary symbols. Coverage, frost and objectives are
 * deliberately absent, so the picks below are never blocked for another reason.
 */
function rainbowBoard(): GameState {
  return {
    status: "playing",
    tray: [],
    board: [
      makeTile("w1", "wild"), makeTile("w2", "wild"), makeTile("w3", "wild"),
      makeTile("s1", "sun"), makeTile("s2", "sun"), makeTile("s3", "sun"),
      makeTile("l1", "leaf"), makeTile("l2", "leaf"), makeTile("l3", "leaf"),
      makeTile("d1", "drop"), makeTile("d2", "drop"), makeTile("d3", "drop"),
    ],
  };
}

function sessionWith(game: GameState, extra: Partial<Session> = {}): Session {
  return { ...newSession(16), game, ...extra };
}

/** Picks in order, failing loudly if the guard refuses one of them. */
function play(game: GameState, ids: string[]): GameState {
  return ids.reduce((state, id) => {
    const picked = pick(sessionWith(state), id);
    if (!picked) throw new Error(`Refused a pick the test expected to be legal: ${id}`);
    return picked.session.game;
  }, game);
}

/**
 * Replays raw engine moves, bypassing the guard, to fabricate the kind of save the
 * old build could write.
 */
function force(game: GameState, ids: string[]): GameState {
  return ids.reduce((state, id) => planMove(state, id)!.result, game);
}

const STRANDING_LINE = ["w1", "s1", "s2", "w2", "w3", "l1"];

describe("isSolvable", () => {
  it("requires multiples of three per kind when no rainbow is in play", () => {
    expect(isSolvable({ status: "playing", tray: [], board: [
      makeTile("a", "sun"), makeTile("b", "sun"), makeTile("c", "sun"),
    ] })).toBe(true);
    expect(isSolvable({ status: "playing", tray: [makeTile("d", "leaf")], board: [
      makeTile("a", "sun"), makeTile("b", "sun"),
    ] })).toBe(false);
  });

  it("lets a leftover single be rescued by two held rainbows, but not by one", () => {
    const board = [makeTile("a", "sun")];
    const two = { status: "playing" as const, board, tray: [makeTile("w1", "wild"), makeTile("w2", "wild")] };
    const one = { ...two, tray: [makeTile("w1", "wild")] };

    expect(isSolvable(two)).toBe(true);
    expect(isSolvable(one)).toBe(false);
  });

  it("treats an empty board and tray as finished, not stranded", () => {
    expect(isSolvable({ status: "playing", tray: [], board: [] })).toBe(true);
  });
});

describe("the fairness guard on ordinary picks", () => {
  it("refuses the pick that would spend the last rainbows on the wrong symbol", () => {
    // The player spends one rainbow on two suns, leaving a lone sun. Picking a
    // leaf with the other two rainbows would clear that leaf and strand the sun.
    const spent = play(rainbowBoard(), ["w1", "s1", "s2"]);
    expect(spent.tray).toHaveLength(0);
    expect(spent.board.map((tile) => tile.id)).toEqual(["w2", "w3", "s3", "l1", "l2", "l3", "d1", "d2", "d3"]);

    const strandedByLeaf = play(spent, ["w2", "w3"]) as GameState;
    // What the engine would do left alone: a leaf triple that cannot be finished.
    expect(planMove(strandedByLeaf, "l1")!.matchingIds).toHaveLength(3);
    expect(isSolvable(planMove(strandedByLeaf, "l1")!.result)).toBe(false);
    expect(wouldStrand(strandedByLeaf, "l1")).toBe(true);

    const refused = pick(sessionWith(strandedByLeaf), "l1");
    expect(refused).toBeNull();
    // The guard spent nothing: the tray still holds the two rainbows.
    expect(strandedByLeaf.tray.map((tile) => tile.id)).toEqual(["w2", "w3"]);

    // The lone sun is still collectable, so the level is not a dead end.
    expect(isSolvable(strandedByLeaf)).toBe(true);
    const saved = play(strandedByLeaf, ["s3", "l1", "l2", "l3", "d1", "d2", "d3"]);
    expect(saved.status).toBe("won");
  });

  it("never blocks the intended solution", () => {
    // Levels whose recipe includes rainbows, frost and objectives, plus a daily.
    const levels = [1, 2, 11, 12, 15, 16, 20, 24, 28, 32, 40, 56, 60, 64, 80, 100, MAX_LEVEL];
    for (const level of levels) {
      const generated = generateLevel(level);
      let session: Session = newSession(level);
      for (const id of generated.solution) {
        if (session.game.status !== "playing") break;
        const picked = pick(session, id);
        expect(picked, `level ${level} refused the witness pick ${id}`).not.toBeNull();
        session = picked!.session;
      }
      expect(session.game.status, `level ${level} did not finish`).toBe("won");
    }
  });

  it("never blocks a thaw, which cannot change the multiset", () => {
    const frozen = { ...makeTile("w1", "wild"), frozen: 1 };
    const game: GameState = { status: "playing", board: [frozen], tray: [makeTile("s1", "sun")] };

    expect(wouldStrand(game, "w1")).toBe(false);
    expect(pick(sessionWith(game), "w1")!.move.thaw).toBe(true);
  });
});

describe("hints with the guard in place", () => {
  it("suggests the rescue instead of the stranding clear", () => {
    const game = play(rainbowBoard(), ["w1", "s1", "s2", "w2", "w3"]);
    const hint = hintFor(game, 16)!;

    expect(hint.id).toBe("s3");
    expect(hint.safe).toBe(true);
  });
});

describe("recovering a save stranded before the guard", () => {
  it("rewinds to the newest playable frame instead of losing the attempt", () => {
    const level = 16;
    const witness = generateLevel(level).solution;
    let session: Session = newSession(level);
    // Two honest picks leave a playable frame that is still in the undo history.
    for (const id of witness.slice(0, 2)) {
      session = pick(session, id)!.session;
    }
    expect(stranded(session)).toBe(false);
    const playable = session.undo.at(-1)!;

    const ruin = force(rainbowBoard(), STRANDING_LINE);
    const tampered: Session = { ...session, game: ruin, undo: [...session.undo, ruin] };
    expect(stranded(tampered)).toBe(true);

    const recovered = recoverStranded(tampered);
    expect(stranded(recovered)).toBe(false);
    expect(recovered.game.board.map((tile) => tile.id)).toEqual(playable.board.map((tile) => tile.id));
    expect(recovered.game.tray.map((tile) => tile.id)).toEqual(playable.tray.map((tile) => tile.id));
    expect(recovered.undo).toHaveLength(1);
  });

  it("restarts the attempt when every frame is stranded", () => {
    const ruin = force(rainbowBoard(), STRANDING_LINE);
    const recovered = recoverStranded(sessionWith(ruin, { undo: [ruin] }));

    expect(stranded(recovered)).toBe(false);
    expect(recovered.game.board.map((tile) => tile.id)).toEqual(
      generateLevel(16).game.board.map((tile) => tile.id),
    );
  });

  it("leaves a healthy session untouched", () => {
    const session = newSession(1);
    expect(recoverStranded(session)).toBe(session);
  });
});
