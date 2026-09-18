import { capacityOf, holdsTriple, planMove, resolveState, TILE_KINDS } from "./game";
import type { GameState, Tile } from "./game";
import { generateLevel, GENERATOR_VERSION, isLevelNumber } from "./levels";
import { decodeProgress, SAVE_KEY } from "./progress";
import { MAX_STARS, newSession, UNDO_LIMIT } from "./session";
import type { Session } from "./session";

type StoragePort = Pick<Storage, "getItem" | "setItem">;
const VERSION = 3;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error("Invalid integer");
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid flag");
  return value;
}

function validateGame(value: unknown, original: GameState): GameState {
  const data = record(value);
  if (!Array.isArray(data.board) || !Array.isArray(data.tray) ||
      ![undefined, 6, 7].includes(data.capacity as number | undefined)) throw new Error("Invalid game");
  const ids = new Set<string>();
  const tiles = (list: unknown[]): Tile[] => list.map((value) => {
    const t = record(value);
    const base = original.board.find((tile) => tile.id === t.id);
    if (!base || ids.has(base.id) || t.x !== base.x || t.y !== base.y || t.layer !== base.layer ||
      JSON.stringify(t.coveredBy) !== JSON.stringify(base.coveredBy) || !TILE_KINDS.includes(t.kind as Tile["kind"])) throw new Error("Invalid tile");
    ids.add(base.id);
    return { ...base, coveredBy: [...base.coveredBy], kind: t.kind as Tile["kind"] };
  });
  if (data.board.length + data.tray.length > original.board.length) throw new Error("Too many tiles");
  const game: GameState = { board: tiles(data.board), tray: tiles(data.tray), status: "playing",
    ...(data.capacity === undefined ? {} : { capacity: data.capacity as 6 | 7 }) };
  if (game.tray.length > capacityOf(game)) throw new Error("Tray overflow");
  // Every move removes exactly three tiles, so the remainder is always a
  // multiple of three. Per-kind counts are not, because a rainbow can stand in
  // for a symbol of another kind.
  if ((game.board.length + game.tray.length) % 3) throw new Error("Invalid tile count");
  for (const kind of TILE_KINDS) {
    const count = [...game.board, ...game.tray].filter((t) => t.kind === kind).length;
    if (count > original.board.filter((t) => t.kind === kind).length) {
      throw new Error("Invalid symbol counts");
    }
  }
  // A tray holding a completable triple means the match was never resolved.
  if (holdsTriple(game.tray)) throw new Error("Unresolved triple");
  for (const tile of game.tray) {
    if (tile.coveredBy.some((id) => game.board.some((t) => t.id === id))) throw new Error("Covered tray tile");
  }
  const resolved = resolveState(game);
  if (resolved.status !== data.status) throw new Error("Invalid status");
  return resolved;
}

function validateStars(value: unknown, level: number, rewardedThrough: number): Record<number, number> {
  if (value === undefined) return {};
  const data = record(value);
  const stars: Record<number, number> = {};
  for (const [key, rating] of Object.entries(data)) {
    const parsed = Number(key);
    // A rating can only exist for a level that was reachable and cleared.
    if (!isLevelNumber(parsed) || parsed > Math.max(rewardedThrough, level)) throw new Error("Invalid star level");
    stars[parsed] = integer(rating, MAX_STARS);
    if (stars[parsed] < 1) throw new Error("Invalid star rating");
  }
  if (Object.keys(stars).length > rewardedThrough + 1) throw new Error("Too many ratings");
  return stars;
}

function finish(data: Record<string, unknown>, level: number): Omit<Session, "level"> {
  const original = generateLevel(level).game;
  const settings = record(data.settings);
  // autoAdvance is optional so that saves written before it existed still load.
  for (const key of ["sound", "vibration", "relaxed", "autoAdvance"]) {
    if (typeof settings[key] !== "boolean" && settings[key] !== undefined) {
      throw new Error("Invalid setting");
    }
  }
  if (!Array.isArray(data.undo) || data.undo.length > UNDO_LIMIT) throw new Error("Invalid undo history");
  const game = validateGame(data.game, original);
  const undo = data.undo.map((entry) => validateGame(entry, original));
  // Every saved undo frame must lead to the next by exactly one ordinary pick.
  for (let i = 0; i < undo.length; i++) {
    const before = undo[i];
    const after = undo[i + 1] ?? game;
    const removed = before.board.filter((t) => !after.board.some((other) => other.id === t.id));
    const move = removed.length === 1 ? planMove({ ...before, capacity: capacityOf(game) }, removed[0].id) : null;
    if (!move || JSON.stringify(move.result.board) !== JSON.stringify(after.board) ||
      JSON.stringify(move.result.tray) !== JSON.stringify(after.tray)) throw new Error("Invalid undo transition");
  }
  const rewardedThrough = integer(data.rewardedThrough, level);
  if (rewardedThrough < level - 1 || (game.status === "won" && rewardedThrough !== level)) throw new Error("Invalid reward state");
  // At most one free rescue can ever be spent per attempt.
  const rescues = integer(data.rescues ?? 0, 1);
  return { game, undo, coins: integer(data.coins), rewardedThrough, rescues,
    // A loose ceiling: a save must never be discarded over a benign counter.
    attempts: integer(data.attempts ?? 0, 1_000_000), usedBooster: flag(data.usedBooster ?? false),
    stars: validateStars(data.stars, level, rewardedThrough),
    shuffleCount: integer(data.shuffleCount), revision: integer(data.revision),
    settings: { sound: settings.sound as boolean, vibration: settings.vibration as boolean,
      relaxed: settings.relaxed as boolean, autoAdvance: settings.autoAdvance === true } };
}

export function decodeSession(raw: string): Session {
  if (raw.length > 1_000_000) throw new Error("Save too large");
  const data = record(JSON.parse(raw));
  if (data.version === 1) {
    const legacy = decodeProgress(raw);
    let migrated = newSession(legacy.level);
    // Reconstruct undo without retroactively paying coins for old wins.
    for (const id of legacy.moves) {
      const move = planMove(migrated.game, id)!;
      migrated = { ...migrated, game: move.result, undo: [...migrated.undo, migrated.game] };
    }
    if (migrated.game.status === "won") migrated.rewardedThrough = migrated.level;
    return migrated;
  }
  // Version 2 saves predate rescue, attempt, and star tracking.
  if (![2, VERSION].includes(data.version as number) || data.generator !== GENERATOR_VERSION || !isLevelNumber(data.level)) {
    throw new Error("Unsupported save");
  }
  return { level: data.level, ...finish(data, data.level) };
}

export function loadSession(storage?: StoragePort): { session: Session; warning: string } {
  try {
    const raw = (storage ?? window.localStorage).getItem(SAVE_KEY);
    return { session: raw === null ? newSession() : decodeSession(raw), warning: "" };
  } catch {
    return { session: newSession(), warning: "Saved progress could not be loaded. A fresh tutorial is shown. Storage may be unavailable or the save incompatible." };
  }
}

export function saveSession(session: Session, storage?: StoragePort): boolean {
  try {
    (storage ?? window.localStorage).setItem(SAVE_KEY, JSON.stringify({ ...session, version: VERSION, generator: GENERATOR_VERSION }));
    return true;
  } catch { return false; }
}

/** Only called after an explicit confirmation in Settings. */
export function clearSession(storage?: Pick<Storage, "removeItem">): boolean {
  try {
    (storage ?? window.localStorage).removeItem(SAVE_KEY);
    return true;
  } catch { return false; }
}
