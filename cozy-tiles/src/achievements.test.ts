import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  earnedAchievements,
  perfectLevels,
  totalStars,
} from "./achievements";
import { newSession } from "./session";
import type { Session } from "./session";

const earned = (session: Session, id: string) =>
  ACHIEVEMENTS.find((achievement) => achievement.id === id)!.earned(session);

describe("stats helpers", () => {
  it("totals stars and counts flawless levels", () => {
    const session = { ...newSession(1), stars: { 1: 3, 2: 2, 3: 3 } };
    expect(totalStars(session)).toBe(8);
    expect(perfectLevels(session)).toBe(2);
    expect(totalStars(newSession(1))).toBe(0);
  });
});

describe("achievements", () => {
  it("all start locked on a fresh save", () => {
    expect(earnedAchievements(newSession(1))).toEqual([]);
  });

  it("unlock from campaign progress", () => {
    expect(earned(newSession(1), "first-steps")).toBe(false);
    expect(earned({ ...newSession(1), rewardedThrough: 1 }, "first-steps")).toBe(true);
    expect(earned({ ...newSession(1), rewardedThrough: 15 }, "rainbow")).toBe(false);
    expect(earned({ ...newSession(1), rewardedThrough: 16 }, "rainbow")).toBe(true);
    expect(earned({ ...newSession(1), rewardedThrough: 19 }, "full-chapter")).toBe(false);
    expect(earned({ ...newSession(1), rewardedThrough: 20 }, "full-chapter")).toBe(true);
    expect(earned({ ...newSession(1), rewardedThrough: 50 }, "explorer")).toBe(true);
  });

  it("unlock from stars", () => {
    const tenPerfect = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [index + 1, 3]),
    ) as Record<number, number>;
    expect(earned({ ...newSession(1), stars: tenPerfect }, "constellation")).toBe(true);
    expect(earned({ ...newSession(1), stars: tenPerfect }, "flawless")).toBe(true);
    expect(earned({ ...newSession(1), stars: { 1: 3, 2: 3, 3: 3, 4: 3 } }, "flawless")).toBe(false);
    // Nine flawless plus a two star level is 29 stars: one short.
    const justShort = { ...tenPerfect, 10: 2 };
    expect(earned({ ...newSession(1), stars: justShort }, "constellation")).toBe(false);
  });

  it("unlock from daily progress", () => {
    expect(earned({ ...newSession(1), dailiesCleared: 1 }, "daily-visitor")).toBe(true);
    expect(earned({ ...newSession(1), dailyBestStreak: 2 }, "streak-three")).toBe(false);
    expect(earned({ ...newSession(1), dailyBestStreak: 3 }, "streak-three")).toBe(true);
    expect(earned({ ...newSession(1), dailyBestStreak: 6 }, "streak-seven")).toBe(false);
    expect(earned({ ...newSession(1), dailyBestStreak: 7 }, "streak-seven")).toBe(true);
  });

  it("are only ever earned from monotonic progress", () => {
    // A large best streak keeps the streak achievements even if the live streak drops.
    const spent = { ...newSession(1), coins: 0, dailyBestStreak: 7, dailyStreak: 0 };
    expect(earnedAchievements(spent).map((achievement) => achievement.id)).toEqual(
      expect.arrayContaining(["streak-three", "streak-seven"]),
    );
  });
});
