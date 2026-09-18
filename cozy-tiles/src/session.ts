import { capacityOf, planMove, resolveState } from "./game";
import type { GameState } from "./game";
import { generateLevel, isLevelNumber, MAX_LEVEL } from "./levels";
import { BOOSTERS, BOOSTER_ORDER, shuffle, wand } from "./boosters";
import type { Booster } from "./boosters";

export { BOOSTERS, BOOSTER_ORDER };

export type Settings = {
  sound: boolean;
  vibration: boolean;
  relaxed: boolean;
  /** Skip the win dialog and move straight on. */
  autoAdvance: boolean;
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
};
export const WELCOME_COINS = 100;
export const WIN_COINS = 20;
export const UNDO_LIMIT = 48;
export const MAX_STARS = 3;

export function newSession(level = 1): Session {
  return { level, game: generateLevel(level).game, coins: WELCOME_COINS,
    rewardedThrough: level - 1,
    settings: { sound: true, vibration: true, relaxed: false, autoAdvance: false },
    undo: [], shuffleCount: 0, revision: 0, rescues: 0, attempts: 0, usedBooster: false, stars: {} };
}

function reward(session: Session): Session {
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
  if (session.game.status !== "won") return session;
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
  return { ...session, game: generateLevel(session.level).game, undo: [], shuffleCount: 0,
    rescues: 0, attempts: 0, usedBooster: false, revision: session.revision + 1 };
}

export function advanceSession(session: Session): Session {
  if (session.game.status !== "won" || session.level >= MAX_LEVEL) return session;
  return { ...restartSession({ ...session, level: session.level + 1 }), rewardedThrough: session.level };
}

export const winsOnItsOwn = (session: Session) =>
  session.settings.autoAdvance && session.game.status === "won" && session.level < MAX_LEVEL;

// The map unlocks the next level as soon as the previous one is rewarded; a
// level already completed stays replayable without paying again.
export const unlockedThrough = (session: Session) =>
  Math.min(session.rewardedThrough + 1, MAX_LEVEL);

export function goToLevel(session: Session, level: number): Session | null {
  if (!isLevelNumber(level) || level > unlockedThrough(session)) return null;
  return restartSession({ ...session, level });
}

export function price(session: Session, action: Booster) {
  return session.settings.relaxed ? 0 : BOOSTERS[action].price;
}

export function unavailable(session: Session, action: Booster): string {
  if (session.game.status === "won") return "This level is complete.";
  if (session.level < BOOSTERS[action].unlock) return `Unlocks at level ${BOOSTERS[action].unlock}.`;
  if (action === "slot" && capacityOf(session.game) === 7) return "The seventh slot is already open.";
  if (action === "undo" && !session.undo.length) return "No ordinary picks to undo.";
  if (action === "shuffle" && session.game.status !== "playing") return "Open a slot, undo, or use the wand first.";
  if (action === "skip" && session.level >= MAX_LEVEL) return "You have reached the last level.";
  if (session.coins < price(session, action)) return "Not enough coins. Retry is always free, or enable Relaxed Mode in settings.";
  return "";
}

export function purchase(session: Session, action: Booster, expectedRevision: number): { session: Session; error: string } {
  if (expectedRevision !== session.revision) return { session, error: "The game changed. Please choose the action again." };
  const reason = unavailable(session, action);
  if (reason) return { session, error: reason };
  let next = { ...session, coins: session.coins - price(session, action), revision: session.revision + 1 };
  if (action === "slot") next.game = resolveState({ ...session.game, capacity: 7 });
  if (action === "undo") {
    next.game = resolveState({ ...session.undo.at(-1)!, capacity: capacityOf(session.game) });
    next.undo = session.undo.slice(0, -1);
  }
  if (action === "wand") {
    const game = wand(session.game);
    if (!game) return { session, error: "No triple is available. No coins spent." };
    next.game = game;
    next.undo = [];
  }
  if (action === "shuffle") {
    const result = shuffle(session.game, session.level * 4099 + session.shuffleCount);
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
