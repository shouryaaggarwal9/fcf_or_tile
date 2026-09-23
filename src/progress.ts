import { planMove } from "./game";
import type { GameState } from "./game";
import { generateLevel, GENERATOR_VERSION, isLevelNumber, MAX_LEVEL } from "./levels";

export const SAVE_KEY = "cozy-tiles.progress";
const SAVE_VERSION = 1;
export type Progress = { level: number; moves: string[]; game: GameState };
type StoragePort = Pick<Storage, "getItem" | "setItem">;

export function newProgress(level = 1): Progress {
  return { level, moves: [], game: generateLevel(level).game };
}

export function nextProgress(progress: Progress): Progress {
  if (progress.game.status !== "won" || progress.level >= MAX_LEVEL) return progress;
  return newProgress(progress.level + 1);
}

export function decodeProgress(raw: string): Progress {
  if (raw.length > 16_384) throw new Error("Save is too large");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("Invalid save");
  const saved = data as Record<string, unknown>;
  if (saved.version !== SAVE_VERSION || saved.generator !== GENERATOR_VERSION ||
      !isLevelNumber(saved.level) || !Array.isArray(saved.moves)) {
    throw new Error("Unsupported save");
  }
  const progress = newProgress(saved.level);
  if (saved.moves.length > progress.game.board.length) throw new Error("Too many moves");
  for (const id of saved.moves) {
    if (typeof id !== "string") throw new Error("Invalid tile identity");
    const move = planMove(progress.game, id);
    if (!move) throw new Error("Invalid saved move");
    progress.moves.push(id);
    progress.game = move.result;
  }
  return progress;
}

export function loadProgress(storage?: StoragePort): { progress: Progress; warning: string } {
  try {
    const raw = (storage ?? window.localStorage).getItem(SAVE_KEY);
    return { progress: raw === null ? newProgress() : decodeProgress(raw), warning: "" };
  } catch {
    return {
      progress: newProgress(),
      warning: "Saved progress could not be loaded. Starting a fresh puzzle. Browser storage may be unavailable.",
    };
  }
}

export function saveProgress(progress: Progress, storage?: StoragePort): boolean {
  try {
    (storage ?? window.localStorage).setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION, generator: GENERATOR_VERSION,
      level: progress.level, moves: progress.moves,
    }));
    return true;
  } catch {
    return false;
  }
}
