import { describe, expect, it } from "vitest";
import { isSelectable, planMove } from "./game";
import { generateLevel, GENERATOR_VERSION, MAX_LEVEL } from "./levels";
import { decodeProgress, loadProgress, newProgress, nextProgress, SAVE_KEY, saveProgress } from "./progress";
import type { Progress } from "./progress";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function move(progress: Progress, id: string): Progress {
  const planned = planMove(progress.game, id);
  if (!planned) throw new Error(`Illegal test move: ${id}`);
  return { ...progress, moves: [...progress.moves, id], game: planned.result };
}

function win(level: number) {
  return generateLevel(level).solution.reduce(move, newProgress(level));
}

function encoded(level: unknown, moves: unknown = [], version = 1, generator = GENERATOR_VERSION) {
  return JSON.stringify({ version, generator, level, moves });
}

describe("saved progress", () => {
  it("starts at the tutorial with empty storage", () => {
    expect(loadProgress(memoryStorage())).toEqual({ progress: newProgress(), warning: "" });
  });

  it.each([1, 8, 31, 10000])("restores every completed move of level %i exactly", (level) => {
    const storage = memoryStorage();
    let progress = newProgress(level);
    for (const id of generateLevel(level).solution) {
      progress = move(progress, id);
      expect(saveProgress(progress, storage)).toBe(true);
      expect(loadProgress(storage)).toEqual({ progress, warning: "" });
    }
    expect(loadProgress(storage).progress.game.status).toBe("won");
  });

  it("stores the resolved triple rather than the temporary arrival", () => {
    let progress = newProgress();
    for (const id of ["t0", "t1", "b0"]) progress = move(progress, id);
    const storage = memoryStorage();
    saveProgress(progress, storage);
    expect(loadProgress(storage).progress.game.tray).toHaveLength(0);
    expect(loadProgress(storage).progress.game.board).toHaveLength(9);
  });

  it("restores a loss and retries the identical level", () => {
    const storage = memoryStorage();
    let lost: Progress | undefined;
    // Deterministically choose diverse symbols rather than the winning witness.
    for (let level = 4; level <= 30 && !lost; level++) {
      let progress = newProgress(level);
      while (progress.game.status === "playing") {
        const available = progress.game.board.filter((tile) => isSelectable(progress.game, tile.id));
        available.sort((a, b) =>
          progress.game.tray.filter((tile) => tile.kind === a.kind).length -
          progress.game.tray.filter((tile) => tile.kind === b.kind).length);
        progress = move(progress, available[0].id);
      }
      if (progress.game.status === "lost") lost = progress;
    }
    expect(lost).toBeDefined();
    saveProgress(lost!, storage);
    expect(loadProgress(storage).progress).toEqual(lost);
    expect(nextProgress(lost!)).toBe(lost);
    const retry = newProgress(lost!.level);
    saveProgress(retry, storage);
    expect(loadProgress(storage).progress).toEqual(newProgress(lost!.level));
  });

  it("advances only after winning and saves the new level", () => {
    const playing = newProgress(10);
    expect(nextProgress(playing)).toBe(playing);
    const completed = win(10);
    const next = nextProgress(completed);
    expect(next).toEqual(newProgress(11));
    const storage = memoryStorage();
    saveProgress(next, storage);
    expect(loadProgress(storage).progress).toEqual(next);
    const last = win(MAX_LEVEL);
    expect(nextProgress(last)).toBe(last);
  });

  it("rejects malformed, incompatible and illegal histories", () => {
    const invalid = [
      "{", "null", "[]", " ".repeat(16385), encoded(0), encoded(1.5),
      encoded(MAX_LEVEL + 1), encoded("1"), encoded(1, [], 2), encoded(1, [], 1, 2),
      encoded(1, "t0"), encoded(1, [123]), encoded(1, ["missing"]),
      encoded(1, ["b0"]), encoded(1, ["t0", "t0"]),
      encoded(1, Array(13).fill("t0")),
    ];
    for (const raw of invalid) {
      expect(() => decodeProgress(raw)).toThrow();
      const storage = memoryStorage();
      storage.setItem(SAVE_KEY, raw);
      const loaded = loadProgress(storage);
      expect(loaded.progress).toEqual(newProgress());
      expect(loaded.warning).not.toBe("");
      // Loading alone does not destroy the invalid save.
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
    }
  });

  it("survives unavailable storage without crashing gameplay", () => {
    const unavailable = {
      getItem: () => { throw new Error("Access denied"); },
      setItem: () => { throw new Error("Quota exceeded"); },
    };
    expect(loadProgress(unavailable).warning).not.toBe("");
    expect(saveProgress(newProgress(), unavailable)).toBe(false);
    expect(move(newProgress(), "t0").game.board).toHaveLength(11);
  });
});
