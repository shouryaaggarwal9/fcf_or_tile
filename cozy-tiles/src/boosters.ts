import { capacityOf, frozenCount, isSolvable, PALETTE, planMove, resolveState, TILE_KINDS, WILD_KIND } from "./game";
import type { GameState, TileKind } from "./game";

export const BOOSTERS = {
  slot: { label: "Seventh slot", price: 40, unlock: 1, description: "Permanently open a seventh tray slot. Once bought, it stays open on every level and is never offered again." },
  undo: { label: "Undo", price: 20, unlock: 1, description: "Restore the board and tray before your last pick, including a cleared triple. Coins are not refunded." },
  shuffle: { label: "Shuffle", price: 40, unlock: 3, description: "Rearrange board symbols, keeping the tray. Only a verified solvable shuffle is accepted. Clears undo history." },
  wand: { label: "Wand", price: 60, unlock: 4, description: "Remove a matching triple, prioritizing the tray. Can collect covered tiles. Clears undo history." },
  skip: { label: "Skip", price: 80, unlock: 5, description: "Advance without a completion reward. The next level starts with six slots." },
} as const;
export type Booster = keyof typeof BOOSTERS;
export const BOOSTER_ORDER: Booster[] = ["undo", "shuffle", "wand", "skip"];

// Removing a triple counts target tiles toward a collect goal, so the wand can
// never strand a level with an objective that has become unreachable.
function clearTiles(state: GameState, ids: Set<string>): GameState {
  const removed = [...state.tray, ...state.board].filter((tile) => ids.has(tile.id));
  const goal = state.goal
    ? { ...state.goal, collected: Math.min(state.goal.needed,
        state.goal.collected + removed.filter((tile) => tile.kind === state.goal!.target).length) }
    : undefined;
  return resolveState({
    ...state,
    board: state.board.filter((t) => !ids.has(t.id)),
    tray: state.tray.filter((t) => !ids.has(t.id)),
    ...(goal ? { goal } : {}),
  });
}

// The wand may not strand the player either: a rainbow clear shifts a kind's
// count, so the result must still be finishable.
function safeClear(state: GameState, ids: Set<string>): GameState | null {
  const result = clearTiles(state, ids);
  return result.status === "playing" && !isSolvable(result) ? null : result;
}

// Which tiles the wand would clear: the same-kind pass prefers whichever symbol
// the tray holds most of, and otherwise a rainbow joins a held pair.
function wandTargets(state: GameState): Set<string> | null {
  const all = [...state.tray, ...state.board];
  const kinds = [...TILE_KINDS].sort((a, b) =>
    state.tray.filter((t) => t.kind === b).length - state.tray.filter((t) => t.kind === a).length);
  const kind = kinds.find((k) => all.filter((t) => t.kind === k).length >= 3);
  if (kind) {
    return new Set(all.filter((t) => t.kind === kind).slice(0, 3).map((t) => t.id));
  }

  const wild = all.find((t) => t.kind === WILD_KIND);
  const pair = PALETTE.find(
    (candidate) => state.tray.filter((t) => t.kind === candidate).length === 2,
  );
  if (!wild || !pair) return null;
  return new Set([
    ...state.tray.filter((t) => t.kind === pair).map((t) => t.id),
    wild.id,
  ]);
}

export function wand(state: GameState): GameState | null {
  if (state.status === "won") return null;
  const ids = wandTargets(state);
  return ids ? safeClear(state, ids) : null;
}

/**
 * True when the wand is holding a triple it will not use, because clearing it
 * would leave tiles that can never match. Worth naming, so the refusal does not
 * look like the wand is broken.
 */
export function wandStrands(state: GameState): boolean {
  if (state.status === "won") return false;
  const ids = wandTargets(state);
  return !!ids && !isSolvable(clearTiles(state, ids));
}

// Construct a continuation rather than running an unbounded puzzle search.
// First complete existing tray groups (pairs first), then board-only triples.
export function shuffle(state: GameState, seed: number): { game: GameState; solution: string[] } | null {
  // Rearranging symbols cannot preserve a fixed objective or a spent move
  // budget, so those levels simply do not offer a shuffle.
  if (state.status !== "playing" || state.goal || state.limit || state.board.length < 3) return null;
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const counts = new Map<TileKind, number>(TILE_KINDS.map((k) => [k, state.board.filter((t) => t.kind === k).length]));
  const sequence: TileKind[] = [];
  let occupied = state.tray.length;
  const pending = TILE_KINDS.filter((k) => state.tray.some((t) => t.kind === k))
    .map((kind) => ({ kind, count: state.tray.filter((t) => t.kind === kind).length }))
    .sort((a, b) => b.count - a.count);
  for (const { kind, count } of pending) {
    const needed = 3 - count;
    if (needed < 1 || needed > capacityOf(state) - occupied || counts.get(kind)! < needed) return null;
    sequence.push(...Array<TileKind>(needed).fill(kind));
    counts.set(kind, counts.get(kind)! - needed);
    occupied -= count;
  }
  const groups: TileKind[] = [];
  for (const kind of TILE_KINDS) {
    const count = counts.get(kind)!;
    if (count % 3) return null;
    groups.push(...Array<TileKind>(count / 3).fill(kind));
  }
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  for (const kind of groups) sequence.push(kind, kind, kind);
  // Bounded retries avoid charging for a visually unchanged shuffle.
  for (let attempt = 0; attempt < 12; attempt++) {
    const remaining = new Set(state.board.map((t) => t.id));
    const solution: string[] = [];
    while (remaining.size) {
      const available = state.board.filter((t) => remaining.has(t.id) && t.coveredBy.every((id) => !remaining.has(id)));
      if (!available.length) return null;
      const tile = available[Math.floor(random() * available.length)];
      solution.push(tile.id);
      remaining.delete(tile.id);
    }
    const assigned = new Map(solution.map((id, index) => [id, sequence[index]]));
    const board = state.board.map((t) => ({ ...t, kind: assigned.get(t.id)! }));
    if (board.every((t, index) => t.kind === state.board[index].kind)) continue;
    const game = { ...state, board };
    // A frozen tile is thawed and collected, so the witness visits it twice.
    const witness = solution.flatMap((id) =>
      frozenCount(state.board.find((tile) => tile.id === id)!) > 0 ? [id, id] : [id]);
    let verified = game;
    for (const id of witness) {
      const move = planMove(verified, id);
      if (!move) return null;
      verified = move.result;
    }
    if (verified.status === "won") return { game, solution: witness };
  }
  return null;
}
