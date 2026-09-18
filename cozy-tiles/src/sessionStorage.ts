import { capacityOf, holdsTriple, planMove, resolveState, TILE_KINDS } from "./game";
import type { GameState, Goal, MoveLimit, Tile } from "./game";
import { generateDailyPuzzle, generateLevel, GENERATOR_VERSION, isLevelNumber } from "./levels";
import { dayNumber, isDailyDate } from "./daily";
import { decodeProgress, SAVE_KEY } from "./progress";
import { MAX_STARS, newSession, UNDO_LIMIT } from "./session";
import type { Attempt, Session } from "./session";

type StoragePort = Pick<Storage, "getItem" | "setItem">;
const VERSION = 5;
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

function sameGoal(a?: Goal, b?: Goal): boolean {
  if (!a || !b) return !a && !b;
  return a.target === b.target && a.needed === b.needed && a.collected === b.collected;
}

function sameLimit(a?: MoveLimit, b?: MoveLimit): boolean {
  if (!a || !b) return !a && !b;
  return a.limit === b.limit && a.used === b.used;
}

function boardKey(board: Tile[]): string {
  return board.map((tile) => `${tile.id}:${tile.kind}:${tile.frozen ?? 0}`).join(",");
}

// Two states are equal for validation when their board, tray, frost, progress,
// and status match — never key order. Capacity is an attempt setting that can
// legitimately differ between an old undo frame and the current game (buying the
// seventh slot changes it), so it is not part of a move's identity.
function sameGame(a: GameState, b: GameState): boolean {
  return a.status === b.status &&
    boardKey(a.board) === boardKey(b.board) && boardKey(a.tray) === boardKey(b.tray) &&
    sameGoal(a.goal, b.goal) && sameLimit(a.limit, b.limit);
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
    // Frost only ever melts, so the saved count can never exceed the original.
    const frozen = t.frozen ?? 0;
    if (typeof frozen !== "number" || !Number.isInteger(frozen) || frozen < 0 || frozen > (base.frozen ?? 0)) {
      throw new Error("Invalid frozen state");
    }
    ids.add(base.id);
    const tile: Tile = { id: base.id, kind: t.kind as Tile["kind"], x: base.x, y: base.y,
      layer: base.layer, coveredBy: [...base.coveredBy] };
    if (frozen > 0) tile.frozen = frozen;
    return tile;
  });

  // The objective is fixed by the level, so only its progress may differ.
  const goalData = data.goal ?? null;
  let goal: Goal | undefined;
  if (original.goal) {
    const saved = record(goalData ?? undefined);
    if (saved.target !== original.goal.target || saved.needed !== original.goal.needed) {
      throw new Error("Invalid goal");
    }
    goal = { target: original.goal.target, needed: original.goal.needed,
      collected: integer(saved.collected, original.goal.needed) };
  } else if (goalData) throw new Error("Unexpected goal");

  const limitData = data.limit ?? null;
  let limit: MoveLimit | undefined;
  if (original.limit) {
    const saved = record(limitData ?? undefined);
    if (saved.limit !== original.limit.limit) throw new Error("Invalid move limit");
    limit = { limit: original.limit.limit, used: integer(saved.used, original.limit.limit) };
  } else if (limitData) throw new Error("Unexpected move limit");

  if (data.board.length + data.tray.length > original.board.length) throw new Error("Too many tiles");
  const game: GameState = { board: tiles(data.board), tray: tiles(data.tray), status: "playing",
    ...(data.capacity === undefined ? {} : { capacity: data.capacity as 6 | 7 }),
    ...(goal ? { goal } : {}), ...(limit ? { limit } : {}) };
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

// Each frame must follow the last by exactly one legal pick — a collection or a
// thaw — so a tampered save cannot smuggle in an impossible board.
function plannedTransition(before: GameState, after: GameState, capacity: 6 | 7) {
  const removed = before.board.filter((tile) => !after.board.some((other) => other.id === tile.id));
  let id = removed.length === 1 ? removed[0].id : null;
  if (!id) {
    const melted = before.board.filter((tile) => {
      const other = after.board.find((candidate) => candidate.id === tile.id);
      return other && (tile.frozen ?? 0) !== (other.frozen ?? 0);
    });
    if (before.board.length === after.board.length && melted.length === 1) id = melted[0].id;
  }
  if (!id) return null;
  const move = planMove({ ...before, capacity }, id);
  return move && sameGame(move.result, after) ? move : null;
}

type AttemptFields = Pick<Session, "game" | "undo" | "shuffleCount" | "rescues" | "attempts" | "usedBooster">;

// One attempt's game, undo history, and per-attempt counters, validated against
// the board they were generated from. Used for both the active attempt and a
// campaign attempt set aside behind a daily puzzle.
function validateAttempt(data: Record<string, unknown>, original: GameState): AttemptFields {
  if (!Array.isArray(data.undo) || data.undo.length > UNDO_LIMIT) throw new Error("Invalid undo history");
  const game = validateGame(data.game, original);
  const undo = data.undo.map((entry) => validateGame(entry, original));
  // Every saved undo frame must lead to the next by exactly one ordinary pick.
  const capacity = capacityOf(game);
  for (let i = 0; i < undo.length; i++) {
    const before = undo[i];
    const after = undo[i + 1] ?? game;
    if (!plannedTransition(before, after, capacity)) throw new Error("Invalid undo transition");
  }
  return { game, undo, shuffleCount: integer(data.shuffleCount),
    // At most one free rescue can ever be spent per attempt.
    rescues: integer(data.rescues ?? 0, 1),
    // A loose ceiling: a save must never be discarded over a benign counter.
    attempts: integer(data.attempts ?? 0, 1_000_000),
    usedBooster: flag(data.usedBooster ?? false) };
}

function finish(data: Record<string, unknown>, level: number): Omit<Session, "level"> {
  const campaign = generateLevel(level).game;
  // A daily puzzle validates against today's generated board, not a campaign level.
  const daily = data.daily ?? null;
  if (daily !== null && !isDailyDate(daily)) throw new Error("Invalid daily date");
  const active = validateAttempt(
    data,
    daily ? generateDailyPuzzle(dayNumber(daily)).game : campaign,
  );

  let stash: Attempt | null = null;
  if (data.stash !== undefined && data.stash !== null) {
    stash = validateAttempt(record(data.stash), campaign);
  }
  if (daily !== null && stash === null) throw new Error("Missing stashed attempt");
  if (daily === null && stash !== null) throw new Error("Unexpected stashed attempt");

  const settings = record(data.settings);
  // autoAdvance is optional so that saves written before it existed still load.
  for (const key of ["sound", "vibration", "relaxed", "autoAdvance"]) {
    if (typeof settings[key] !== "boolean" && settings[key] !== undefined) {
      throw new Error("Invalid setting");
    }
  }

  const rewardedThrough = integer(data.rewardedThrough, level);
  if (rewardedThrough < level - 1) throw new Error("Invalid reward state");
  // A campaign win is banked immediately; a daily win never touches campaign progress.
  if (daily === null && active.game.status === "won" && rewardedThrough !== level) {
    throw new Error("Invalid reward state");
  }

  const lastDaily = data.lastDaily ?? null;
  if (lastDaily !== null && !isDailyDate(lastDaily)) throw new Error("Invalid last daily");
  const dailyStreak = integer(data.dailyStreak ?? 0, 100_000);
  const dailyBestStreak = integer(data.dailyBestStreak ?? 0, 100_000);
  const dailiesCleared = integer(data.dailiesCleared ?? 0, 100_000);
  if (dailyBestStreak < dailyStreak) throw new Error("Invalid daily streak");
  // A banked daily implies a live streak and at least one completion.
  if (lastDaily !== null && (dailyStreak < 1 || dailiesCleared < 1)) throw new Error("Invalid daily counters");
  // A won daily must have banked its reward for that exact date.
  if (daily !== null && active.game.status === "won" && lastDaily !== daily) {
    throw new Error("Invalid daily reward state");
  }

  return { ...active, coins: integer(data.coins), rewardedThrough,
    stars: validateStars(data.stars, level, rewardedThrough),
    revision: integer(data.revision),
    settings: { sound: settings.sound as boolean, vibration: settings.vibration as boolean,
      relaxed: settings.relaxed as boolean, autoAdvance: settings.autoAdvance === true },
    daily: daily as string | null, stash, lastDaily,
    dailyStreak, dailyBestStreak, dailiesCleared };
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
  // Older versions predate rescue, attempt, star, daily, frozen, and objective
  // tracking; the missing fields default on the way in.
  if (![2, 3, 4, VERSION].includes(data.version as number) || data.generator !== GENERATOR_VERSION || !isLevelNumber(data.level)) {
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
