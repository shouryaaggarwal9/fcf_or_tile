export const TILE_KINDS = [
  "sun", "leaf", "drop", "berry", "moon", "star", "heart", "flower",
  "apple", "orange", "cherry", "mushroom", "fish", "butterfly", "gem", "cup",
  "cloud", "bell", "honey", "acorn", "wild",
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

/** Matches any pair of one kind, and clears as a triple with two more wilds. */
export const WILD_KIND: TileKind = "wild";

/** Every symbol that can be assigned as an ordinary group of three. */
export const PALETTE: TileKind[] = TILE_KINDS.filter(
  (kind) => kind !== WILD_KIND,
);

// Tile-face size in board units. Shadows never participate in blocking.
export const TILE_FACE = 0.92;

export type Tile = {
  id: string;
  kind: TileKind;
  x: number;
  y: number;
  layer: number;
  coveredBy: string[];
  /** Picks still needed before it can be collected: 0 or 1. */
  frozen?: number;
};

/** A collect objective: win once `collected` reaches `needed`. */
export type Goal = { target: TileKind; needed: number; collected: number };

/** A pick limit: lose if `used` reaches `limit` before the board clears. */
export type MoveLimit = { limit: number; used: number };

export type GameState = {
  board: Tile[];
  tray: Tile[];
  status: "playing" | "won" | "lost";
  capacity?: 6 | 7;
  goal?: Goal;
  limit?: MoveLimit;
};

export type Move = {
  tile: Tile;
  /** True when this pick thawed a frozen tile instead of collecting it. */
  thaw: boolean;
  insertionIndex: number;
  arrival: GameState;
  matchingIds: string[];
  result: GameState;
};

export const TRAY_CAPACITY = 6;
export const capacityOf = (state: GameState) => state.capacity ?? TRAY_CAPACITY;

export const frozenCount = (tile: Tile) => tile.frozen ?? 0;

// Frost is removed rather than set to zero, so a thawed tile is identical to a
// tile that never froze.
function thawedTile(tile: Tile): Tile {
  const copy = { ...tile };
  delete copy.frozen;
  return copy;
}

export function goalMet(state: GameState): boolean {
  if (state.goal) return state.goal.collected >= state.goal.needed;
  return state.board.length === 0 && state.tray.length === 0;
}

// A win always outranks a loss, so a final pick that both meets the goal and
// fills the tray is a win. Clearing the triple first is why the tray is checked
// after the goal.
export function resolveState(state: GameState): GameState {
  if (goalMet(state)) return { ...state, status: "won" };
  if (state.tray.length >= capacityOf(state)) return { ...state, status: "lost" };
  if (state.limit && state.limit.used >= state.limit.limit) return { ...state, status: "lost" };
  return { ...state, status: "playing" };
}

// Bottom tiles occupy two rows of four.
// Each upper tile overlaps two bottom tiles.
const LEVEL: Tile[] = [
  {
    id: "b0",
    kind: "sun",
    x: 0,
    y: 0,
    layer: 0,
    coveredBy: ["t0"],
  },
  {
    id: "b1",
    kind: "leaf",
    x: 1,
    y: 0,
    layer: 0,
    coveredBy: ["t0"],
  },
  {
    id: "b2",
    kind: "drop",
    x: 2,
    y: 0,
    layer: 0,
    coveredBy: ["t1"],
  },
  {
    id: "b3",
    kind: "drop",
    x: 3,
    y: 0,
    layer: 0,
    coveredBy: ["t1"],
  },
  {
    id: "b4",
    kind: "drop",
    x: 0,
    y: 1,
    layer: 0,
    coveredBy: ["t2"],
  },
  {
    id: "b5",
    kind: "berry",
    x: 1,
    y: 1,
    layer: 0,
    coveredBy: ["t2"],
  },
  {
    id: "b6",
    kind: "berry",
    x: 2,
    y: 1,
    layer: 0,
    coveredBy: ["t3"],
  },
  {
    id: "b7",
    kind: "berry",
    x: 3,
    y: 1,
    layer: 0,
    coveredBy: ["t3"],
  },
  {
    id: "t0",
    kind: "sun",
    x: 0.5,
    y: 0,
    layer: 1,
    coveredBy: [],
  },
  {
    id: "t1",
    kind: "sun",
    x: 2.5,
    y: 0,
    layer: 1,
    coveredBy: [],
  },
  {
    id: "t2",
    kind: "leaf",
    x: 0.5,
    y: 1,
    layer: 1,
    coveredBy: [],
  },
  {
    id: "t3",
    kind: "leaf",
    x: 2.5,
    y: 1,
    layer: 1,
    coveredBy: [],
  },
];

export function createGame(): GameState {
  return {
    board: LEVEL.map((tile) => ({
      ...tile,
      coveredBy: [...tile.coveredBy],
    })),
    tray: [],
    status: "playing",
  };
}

export function isSelectable(state: GameState, id: string): boolean {
  const tile = state.board.find((item) => item.id === id);

  if (
    !tile ||
    state.status !== "playing" ||
    state.tray.length >= capacityOf(state)
  ) {
    return false;
  }

  return !tile.coveredBy.some((coverId) =>
    state.board.some((item) => item.id === coverId),
  );
}

/**
 * The single matching rule, shared by the engine, the save validator, the
 * boosters, and hints so they can never disagree:
 *
 * - three of one kind
 * - two of one kind completed by a rainbow
 * - one of a kind completed by two rainbows
 * - three rainbows
 *
 * `tray` must already contain `insertedId`, and any returned triple always
 * contains it, so callers can ask "would this pick clear anything?".
 */
export function findTriple(
  tray: Tile[],
  insertedId: string,
  board: Tile[] = [],
): string[] {
  const inserted = tray.find((tile) => tile.id === insertedId);
  if (!inserted) return [];

  const same = tray.filter((tile) => tile.kind === inserted.kind);
  if (same.length >= 3) return same.slice(0, 3).map((tile) => tile.id);

  const wilds = tray.filter((tile) => tile.kind === WILD_KIND);

  if (inserted.kind !== WILD_KIND) {
    const needed = 3 - same.length;
    if (wilds.length >= needed) {
      return [
        ...same.map((tile) => tile.id),
        ...wilds.slice(0, needed).map((tile) => tile.id),
      ];
    }
    return [];
  }

  // A rainbow spends itself on the pair with the most work left ahead of it,
  // then on a lone symbol, then on other rainbows. Ties break by palette order
  // so the choice is always the same for the same board.
  const held = PALETTE.map((kind) => ({
    kind,
    tiles: tray.filter((tile) => tile.kind === kind),
  })).sort((a, b) => {
    const remaining = (kind: TileKind) =>
      board.filter((tile) => tile.kind === kind).length;
    return (
      remaining(b.kind) - remaining(a.kind) ||
      PALETTE.indexOf(a.kind) - PALETTE.indexOf(b.kind)
    );
  });

  const others = wilds.filter((tile) => tile.id !== insertedId);
  const pair = held.find((entry) => entry.tiles.length === 2);
  if (pair) return [...pair.tiles.map((tile) => tile.id), insertedId];

  const lone = held.find((entry) => entry.tiles.length === 1);
  if (lone && others.length >= 1) {
    return [lone.tiles[0].id, insertedId, others[0].id];
  }

  return others.length >= 2
    ? [insertedId, ...others.slice(0, 2).map((tile) => tile.id)]
    : [];
}

/** True when the tray already holds something that must have cleared. */
export function holdsTriple(tray: Tile[]): boolean {
  return tray.some((tile) => findTriple(tray, tile.id).length > 0);
}

/**
 * Whether the tiles still in play can be partitioned into legal triples at all,
 * ignoring coverage. It is a necessary condition for finishing the level, and it
 * is exactly what a free-choice rainbow can break: spending one on a pair shifts
 * that kind's count away from a multiple of three, so the leftovers may never
 * match. With no rainbow in play, every kind must simply still be a multiple of
 * three.
 */
export function isSolvable(state: GameState): boolean {
  const tiles = [...state.board, ...state.tray];
  const rainbows = tiles.filter((tile) => tile.kind === WILD_KIND).length;
  const countOf = (kind: TileKind) => tiles.filter((tile) => tile.kind === kind).length;

  if (rainbows === 0) return PALETTE.every((kind) => countOf(kind) % 3 === 0);

  // Each kind clears as whole triples, as pairs paired with one rainbow, or as
  // singles paired with two. Track the reachable totals of rainbows spent, then
  // require the rest to clear as triples of rainbows.
  let reachable = new Set<number>([0]);
  for (const kind of PALETTE) {
    const count = countOf(kind);
    const costs = new Set<number>();
    for (let paired = 0; paired <= count; paired++) {
      if ((count - paired) % 3 !== 0) continue;
      for (let pairs = 0; 2 * pairs <= paired; pairs++) {
        costs.add(pairs + 2 * (paired - 2 * pairs));
      }
    }
    const next = new Set<number>();
    for (const used of reachable) {
      for (const cost of costs) {
        if (used + cost <= rainbows) next.add(used + cost);
      }
    }
    reachable = next;
    if (reachable.size === 0) return false;
  }
  return [...reachable].some((used) => (rainbows - used) % 3 === 0);
}

/**
 * True when picking `id` would clear a triple and leave a position with no way
 * to finish. Thaws and non-clearing picks never change the multiset, so they are
 * always allowed.
 */
export function wouldStrand(state: GameState, id: string): boolean {
  if (!isSelectable(state, id)) return false;
  const move = planMove(state, id);
  return !!move && move.matchingIds.length > 0 && !isSolvable(move.result);
}

export function planMove(state: GameState, id: string): Move | null {
  if (!isSelectable(state, id)) return null;

  const tile = state.board.find((item) => item.id === id)!;
  const limit = state.limit
    ? { limit: state.limit.limit, used: state.limit.used + 1 }
    : undefined;

  // A frozen tile costs a pick to thaw: it stays put, so nothing reaches the
  // tray and no coverage changes.
  if (frozenCount(tile) > 0) {
    const board = state.board.map((item) =>
      item.id === id ? thawedTile(item) : item,
    );
    const thawed: GameState = { ...state, board, ...(limit ? { limit } : {}) };
    return {
      tile,
      thaw: true,
      insertionIndex: -1,
      arrival: { ...thawed, status: "playing" },
      matchingIds: [],
      result: resolveState(thawed),
    };
  }

  const board = state.board.filter((item) => item.id !== id);

  // Insert after the last tile of the same kind.
  let insertionIndex = state.tray.length;

  for (let index = state.tray.length - 1; index >= 0; index--) {
    if (state.tray[index].kind === tile.kind) {
      insertionIndex = index + 1;
      break;
    }
  }

  const tray = [...state.tray];
  tray.splice(insertionIndex, 0, tile);

  const matchingIds = findTriple(tray, tile.id, board);

  const remainingTray = tray.filter((item) => !matchingIds.includes(item.id));

  // A goal counts tiles as they leave the board, so help such as the wand can
  // never strand a level with an unreachable objective.
  const goal = state.goal && tile.kind === state.goal.target
    ? { ...state.goal, collected: state.goal.collected + 1 }
    : state.goal;

  const earned: GameState = { ...state, board, tray,
    ...(goal ? { goal } : {}), ...(limit ? { limit } : {}), status: "playing" };

  return {
    tile,
    thaw: false,
    insertionIndex,
    arrival: earned,
    matchingIds,
    // Resolve the triple before the capacity and move-limit checks.
    result: resolveState({ ...earned, tray: remainingTray }),
  };
}
