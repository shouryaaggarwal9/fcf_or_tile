import { capacityOf, planMove, resolveState, TILE_KINDS } from "./game";
import type { GameState, Tile } from "./game";
import { generateLevel, GENERATOR_VERSION, isLevelNumber } from "./levels";
import { decodeProgress, SAVE_KEY } from "./progress";
import { newSession, UNDO_LIMIT } from "./session";
import type { Session } from "./session";

type StoragePort = Pick<Storage, "getItem" | "setItem">;
const VERSION = 2;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error("Invalid integer");
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
  for (const kind of TILE_KINDS) {
    const count = [...game.board, ...game.tray].filter((t) => t.kind === kind).length;
    if (count % 3 || count > original.board.filter((t) => t.kind === kind).length ||
      game.tray.filter((t) => t.kind === kind).length >= 3) throw new Error("Invalid symbol counts");
  }
  for (const tile of game.tray) {
    if (tile.coveredBy.some((id) => game.board.some((t) => t.id === id))) throw new Error("Covered tray tile");
  }
  const resolved = resolveState(game);
  if (resolved.status !== data.status) throw new Error("Invalid status");
  return resolved;
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
  if (data.version !== VERSION || data.generator !== GENERATOR_VERSION || !isLevelNumber(data.level)) throw new Error("Unsupported save");
  const original = generateLevel(data.level).game;
  const settings = record(data.settings);
  for (const key of ["sound", "vibration", "relaxed"]) {
    if (typeof settings[key] !== "boolean") throw new Error("Invalid setting");
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
  const rewardedThrough = integer(data.rewardedThrough, data.level);
  if (rewardedThrough < data.level - 1 || (game.status === "won" && rewardedThrough !== data.level)) throw new Error("Invalid reward state");
  return { level: data.level, game, undo, coins: integer(data.coins), rewardedThrough,
    shuffleCount: integer(data.shuffleCount), revision: integer(data.revision),
    settings: { sound: settings.sound as boolean, vibration: settings.vibration as boolean, relaxed: settings.relaxed as boolean } };
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
