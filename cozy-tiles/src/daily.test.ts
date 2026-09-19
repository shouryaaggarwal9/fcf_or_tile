import { describe, expect, it } from "vitest";
import { planMove, TILE_FACE } from "./game";
import { boardBounds, dailyRecipe, generateDailyPuzzle } from "./levels";
import {
  activeDailyStreak,
  dailyClearedToday,
  dailyDateOf,
  dayNumber,
  formatDate,
  isConsecutive,
  isDailyDate,
  previousDate,
} from "./daily";

describe("daily calendar", () => {
  it("reads the local calendar date", () => {
    expect(dailyDateOf(new Date(2026, 8, 18))).toBe("2026-09-18");
    expect(dailyDateOf(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  it("accepts only real calendar dates", () => {
    expect(isDailyDate("2026-09-18")).toBe(true);
    expect(isDailyDate("2024-02-29")).toBe(true);
    for (const value of ["2026-02-30", "2026-13-01", "2026-00-10", "18-09-2026", "abc", 7, null]) {
      expect(isDailyDate(value)).toBe(false);
    }
  });

  it("counts days from the Unix epoch without timezone drift", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2026-09-18") - dayNumber("2026-09-17")).toBe(1);
    expect(() => dayNumber("nope")).toThrow();
  });

  it("steps back across month and leap-year boundaries", () => {
    expect(previousDate("2026-09-18")).toBe("2026-09-17");
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
    expect(previousDate("2024-03-01")).toBe("2024-02-29");
    expect(previousDate("2026-01-01")).toBe("2025-12-31");
    expect(formatDate(dayNumber("2026-09-18"))).toBe("2026-09-18");
  });

  it("only treats yesterday as consecutive", () => {
    expect(isConsecutive(null, "2026-09-18")).toBe(false);
    expect(isConsecutive("2026-09-17", "2026-09-18")).toBe(true);
    expect(isConsecutive("2026-09-16", "2026-09-18")).toBe(false);
    expect(isConsecutive("2026-09-18", "2026-09-18")).toBe(false);
  });

  it("shows a streak only while it is still alive", () => {
    expect(activeDailyStreak(null, 0, "2026-09-18")).toBe(0);
    expect(activeDailyStreak("2026-09-18", 4, "2026-09-18")).toBe(4);
    expect(activeDailyStreak("2026-09-17", 4, "2026-09-18")).toBe(4);
    // A missed day reads as broken until the next completion restarts it.
    expect(activeDailyStreak("2026-09-15", 4, "2026-09-18")).toBe(0);
    expect(dailyClearedToday("2026-09-18", "2026-09-18")).toBe(true);
    expect(dailyClearedToday("2026-09-17", "2026-09-18")).toBe(false);
  });
});

describe("generated daily puzzles", () => {
  it("is deterministic, solvable, and readable for a spread of days", () => {
    for (const day of [0, 1, 7, 8, 31, 100, 1000, 20_000]) {
      const generated = generateDailyPuzzle(day);
      expect(generateDailyPuzzle(day)).toEqual(generated);
      expect(generated.game.board.length % 3).toBe(0);
      expect(generated.game.board.length).toBeGreaterThan(0);
      expect(generated.game.board.length).toBeLessThanOrEqual(48);

      const bounds = boardBounds(generated.game.board);
      expect((280 * TILE_FACE) / bounds.width).toBeGreaterThanOrEqual(48);
      expect(new Set(generated.game.board.map((tile) => tile.id)).size).toBe(generated.game.board.length);

      let game = generated.game;
      for (const id of generated.solution) {
        const move = planMove(game, id);
        expect(move).not.toBeNull();
        expect(move!.arrival.tray.length).toBeLessThanOrEqual(3);
        game = move!.result;
      }
      expect(game).toEqual({ board: [], tray: [], status: "won" });
    }
  });

  it("varies from day to day instead of repeating", () => {
    const signature = (day: number) =>
      generateDailyPuzzle(day).game.board.map((tile) => tile.kind).join(",");
    const days = [2, 3, 4, 5, 6, 9, 10, 11];
    expect(new Set(days.map(signature)).size).toBeGreaterThan(3);
  });

  it("never schedules objectives on a daily", () => {
    for (const day of [0, 7, 8, 15, 16]) {
      const recipe = dailyRecipe(day);
      expect(recipe.objective).toBe("clear");
      expect(recipe.gentle).toBe(false);
    }
  });

  it("rotates recipes and silhouettes without ever repeating one shape", () => {
    const recipes = Array.from({ length: 5 }, (_, index) => dailyRecipe(index));
    expect(new Set(recipes.map((recipe) => recipe.tiles)).size).toBe(5);
    const shapes = new Set(
      Array.from({ length: 6 }, (_, index) => dailyRecipe(index).shape),
    );
    expect(shapes.size).toBe(6);
    expect(() => dailyRecipe(1.5)).toThrow();
  });
});
