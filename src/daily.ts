// Calendar logic for the date-seeded daily puzzle. Generation itself lives in
// levels.ts (`generateDailyPuzzle`); this module only maps a calendar date to a
// stable day number and reasons about streaks.

import { generateDailyPuzzle } from "./levels";

export const DAILY_COINS = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The player's local calendar date as YYYY-MM-DD, so "today" matches their day. */
export function dailyDateOf(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isDailyDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Days since the Unix epoch. Used for both the daily seed and streak math. */
export function dayNumber(date: string): number {
  if (!isDailyDate(date)) throw new Error("Invalid daily date");
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** The calendar day before `date`, derived from the day number (DST-safe). */
export function previousDate(date: string): string {
  return formatDate(dayNumber(date) - 1);
}

export function formatDate(day: number): string {
  const date = new Date(day * 86_400_000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${dayOfMonth}`;
}

export function isConsecutive(previous: string | null, date: string): boolean {
  return previous !== null && isDailyDate(previous) && previousDate(date) === previous;
}

export function puzzleFor(date: string) {
  return generateDailyPuzzle(dayNumber(date));
}

/**
 * The streak to show before today is played. A streak only stays "alive" while
 * the last completion was today or yesterday; once a day is missed it reads as
 * zero and the next completion starts over at one.
 */
export function activeDailyStreak(
  lastDaily: string | null,
  streak: number,
  today: string = dailyDateOf(),
): number {
  if (lastDaily === null || streak < 1) return 0;
  return lastDaily === today || isConsecutive(lastDaily, today) ? streak : 0;
}

export function dailyClearedToday(
  lastDaily: string | null,
  today: string = dailyDateOf(),
): boolean {
  return lastDaily === today;
}
