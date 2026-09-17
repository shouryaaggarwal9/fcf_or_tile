import { describe, expect, it } from "vitest";
import { capacityOf } from "./game";
import type { Tile } from "./game";
import { generateLevel, MAX_LEVEL } from "./levels";
import { BOOSTERS, newSession, price, purchase, pick, restartSession, WELCOME_COINS, WIN_COINS } from "./session";
import type { Session } from "./session";
import { decodeSession, loadSession, saveSession } from "./sessionStorage";

function makeTile(id: string, kind: Tile["kind"]): Tile {
  return { id, kind, x: 0, y: 0, layer: 0, coveredBy: [] };
}

function move(session: Session, id: string): Session {
  const picked = pick(session, id);
  if (!picked) throw new Error(`Illegal test move: ${id}`);
  return picked.session;
}

function win(session: Session): Session {
  return generateLevel(session.level).solution.reduce(move, session);
}

function lostState(): Session {
  const tray = [makeTile("a", "leaf"), makeTile("b", "drop"), makeTile("c", "berry"),
    makeTile("d", "moon"), makeTile("e", "star")];
  const board = [makeTile("f", "sun")];
  return { ...newSession(10), game: { board, tray, status: "lost" } };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("seventh slot", () => {
  it("opens with coins for the current attempt and resets on retry", () => {
    const lost = lostState();
    expect(lost.game.status).toBe("lost");
    const next = purchase(lost, "slot", lost.revision).session;
    expect(capacityOf(next.game)).toBe(7);
    expect(next.game.status).toBe("playing");
    expect(next.coins).toBe(WELCOME_COINS - BOOSTERS.slot.price);
    const retried = restartSession(next);
    expect(capacityOf(retried.game)).toBe(6);
  });

  it("rejects double purchase, stale confirmations and shortage", () => {
    const lost = lostState();
    const bought = purchase(lost, "slot", lost.revision).session;
    const again = purchase(bought, "slot", bought.revision);
    expect(again.error).toContain("already open");
    expect(again.session.coins).toBe(bought.coins);
    const stale = purchase(lost, "slot", lost.revision + 5);
    expect(stale.error).toContain("changed");
    const broke = purchase({ ...lost, coins: 1 }, "slot", lost.revision);
    expect(broke.error).toContain("Not enough coins");
    expect(broke.session.coins).toBe(1);
  });

  it("is free in Relaxed Mode even without coins", () => {
    const relaxed = { ...lostState(), coins: 0, settings: { sound: true, vibration: true, relaxed: true } };
    expect(price(relaxed, "slot")).toBe(0);
    const next = purchase(relaxed, "slot", relaxed.revision).session;
    expect(capacityOf(next.game)).toBe(7);
    expect(next.coins).toBe(0);
  });
});
describe("boosters", () => {
  it("undo restores the pre-pick board and tray, including a cleared triple", () => {
    let session = newSession(1);
    for (const id of ["t0", "t1", "b0"]) session = move(session, id);
    expect(session.game.tray).toHaveLength(0);
    const undone = purchase(session, "undo", session.revision).session;
    expect(undone.game.tray.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(undone.game.board).toHaveLength(10);
    expect(undone.coins).toBe(WELCOME_COINS - BOOSTERS.undo.price);
    const empty = purchase({ ...undone, undo: [] }, "undo", undone.revision);
    expect(empty.error).toContain("No ordinary picks");
    expect(empty.session.coins).toBe(undone.coins);
  });

  it("wand removes a tray-preferring triple atomically", () => {
    const session = lostState();
    const board = session.game.board.map((t) => ({ ...t }));
    board.push(makeTile("g", "leaf"), makeTile("h", "leaf"));
    const withPair = { ...session, game: { ...session.game, board } };
    const next = purchase(withPair, "wand", withPair.revision).session;
    expect(next.game.board).toHaveLength(1);
    expect(next.game.tray).toHaveLength(4);
    expect(next.coins).toBe(WELCOME_COINS - BOOSTERS.wand.price);
  });

  it("wand is refused on a finished level and spends nothing", () => {
    const finished = win(newSession(1));
    const refused = purchase(finished, "wand", finished.revision);
    expect(refused.error).toContain("complete");
    expect(refused.session.coins).toBe(finished.coins);
  });

  it("shuffle preserves symbol counts and accepts a verified shuffle", () => {
    const fresh = newSession(4);
    const before = fresh.game.board.map((t) => t.kind).sort().join(",");
    const next = purchase(fresh, "shuffle", fresh.revision);
    expect(next.error).toBe("");
    const after = next.session.game.board.map((t) => t.kind).sort().join(",");
    expect(after).toBe(before);
    expect(next.session.shuffleCount).toBe(1);
    const second = purchase(next.session, "shuffle", next.session.revision);
    expect(second.error).toBe("");
  });
});

describe("coins and progression", () => {
  it("rewards each level once and never on replay", () => {
    const session = win(newSession(1));
    expect(session.coins).toBe(WELCOME_COINS + WIN_COINS);
    expect(session.rewardedThrough).toBe(1);
    const again = win(restartSession(session));
    expect(again.coins).toBe(session.coins);
  });

  it("skip advances without a win reward and keeps other coins", () => {
    const session = { ...newSession(5), coins: 200 };
    const next = purchase(session, "skip", session.revision).session;
    expect(next.level).toBe(6);
    expect(next.coins).toBe(200 - BOOSTERS.skip.price);
    expect(next.rewardedThrough).toBe(5);
    expect(next.game.status).toBe("playing");
  });

  it("blocks level-locked boosters", () => {
    const first = newSession(1);
    expect(purchase(first, "shuffle", first.revision).error).toContain("level 3");
    expect(purchase(first, "wand", first.revision).error).toContain("level 4");
    expect(purchase(first, "skip", first.revision).error).toContain("level 5");
  });

  it("never advances beyond the last level by purchase", () => {
    const stuck = { ...newSession(MAX_LEVEL),
      game: { board: [makeTile("last", "sun")], tray: [], status: "playing" as const } };
    const refused = purchase(stuck, "skip", stuck.revision);
    expect(refused.error).toContain("last level");
    expect(refused.session.level).toBe(MAX_LEVEL);
    const finished = win(newSession(MAX_LEVEL));
    expect(purchase(finished, "wand", finished.revision).error).toContain("complete");
  });
});

describe("session storage", () => {
  it("round-trips a mid-level session exactly", () => {
    let session = newSession(6);
    for (const id of generateLevel(6).solution.slice(0, 5)) session = move(session, id);
    const storage = memoryStorage();
    expect(saveSession(session, storage)).toBe(true);
    expect(loadSession(storage)).toEqual({ session, warning: "" });
  });

  it("migrates version 1 saves without losing the current puzzle", () => {
    const moves = generateLevel(1).solution;
    const migrated = decodeSession(JSON.stringify({ version: 1, generator: 1, level: 1, moves }));
    expect(migrated.game.status).toBe("won");
    expect(migrated.rewardedThrough).toBe(1);
    expect(migrated.coins).toBe(WELCOME_COINS);
    expect(migrated.undo).toHaveLength(moves.length);
  });

  it("rejects corrupt saves with a warning and keeps the old value", () => {
    const storage = memoryStorage();
    storage.setItem("cozy-tiles.progress", "{broken");
    const loaded = loadSession(storage);
    expect(loaded.warning).not.toBe("");
    expect(storage.getItem("cozy-tiles.progress")).toBe("{broken");
  });

  it("survives unavailable storage", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadSession(broken).warning).not.toBe("");
    expect(saveSession(newSession(), broken)).toBe(false);
  });
});
