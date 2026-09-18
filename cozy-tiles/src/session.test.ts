import { describe, expect, it } from "vitest";
import { capacityOf } from "./game";
import type { Tile } from "./game";
import { generateLevel, GENERATOR_VERSION, MAX_LEVEL } from "./levels";
import { advanceSession, BOOSTERS, goToLevel, newSession, price, purchase, pick, rescue, rescueAvailable, restartSession, starsOf, UNDO_LIMIT, unlockedThrough, WELCOME_COINS, WIN_COINS } from "./session";
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
    const relaxed = { ...lostState(), coins: 0, settings: { sound: true, vibration: true, relaxed: true, autoAdvance: false } };
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

  it("refuses an unsafe shuffle and charges nothing", () => {
    // Five different singletons cannot be completed inside six slots.
    const tray = ["leaf", "drop", "berry", "moon", "star"].map((kind, index) =>
      makeTile(`tray-${index}`, kind as Tile["kind"]),
    );
    const board = [makeTile("b1", "sun"), makeTile("b2", "sun"), makeTile("b3", "sun")];
    const stuck: Session = { ...newSession(5), game: { board, tray, status: "playing" } };

    const refused = purchase(stuck, "shuffle", stuck.revision);

    expect(refused.error).toContain("No changed, safe shuffle");
    expect(refused.session.coins).toBe(stuck.coins);
    expect(refused.session.shuffleCount).toBe(stuck.shuffleCount);
    expect(refused.session.game).toEqual(stuck.game);
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

  it("makes every booster free in Relaxed Mode", () => {
    const relaxed = {
      ...newSession(5),
      coins: 0,
      settings: { sound: true, vibration: true, relaxed: true, autoAdvance: false },
    };

    const skipped = purchase(relaxed, "skip", relaxed.revision).session;
    expect(skipped.level).toBe(6);
    expect(skipped.coins).toBe(0);

    const level = generateLevel(5);
    const moved = move(relaxed, level.solution[0]);
    const undone = purchase(moved, "undo", moved.revision).session;
    expect(undone.coins).toBe(0);
    expect(undone.game.board).toHaveLength(level.game.board.length);
    expect(undone.game.tray).toHaveLength(0);
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

describe("free rescue and star ratings", () => {
  function lostAtLevel1(): Session {
    let session = newSession(1);
    // Two of each kind fills all six slots without a triple.
    for (const id of ["t0", "t1", "t2", "t3", "b2", "b4"]) session = move(session, id);
    return session;
  }

  it("grants exactly one free rescue per attempt, then restores it on retry", () => {
    const lost = lostAtLevel1();
    expect(lost.game.status).toBe("lost");
    expect(rescueAvailable(lost)).toBe(true);

    const rescued = rescue(lost, lost.revision).session;
    expect(rescued.game.status).toBe("playing");
    expect(rescued.game.tray).toHaveLength(5);
    expect(rescued.coins).toBe(WELCOME_COINS);
    expect(rescued.rescues).toBe(1);
    expect(rescued.usedBooster).toBe(true);
    expect(rescueAvailable(rescued)).toBe(false);
    expect(rescue(rescued, rescued.revision).error).toContain("No free rescue");

    const retried = restartSession(rescued);
    expect(retried.rescues).toBe(0);
    expect(rescueAvailable(lostAtLevel1())).toBe(true);
  });

  it("ignores a rescue confirmed against a stale revision", () => {
    const lost = lostAtLevel1();
    const stale = rescue(lost, lost.revision + 3);
    expect(stale.error).toContain("changed");
    expect(stale.session.rescues).toBe(0);
  });

  it("rates a clean win three stars and never lowers the best rating", () => {
    const clean = win(newSession(1));
    expect(starsOf(clean)).toBe(3);

    // Help taken mid-play, before any loss, costs one star.
    const picked = move(newSession(1), "t0");
    const undone = purchase(picked, "undo", picked.revision).session;
    expect(starsOf(win(undone))).toBe(2);

    // Losing and then being rescued costs two: the board is now only
    // recoverable with help at all.
    const lost = lostAtLevel1();
    const rescued = rescue(lost, lost.revision).session;
    const recovered = ["b0", "b1", "b3", "b4", "b5", "b6", "b7"].reduce(move, rescued);
    expect(recovered.game.status).toBe("won");
    expect(starsOf(recovered)).toBe(1);

    // Replaying for a worse result keeps the best rating.
    const replay = win({ ...restartSession(clean), usedBooster: true });
    expect(starsOf(replay)).toBe(3);
  });

  it("rates a replayed level without touching earlier progress", () => {
    const cleared = win(newSession(1));
    const replay = win({ ...goToLevel(cleared, 1)!, usedBooster: true });
    expect(replay.stars[1]).toBe(3);
    expect(replay.rewardedThrough).toBe(1);
    expect(replay.coins).toBe(cleared.coins);
  });
});

describe("level map", () => {
  it("unlocks the next level only once the current one is rewarded", () => {
    const fresh = newSession(1);
    expect(unlockedThrough(fresh)).toBe(1);
    expect(goToLevel(fresh, 1)).not.toBeNull();
    expect(goToLevel(fresh, 2)).toBeNull();

    const won = win(newSession(1));
    expect(unlockedThrough(won)).toBe(2);

    const second = goToLevel(won, 2)!;
    expect(second.level).toBe(2);
    expect(second.game).toEqual(generateLevel(2).game);
    expect(second.undo).toEqual([]);
    expect(capacityOf(second.game)).toBe(6);
    expect(second.rewardedThrough).toBe(1);
  });

  it("replays a cleared level without paying the reward twice", () => {
    let session = advanceSession(win(newSession(1)));
    session = win(session);
    expect(session.level).toBe(2);
    expect(session.rewardedThrough).toBe(2);
    expect(session.coins).toBe(WELCOME_COINS + 2 * WIN_COINS);

    const back = goToLevel(session, 1)!;
    expect(back.level).toBe(1);
    expect(back.rewardedThrough).toBe(2);

    const again = win(back);
    expect(again.coins).toBe(session.coins);
    expect(again.rewardedThrough).toBe(2);
    expect(unlockedThrough(again)).toBe(3);
  });

  it("refuses locked and invalid levels", () => {
    const fresh = newSession(1);
    for (const level of [2, 5, 0, 1.5, NaN, MAX_LEVEL]) {
      expect(goToLevel(fresh, level)).toBeNull();
    }
    const finished = win(newSession(MAX_LEVEL));
    expect(unlockedThrough(finished)).toBe(MAX_LEVEL);
    expect(goToLevel(finished, MAX_LEVEL)!.level).toBe(MAX_LEVEL);
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

  it("keeps even the largest realistic save within the decode limit", () => {
    // A level whose recipe is the biggest one: 48 tiles over six layers.
    const level = 999_999_997;
    expect(generateLevel(level).game.board).toHaveLength(48);
    let session = newSession(level);
    for (const id of generateLevel(level).solution) {
      const picked = pick(session, id);
      if (!picked) break;
      session = picked.session;
    }
    expect(session.undo).toHaveLength(UNDO_LIMIT);
    const storage = memoryStorage();
    expect(saveSession(session, storage)).toBe(true);
    // decodeSession rejects saves over 1,000,000 characters.
    expect(storage.getItem("cozy-tiles.progress")!.length).toBeLessThan(200_000);
    expect(loadSession(storage).session).toEqual(session);
  });

  it("migrates version 2 saves by defaulting the newer fields", () => {
    const base = newSession(6);
    const legacy = {
      level: base.level, game: base.game, coins: base.coins,
      rewardedThrough: base.rewardedThrough, settings: base.settings,
      undo: base.undo, shuffleCount: base.shuffleCount, revision: base.revision,
      version: 2, generator: GENERATOR_VERSION,
    };

    const migrated = decodeSession(JSON.stringify(legacy));

    expect(migrated.level).toBe(6);
    expect(migrated.game).toEqual(base.game);
    expect(migrated.rescues).toBe(0);
    expect(migrated.attempts).toBe(0);
    expect(migrated.usedBooster).toBe(false);
    expect(migrated.stars).toEqual({});
  });

  it("rejects impossible rescue counts and star ratings", () => {
    const base = newSession(3);
    const save = (extra: Record<string, unknown>) =>
      JSON.stringify({ ...base, version: 3, generator: GENERATOR_VERSION, ...extra });

    expect(() => decodeSession(save({ rescues: 5 }))).toThrow();
    expect(() => decodeSession(save({ stars: { 9: 3 } }))).toThrow();
    expect(() => decodeSession(save({ stars: { 1: 7 } }))).toThrow();
  });

  it("round-trips a rainbow level mid-game", () => {
    const level = 16;
    let session = newSession(level);
    for (const id of generateLevel(level).solution.slice(0, 8)) {
      session = move(session, id);
    }
    expect(session.game.board.length).toBeGreaterThan(0);

    const storage = memoryStorage();
    expect(saveSession(session, storage)).toBe(true);
    const loaded = loadSession(storage);
    expect(loaded.warning).toBe("");
    expect(loaded.session).toEqual(session);
  });

  it("rejects a save whose tray still holds a completable triple", () => {
    const base = newSession(1);
    const suns = base.game.board.filter((t) => t.kind === "sun").slice(0, 3);
    const rest = base.game.board.filter((t) => !suns.includes(t));

    const raw = JSON.stringify({ ...base, version: 3, generator: GENERATOR_VERSION,
      undo: [], game: { board: rest, tray: suns, status: "playing" } });

    expect(() => decodeSession(raw)).toThrow(/Unresolved triple/);
  });

  it("keeps an open seventh slot across a reload", () => {
    let session = newSession(6);
    for (const id of generateLevel(6).solution.slice(0, 4)) session = move(session, id);
    const bought = purchase(session, "slot", session.revision).session;
    expect(capacityOf(bought.game)).toBe(7);
    const storage = memoryStorage();
    expect(saveSession(bought, storage)).toBe(true);
    const loaded = loadSession(storage);
    expect(loaded.warning).toBe("");
    expect(capacityOf(loaded.session.game)).toBe(7);
    expect(loaded.session).toEqual(bought);
  });

  it("keeps a finished level on reload so the win screen persists", () => {
    const won = win(newSession(1));
    expect(won.game.status).toBe("won");
    const storage = memoryStorage();
    expect(saveSession(won, storage)).toBe(true);
    const loaded = loadSession(storage);
    expect(loaded.warning).toBe("");
    expect(loaded.session.game.status).toBe("won");
    expect(loaded.session.rewardedThrough).toBe(1);
    expect(loaded.session.coins).toBe(WELCOME_COINS + WIN_COINS);
  });

  it("migrates version 1 saves without losing the current puzzle", () => {
    const moves = generateLevel(1).solution;
    const migrated = decodeSession(JSON.stringify({ version: 1, generator: GENERATOR_VERSION, level: 1, moves }));
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
