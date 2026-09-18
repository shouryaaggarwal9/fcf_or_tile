import { capacityOf, PALETTE, planMove, resolveState, TILE_KINDS, WILD_KIND } from "./game";
import type { GameState, TileKind } from "./game";

export const BOOSTERS = {
  slot: { label: "Seventh slot", price: 40, unlock: 1, description: "Open one extra tray slot for this attempt. Retry or next level resets it." },
  undo: { label: "Undo", price: 20, unlock: 1, description: "Restore the board and tray before your last pick, including a cleared triple. Coins are not refunded." },
  shuffle: { label: "Shuffle", price: 40, unlock: 3, description: "Rearrange board symbols, keeping the tray. Only a verified solvable shuffle is accepted. Clears undo history." },
  wand: { label: "Wand", price: 60, unlock: 4, description: "Remove a matching triple, prioritizing the tray. Can collect covered tiles. Clears undo history." },
  skip: { label: "Skip", price: 80, unlock: 5, description: "Advance without a completion reward. The next level starts with six slots." },
} as const;
export type Booster = keyof typeof BOOSTERS;
export const BOOSTER_ORDER: Booster[] = ["undo", "shuffle", "wand", "skip"];

export function wand(state: GameState): GameState | null {
  if (state.status === "won") return null;
  const all = [...state.tray, ...state.board];
  const kinds = [...TILE_KINDS].sort((a, b) =>
    state.tray.filter((t) => t.kind === b).length - state.tray.filter((t) => t.kind === a).length);
  const kind = kinds.find((k) => all.filter((t) => t.kind === k).length >= 3);

  if (!kind) {
    // A rainbow plus a pair is also a triple, which the same-kind pass misses.
    const wild = all.find((t) => t.kind === WILD_KIND);
    const pair = PALETTE.find(
      (candidate) => state.tray.filter((t) => t.kind === candidate).length === 2,
    );
    if (!wild || !pair) return null;
    const rainbowIds = new Set([
      ...state.tray.filter((t) => t.kind === pair).map((t) => t.id),
      wild.id,
    ]);
    return resolveState({
      ...state,
      board: state.board.filter((t) => !rainbowIds.has(t.id)),
      tray: state.tray.filter((t) => !rainbowIds.has(t.id)),
    });
  }

  const ids = new Set(all.filter((t) => t.kind === kind).slice(0, 3).map((t) => t.id));
  return resolveState({ ...state, board: state.board.filter((t) => !ids.has(t.id)), tray: state.tray.filter((t) => !ids.has(t.id)) });
}

// Construct a continuation rather than running an unbounded puzzle search.
// First complete existing tray groups (pairs first), then board-only triples.
export function shuffle(state: GameState, seed: number): { game: GameState; solution: string[] } | null {
  if (state.status !== "playing" || state.board.length < 3) return null;
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
    let verified = game;
    for (const id of solution) {
      const move = planMove(verified, id);
      if (!move) return null;
      verified = move.result;
    }
    if (verified.status === "won") return { game, solution };
  }
  return null;
}
