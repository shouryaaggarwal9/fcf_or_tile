import { capacityOf, planMove, resolveState } from "./game";
import type { GameState } from "./game";
import { generateLevel, MAX_LEVEL } from "./levels";
import { BOOSTERS, BOOSTER_ORDER, shuffle, wand } from "./boosters";
import type { Booster } from "./boosters";

export { BOOSTERS, BOOSTER_ORDER };

export type Settings = { sound: boolean; vibration: boolean; relaxed: boolean };
export type Session = {
  level: number; game: GameState; coins: number; rewardedThrough: number;
  settings: Settings; undo: GameState[]; shuffleCount: number; revision: number;
};
export const WELCOME_COINS = 100;
export const WIN_COINS = 20;
export const UNDO_LIMIT = 48;

export function newSession(level = 1): Session {
  return { level, game: generateLevel(level).game, coins: WELCOME_COINS,
    rewardedThrough: level - 1, settings: { sound: true, vibration: true, relaxed: false },
    undo: [], shuffleCount: 0, revision: 0 };
}

function reward(session: Session): Session {
  if (session.game.status !== "won" || session.rewardedThrough >= session.level) return session;
  return { ...session, coins: session.coins + WIN_COINS, rewardedThrough: session.level };
}

export function pick(session: Session, id: string) {
  const move = planMove(session.game, id);
  if (!move) return null;
  return { move, session: reward({ ...session, game: move.result,
    undo: [...session.undo, session.game].slice(-UNDO_LIMIT), revision: session.revision + 1 }) };
}

export function restartSession(session: Session): Session {
  return { ...session, game: generateLevel(session.level).game, undo: [], shuffleCount: 0, revision: session.revision + 1 };
}

export function advanceSession(session: Session): Session {
  if (session.game.status !== "won" || session.level >= MAX_LEVEL) return session;
  return { ...restartSession({ ...session, level: session.level + 1 }), rewardedThrough: session.level };
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
  return { session: reward(next), error: "" };
}
