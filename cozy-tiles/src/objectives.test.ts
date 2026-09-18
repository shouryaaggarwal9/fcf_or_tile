import { describe, expect, it } from "vitest";
import { PALETTE, planMove } from "./game";
import type { GameState, Tile, TileKind } from "./game";
import { difficultyFor, generateLevel, GENERATOR_VERSION, objectiveFor } from "./levels";
import { shuffle, wand } from "./boosters";
import { newSession, pick, unavailable } from "./session";
import type { Session } from "./session";
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

function playToWin(session: Session, level: number): Session {
  for (const id of generateLevel(level).solution) {
    const picked = pick(session, id);
    if (!picked) break;
    session = picked.session;
    if (session.game.status === "won") break;
  }
  return session;
}

describe("collect goals", () => {
  const base: GameState = {
    board: [makeTile("leaf-1", "leaf"), makeTile("sun-1", "sun"), makeTile("sun-2", "sun")],
    tray: [],
    status: "playing",
    goal: { target: "sun", needed: 2, collected: 0 },
  };

  it("counts only the target symbol", () => {
    const picked = planMove(base, "leaf-1")!;
    expect(picked.result.goal!.collected).toBe(0);
    expect(picked.result.status).toBe("playing");
  });

  it("wins the moment the target is met", () => {
    const first = planMove(base, "sun-1")!.result;
    expect(first.goal!.collected).toBe(1);
    expect(first.status).toBe("playing");

    const second = planMove(first, "sun-2")!.result;
    expect(second.goal!.collected).toBe(2);
    expect(second.status).toBe("won");
  });

  it("outranks a pick that would otherwise fill the tray", () => {
    const game: GameState = {
      board: [makeTile("sun-3", "sun")],
      tray: ["leaf", "drop", "berry", "moon", "star"].map((kind, index) =>
        makeTile(`held-${index}`, kind as TileKind)),
      status: "playing",
      goal: { target: "sun", needed: 1, collected: 0 },
    };

    const picked = planMove(game, "sun-3")!;
    expect(picked.result.tray).toHaveLength(6);
    expect(picked.result.status).toBe("won");
  });
});

describe("pick-limited levels", () => {
  it("loses when the limit is spent without clearing", () => {
    const game: GameState = {
      board: [makeTile("a", "sun"), makeTile("b", "leaf")],
      tray: [],
      status: "playing",
      limit: { limit: 1, used: 0 },
    };

    const picked = planMove(game, "a")!;
    expect(picked.result.limit!.used).toBe(1);
    expect(picked.result.status).toBe("lost");
  });

  it("wins on the last allowed pick", () => {
    const game: GameState = {
      board: [makeTile("sun-3", "sun")],
      tray: [makeTile("sun-1", "sun"), makeTile("sun-2", "sun")],
      status: "playing",
      limit: { limit: 1, used: 0 },
    };

    expect(planMove(game, "sun-3")!.result.status).toBe("won");
  });

  it("charges a thaw as a pick", () => {
    const game: GameState = {
      board: [makeTile("ice", "sun", 1)],
      tray: [],
      status: "playing",
      limit: { limit: 1, used: 0 },
    };

    const thaw = planMove(game, "ice")!;
    expect(thaw.thaw).toBe(true);
    expect(thaw.result.status).toBe("lost");
  });

  it("does not count a thaw toward a collect goal", () => {
    const game: GameState = {
      board: [makeTile("ice", "sun", 1)],
      tray: [],
      status: "playing",
      goal: { target: "sun", needed: 1, collected: 0 },
    };

    const thaw = planMove(game, "ice")!;
    expect(thaw.result.goal!.collected).toBe(0);
    expect(thaw.result.status).toBe("playing");

    const collect = planMove(thaw.result, "ice")!;
    expect(collect.result.goal!.collected).toBe(1);
    expect(collect.result.status).toBe("won");
  });
});

describe("objective scheduling", () => {
  it("introduces objectives after the first tier, never on gentle levels", () => {
    for (let level = 1; level <= 11; level++) expect(objectiveFor(level)).toBe("clear");
    expect(objectiveFor(12)).toBe("clear");
    expect(objectiveFor(15)).toBe("collect");
    expect(objectiveFor(20)).toBe("moves");
    expect(objectiveFor(21)).toBe("collect");
    expect(objectiveFor(25)).toBe("moves");
    expect(objectiveFor(30)).toBe("moves");
    for (const level of [16, 24, 40, 64]) expect(objectiveFor(level)).toBe("clear");
    expect(difficultyFor(20).objective).toBe("moves");
  });

  it("builds a real collect goal with a mid-board target", () => {
    for (const level of [15, 21, 27, 45]) {
      const { game } = generateLevel(level);
      expect(game.goal).toBeDefined();
      expect(game.limit).toBeUndefined();
      expect(PALETTE).toContain(game.goal!.target);
      expect(game.goal!.needed % 3).toBe(0);
      const owned = game.board.filter((tile) => tile.kind === game.goal!.target).length;
      expect(game.goal!.needed).toBe(owned);
      expect(game.goal!.collected).toBe(0);
    }
  });

  it("builds a pick limit that the witness can beat", () => {
    for (const level of [20, 30, 50, 100]) {
      const { game, solution } = generateLevel(level);
      expect(game.limit).toBeDefined();
      expect(game.goal).toBeUndefined();
      expect(game.limit!.limit).toBeGreaterThanOrEqual(solution.length);
      expect(game.limit!.used).toBe(0);
    }
  });

  it("never combines a goal with a limit and keeps clear levels plain", () => {
    for (let level = 12; level <= 120; level++) {
      const { game } = generateLevel(level);
      expect(Boolean(game.goal) && Boolean(game.limit)).toBe(false);
      if (level % 8 === 0) {
        expect(game.goal).toBeUndefined();
        expect(game.limit).toBeUndefined();
      }
    }
  });
});

describe("objectives and boosters", () => {
  it("lets the wand satisfy a collect goal", () => {
    const game: GameState = {
      board: [makeTile("sun-1", "sun"), makeTile("sun-2", "sun"), makeTile("sun-3", "sun"),
        makeTile("leaf-1", "leaf")],
      tray: [],
      status: "playing",
      goal: { target: "sun", needed: 3, collected: 0 },
    };

    const cleared = wand(game)!;
    expect(cleared.goal!.collected).toBe(3);
    expect(cleared.status).toBe("won");
  });

  it("refuses a shuffle on a collect or pick-limited level", () => {
    const collect = newSession(15);
    expect(unavailable(collect, "shuffle")).toContain("collect or pick-limited");
    expect(shuffle(collect.game, 7)).toBeNull();

    const limited = newSession(20);
    expect(unavailable(limited, "shuffle")).toContain("collect or pick-limited");
    expect(shuffle(limited.game, 7)).toBeNull();
  });
});

describe("objective saving", () => {
  it("rewards and rates a collect win and a pick-limited win", () => {
    for (const level of [15, 20]) {
      const won = playToWin(newSession(level), level);
      expect(won.game.status).toBe("won");
      expect(won.rewardedThrough).toBe(level);
      expect(won.stars[level]).toBe(3);
    }
  });

  it("round-trips a collect and a pick-limited level mid-game", () => {
    for (const level of [15, 20]) {
      let session = newSession(level);
      for (const id of generateLevel(level).solution.slice(0, 4)) {
        const picked = pick(session, id);
        if (!picked) break;
        session = picked.session;
        if (session.game.status !== "playing") break;
      }
      const storage = memoryStorage();
      expect(saveSession(session, storage)).toBe(true);
      expect(loadSession(storage)).toEqual({ session, warning: "" });
    }
  });

  it("round-trips a lost pick-limited attempt", () => {
    const base = newSession(20);
    const limit = base.game.limit!;
    const lost = {
      ...base,
      game: { ...base.game, status: "lost" as const, limit: { limit: limit.limit, used: limit.limit } },
    };
    const storage = memoryStorage();
    expect(saveSession(lost, storage)).toBe(true);
    expect(loadSession(storage).session.game.status).toBe("lost");
  });

  it("rejects tampered objectives", () => {
    const collect = newSession(15);
    const save = (game: unknown) =>
      JSON.stringify({ ...collect, version: 5, generator: GENERATOR_VERSION, undo: [], game });
    const goal = collect.game.goal!;

    expect(() => decodeSession(save({ ...collect.game, goal: { ...goal, needed: goal.needed + 3 } })))
      .toThrow(/goal/i);
    expect(() => decodeSession(save({ ...collect.game, goal: { ...goal, collected: goal.needed + 1 } })))
      .toThrow();
    expect(() => decodeSession(save({ ...collect.game, limit: { limit: 5, used: 0 } })))
      .toThrow(/limit/i);

    const limited = newSession(20);
    const saved = JSON.stringify({
      ...limited, version: 5, generator: GENERATOR_VERSION, undo: [],
      game: { ...limited.game, limit: { limit: limited.game.limit!.limit + 1, used: 0 } },
    });
    expect(() => decodeSession(saved)).toThrow();
  });
});
