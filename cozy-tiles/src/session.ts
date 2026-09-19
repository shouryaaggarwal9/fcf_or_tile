import { capacityOf, planMove, resolveState } from "./game";
import type { GameState } from "./game";
import { generateDailyPuzzle, generateLevel, isLevelNumber, MAX_LEVEL } from "./levels";
import { BOOSTERS, BOOSTER_ORDER, shuffle, wand } from "./boosters";
import type { Booster } from "./boosters";
import { DAILY_COINS, dayNumber, isConsecutive, isDailyDate } from "./daily";

export { BOOSTERS, BOOSTER_ORDER };

export type Settings = {
  sound: boolean;
  vibration: boolean;
  relaxed: boolean;
  /** Skip the win dialog and move straight on. */
  autoAdvance: boolean;
};
/** The resumable part of an attempt, so a campaign board can be set aside
 * intact while a daily puzzle is in play. */
export type Attempt = {
  game: GameState;
  undo: GameState[];
  shuffleCount: number;
  rescues: number;
  attempts: number;
  usedBooster: boolean;
};

export type Session = {
  level: number; game: GameState; coins: number; rewardedThrough: number;
  settings: Settings; undo: GameState[]; shuffleCount: number; revision: number;
  /** Free rescues already spent on this attempt. */
  rescues: number;
  /** Losses taken on this attempt. */
  attempts: number;
  /** Whether this attempt used help, which affects the star rating. */
  usedBooster: boolean;
  /** Best rating earned per cleared level. */
  stars: Record<number, number>;
  /** The date of the daily puzzle currently on the board, or null in campaign. */
  daily: string | null;
  /** The campaign attempt set aside while a daily is in play. */
  stash: Attempt | null;
  /** The date of the most recently completed daily puzzle. */
  lastDaily: string | null;
  dailyStreak: number;
  dailyBestStreak: number;
  dailiesCleared: number;
  /** The seventh tray slot, once bought. Permanent: it is never reset. */
  seventhSlot: boolean;
};
export const WELCOME_COINS = 100;
export const WIN_COINS = 20;
export const UNDO_LIMIT = 48;
export const MAX_STARS = 3;
export const HINT_PRICE = 15;

/** Hints cost a small focus tax in Standard Mode; Relaxed Mode keeps them free. */
export const hintPrice = (session: Session) =>
  session.settings.relaxed ? 0 : HINT_PRICE;

/** Charges for one hint. A refusal never charges, and Relaxed Mode never does. */
export function payForHint(session: Session): { session: Session; error: string } {
  const cost = hintPrice(session);
  if (session.coins < cost) {
    return {
      session,
      error: `Not enough coins. A hint costs ${HINT_PRICE}, or enable Relaxed Mode in settings.`,
    };
  }
  return { session: { ...session, coins: session.coins - cost, revision: session.revision + 1 }, error: "" };
}

export function newSession(level = 1): Session {
  return { level, game: generateLevel(level).game, coins: WELCOME_COINS,
    rewardedThrough: level - 1,
    settings: { sound: true, vibration: true, relaxed: false, autoAdvance: false },
    undo: [], shuffleCount: 0, revision: 0, rescues: 0, attempts: 0, usedBooster: false, stars: {},
    daily: null, stash: null, lastDaily: null, dailyStreak: 0, dailyBestStreak: 0, dailiesCleared: 0,
    seventhSlot: false };
}

/** Applies the permanent seventh slot to a board, whatever its source. */
function withSlots(game: GameState, seventhSlot: boolean): GameState {
  return seventhSlot ? { ...game, capacity: 7 } : game;
}

/** The board an attempt starts from: a campaign level or a date's daily puzzle. */
function freshGame(level: number, daily: string | null): GameState {
  return daily ? generateDailyPuzzle(dayNumber(daily)).game : generateLevel(level).game;
}

function attemptOf(session: Session): Attempt {
  return { game: session.game, undo: session.undo, shuffleCount: session.shuffleCount,
    rescues: session.rescues, attempts: session.attempts, usedBooster: session.usedBooster };
}

function reward(session: Session): Session {
  if (session.daily) {
    const date = session.daily;
    // A completed daily pays once: refreshes and replays never re-reward.
    if (session.game.status !== "won" || session.lastDaily === date) return session;
    const streak = isConsecutive(session.lastDaily, date) ? session.dailyStreak + 1 : 1;
    return { ...session, coins: session.coins + DAILY_COINS, lastDaily: date,
      dailyStreak: streak, dailyBestStreak: Math.max(session.dailyBestStreak, streak),
      dailiesCleared: session.dailiesCleared + 1 };
  }
  if (session.game.status !== "won" || session.rewardedThrough >= session.level) return session;
  return { ...session, coins: session.coins + WIN_COINS, rewardedThrough: session.level };
}

/** Getting stuck is never charged for: the first rescue of an attempt is free. */
export const rescueAvailable = (session: Session) =>
  session.game.status === "lost" && session.undo.length > 0 && session.rescues === 0;

export const starsFor = (session: Session) => {
  if (session.attempts === 0 && !session.usedBooster) return 3;
  if (session.attempts > 0 && session.usedBooster) return 1;
  return 2;
};

export const starsOf = (session: Session, level = session.level) =>
  session.stars[level] ?? 0;

function record(session: Session): Session {
  // Daily puzzles are a side challenge: they never touch campaign star ratings.
  if (session.daily || session.game.status !== "won") return session;
  const best = Math.max(starsOf(session), starsFor(session));
  return { ...session, stars: { ...session.stars, [session.level]: best } };
}

export function pick(session: Session, id: string) {
  const move = planMove(session.game, id);
  if (!move) return null;
  const lost = move.result.status === "lost";
  const next = { ...session, game: move.result,
    undo: [...session.undo, session.game].slice(-UNDO_LIMIT),
    attempts: lost ? session.attempts + 1 : session.attempts,
    revision: session.revision + 1 };
  return { move, session: record(reward(next)) };
}

/** Undoes the losing pick for free, once per attempt. */
export function rescue(session: Session, expectedRevision: number): { session: Session; error: string } {
  if (expectedRevision !== session.revision) {
    return { session, error: "The game changed. Please choose the action again." };
  }
  if (!rescueAvailable(session)) {
    return { session, error: "No free rescue is available." };
  }
  return { session: record({ ...session, usedBooster: true, rescues: session.rescues + 1,
    game: resolveState({ ...session.undo.at(-1)!, capacity: capacityOf(session.game) }),
    undo: session.undo.slice(0, -1), revision: session.revision + 1 }), error: "" };
}

export function restartSession(session: Session): Session {
  return { ...session,
    game: withSlots(freshGame(session.level, session.daily), session.seventhSlot),
    undo: [], shuffleCount: 0,
    rescues: 0, attempts: 0, usedBooster: false, revision: session.revision + 1 };
}

/** Enters a daily puzzle, setting the campaign attempt aside to restore later. */
export function startDaily(session: Session, date: string): Session {
  if (!isDailyDate(date)) return session;
  // Re-opening the same day resumes it; a rollover keeps the campaign stash.
  if (session.daily === date) return session;
  const stash = session.stash ?? attemptOf(session);
  return { ...session, daily: date, stash,
    game: withSlots(generateDailyPuzzle(dayNumber(date)).game, session.seventhSlot),
    undo: [], shuffleCount: 0, rescues: 0, attempts: 0, usedBooster: false,
    revision: session.revision + 1 };
}

/** Returns to the campaign attempt that was in progress before the daily. */
export function exitDaily(session: Session): Session {
  if (!session.daily) return session;
  const restored = session.stash ?? attemptOf(newSession(session.level));
  return { ...session, ...restored,
    game: withSlots(restored.game, session.seventhSlot),
    daily: null, stash: null, revision: session.revision + 1 };
}

export function advanceSession(session: Session): Session {
  if (session.daily || session.game.status !== "won" || session.level >= MAX_LEVEL) return session;
  return { ...restartSession({ ...session, level: session.level + 1 }), rewardedThrough: session.level };
}

export const winsOnItsOwn = (session: Session) =>
  !session.daily && session.settings.autoAdvance && session.game.status === "won" &&
  session.level < MAX_LEVEL;

// The map unlocks the next level as soon as the previous one is rewarded; a
// level already completed stays replayable without paying again.
export const unlockedThrough = (session: Session) =>
  Math.min(session.rewardedThrough + 1, MAX_LEVEL);

export function goToLevel(session: Session, level: number): Session | null {
  if (!isLevelNumber(level) || level > unlockedThrough(session)) return null;
  return restartSession({ ...session, level, daily: null, stash: null });
}

export function price(session: Session, action: Booster) {
  return session.settings.relaxed ? 0 : BOOSTERS[action].price;
}

export function unavailable(session: Session, action: Booster): string {
  if (session.game.status === "won") return "This level is complete.";
  if (action === "skip" && session.daily) return "Skip is for campaign levels.";
  if (session.level < BOOSTERS[action].unlock) return `Unlocks at level ${BOOSTERS[action].unlock}.`;
  if (action === "slot" && (session.seventhSlot || capacityOf(session.game) === 7)) {
    return "The seventh slot is already open.";
  }
  if (action === "undo" && !session.undo.length) return "No ordinary picks to undo.";
  if (action === "shuffle" && session.game.status !== "playing") return "Open a slot, undo, or use the wand first.";
  if (action === "shuffle" && (session.game.goal || session.game.limit)) {
    return "Shuffle is not available on a collect or pick-limited level.";
  }
  if (action === "skip" && session.level >= MAX_LEVEL) return "You have reached the last level.";
  if (session.coins < price(session, action)) return "Not enough coins. Retry is always free, or enable Relaxed Mode in settings.";
  return "";
}

export function purchase(session: Session, action: Booster, expectedRevision: number): { session: Session; error: string } {
  if (expectedRevision !== session.revision) return { session, error: "The game changed. Please choose the action again." };
  const reason = unavailable(session, action);
  if (reason) return { session, error: reason };
  let next = { ...session, coins: session.coins - price(session, action), revision: session.revision + 1 };
  if (action === "slot") {
    // Permanent: the flag survives retries, later levels, and app closes, so the
    // upgrade is never sold twice and the option never returns.
    next.seventhSlot = true;
    next.game = resolveState(withSlots(session.game, true));
  }
  if (action === "undo") {
    next.game = resolveState({ ...session.undo.at(-1)!, capacity: capacityOf(session.game) });
    next.undo = session.undo.slice(0, -1);
  }
  if (action === "wand") {
    const game = wand(session.game);
    if (!game) {
      return { session, error: "No triple is available. No coins spent." };
    }
    next.game = game;
    next.undo = [];
  }
  if (action === "shuffle") {
    const base = session.daily ? dayNumber(session.daily) : session.level;
    const result = shuffle(session.game, base * 4099 + session.shuffleCount);
    if (!result) return { session, error: "No changed, safe shuffle was found. No coins spent. Try undo or the wand." };
    next.game = result.game;
    next.undo = [];
    next.shuffleCount++;
  }
  if (action === "skip") {
    next = restartSession({ ...next, level: session.level + 1, rewardedThrough: session.level });
  }
  // Help of any kind costs the attempt its three-star rating.
  if (action !== "skip") next.usedBooster = true;
  return { session: record(reward(next)), error: "" };
}
