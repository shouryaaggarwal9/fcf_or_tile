import { describe, expect, it } from "vitest";
import { formatDate, dayNumber, puzzleFor } from "./daily";
import { generateLevel, GENERATOR_VERSION } from "./levels";
import {
  advanceSession,
  exitDaily,
  goToLevel,
  newSession,
  pick,
  restartSession,
  startDaily,
  unavailable,
  WELCOME_COINS,
  winsOnItsOwn,
} from "./session";
import type { Session } from "./session";
import { decodeSession, loadSession, saveSession } from "./sessionStorage";
import { DAILY_COINS } from "./daily";

const D1 = "2026-09-18";
const D2 = formatDate(dayNumber(D1) + 1);
const D4 = formatDate(dayNumber(D1) + 3);

function move(session: Session, id: string): Session {
  const picked = pick(session, id);
  if (!picked) throw new Error(`Illegal test move: ${id}`);
  return picked.session;
}

function winDaily(session: Session): Session {
  const solution = puzzleFor(session.daily!).solution;
  return solution.reduce(move, session);
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

describe("daily puzzle session", () => {
  it("sets the campaign attempt aside and restores it untouched", () => {
    const campaign = move(move(newSession(1), "t0"), "t1");
    const daily = startDaily(campaign, D1);

    expect(daily.daily).toBe(D1);
    expect(daily.game).toEqual(puzzleFor(D1).game);
    expect(daily.undo).toEqual([]);
    expect(daily.stash).toEqual({
      game: campaign.game,
      undo: campaign.undo,
      shuffleCount: campaign.shuffleCount,
      rescues: campaign.rescues,
      attempts: campaign.attempts,
      usedBooster: campaign.usedBooster,
    });

    const back = exitDaily(daily);
    expect(back.daily).toBeNull();
    expect(back.stash).toBeNull();
    expect(back.level).toBe(1);
    expect(back.game).toEqual(campaign.game);
    expect(back.undo).toEqual(campaign.undo);
  });

  it("resumes the same day and keeps the campaign stash across a rollover", () => {
    const day1 = startDaily(move(newSession(1), "t0"), D1);
    // Re-opening the same day is a no-op, not a reset.
    expect(startDaily(day1, D1)).toBe(day1);

    const day2 = startDaily(day1, D2);
    expect(day2.daily).toBe(D2);
    // The rollover must preserve the campaign attempt, not stash yesterday's board.
    expect(day2.stash).toEqual(day1.stash);
    expect(day2.game).toEqual(puzzleFor(D2).game);
  });

  it("pays a daily reward once and grows the streak across consecutive days", () => {
    const session = winDaily(startDaily(newSession(1), D1));
    expect(session.coins).toBe(WELCOME_COINS + DAILY_COINS);
    expect(session.lastDaily).toBe(D1);
    expect(session.dailyStreak).toBe(1);
    expect(session.dailiesCleared).toBe(1);

    // Replaying the same day pays nothing and does not inflate the streak.
    const replay = winDaily(restartSession(session));
    expect(replay.coins).toBe(session.coins);
    expect(replay.dailyStreak).toBe(1);
    expect(replay.dailiesCleared).toBe(1);

    const next = winDaily(startDaily(session, D2));
    expect(next.dailyStreak).toBe(2);
    expect(next.coins).toBe(session.coins + DAILY_COINS);

    // Missing a day resets the live streak while the best is remembered.
    const later = winDaily(startDaily(next, D4));
    expect(later.dailyStreak).toBe(1);
    expect(later.dailyBestStreak).toBe(2);
    expect(later.dailiesCleared).toBe(3);
  });

  it("never touches campaign progress or star ratings", () => {
    const won = winDaily(startDaily(newSession(5), D1));
    expect(won.stars).toEqual({});
    expect(won.rewardedThrough).toBe(4);
    expect(won.level).toBe(5);
  });

  it("regenerates the identical board on retry", () => {
    let session = startDaily(newSession(1), D1);
    session = move(session, puzzleFor(D1).solution[0]);
    const retried = restartSession(session);
    expect(retried.daily).toBe(D1);
    expect(retried.game).toEqual(puzzleFor(D1).game);
    expect(retried.undo).toEqual([]);
  });

  it("does not offer skip and never auto-advances", () => {
    const daily = startDaily(newSession(1), D1);
    expect(unavailable(daily, "skip")).toContain("campaign");

    const auto = winDaily({
      ...startDaily(newSession(1), D1),
      settings: { sound: true, vibration: true, relaxed: false, autoAdvance: true },
    });
    expect(winsOnItsOwn(auto)).toBe(false);
    expect(advanceSession(auto)).toBe(auto);
  });

  it("leaves the daily cleanly when a campaign level is chosen", () => {
    const back = goToLevel(startDaily(newSession(1), D1), 1)!;
    expect(back.daily).toBeNull();
    expect(back.stash).toBeNull();
    expect(back.game).toEqual(generateLevel(1).game);
  });

  it("round-trips an active and a completed daily through storage", () => {
    const active = move(startDaily(newSession(1), D1), puzzleFor(D1).solution[0]);
    let storage = memoryStorage();
    expect(saveSession(active, storage)).toBe(true);
    expect(loadSession(storage)).toEqual({ session: active, warning: "" });

    const won = winDaily(startDaily(newSession(1), D1));
    storage = memoryStorage();
    expect(saveSession(won, storage)).toBe(true);
    expect(loadSession(storage)).toEqual({ session: won, warning: "" });
  });

  it("rejects inconsistent daily saves", () => {
    const active = startDaily(newSession(1), D1);
    const save = (extra: Record<string, unknown>) =>
      JSON.stringify({ ...active, version: 4, generator: GENERATOR_VERSION, ...extra });

    expect(() => decodeSession(save({ daily: "not-a-date" }))).toThrow();
    expect(() => decodeSession(save({ stash: null }))).toThrow(/stashed/);
    expect(() => decodeSession(save({ lastDaily: "2026-02-30" }))).toThrow();

    const won = winDaily(startDaily(newSession(1), D1));
    const wonSave = (extra: Record<string, unknown>) =>
      JSON.stringify({ ...won, version: 4, generator: GENERATOR_VERSION, ...extra });
    expect(() => decodeSession(wonSave({ lastDaily: null }))).toThrow(/daily reward/);
    expect(() => decodeSession(wonSave({ dailyBestStreak: 0 }))).toThrow(/streak/);

    // A stashed attempt with no daily in play is incoherent.
    const campaign = newSession(1);
    expect(() =>
      decodeSession(
        JSON.stringify({
          ...campaign,
          version: 4,
          generator: GENERATOR_VERSION,
          stash: {
            ...campaign,
            game: campaign.game,
            undo: campaign.undo,
          },
        }),
      ),
    ).toThrow(/stashed/);
  });

  it("migrates version 3 saves by defaulting the daily fields", () => {
    const base = newSession(6);
    const legacy = {
      level: base.level, game: base.game, coins: base.coins,
      rewardedThrough: base.rewardedThrough, settings: base.settings, undo: base.undo,
      shuffleCount: base.shuffleCount, revision: base.revision, rescues: base.rescues,
      attempts: base.attempts, usedBooster: base.usedBooster, stars: base.stars,
      version: 3, generator: GENERATOR_VERSION,
    };

    const migrated = decodeSession(JSON.stringify(legacy));

    expect(migrated.daily).toBeNull();
    expect(migrated.stash).toBeNull();
    expect(migrated.lastDaily).toBeNull();
    expect(migrated.dailyStreak).toBe(0);
    expect(migrated.dailyBestStreak).toBe(0);
    expect(migrated.dailiesCleared).toBe(0);
    expect(migrated.game).toEqual(base.game);
  });
});
