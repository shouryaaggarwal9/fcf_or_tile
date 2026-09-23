export const TILE_KINDS = [
  "sun", "leaf", "drop", "berry", "moon", "star", "heart", "flower",
  "apple", "orange", "cherry", "mushroom", "fish", "butterfly", "gem", "cup",
  "cloud", "bell", "honey", "acorn",
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

/** Every symbol that can be assigned as an ordinary group of three. */
export const PALETTE: TileKind[] = [...TILE_KINDS];

// Tile-face size in board units. Shadows never participate in blocking.
export const TILE_FACE = 0.92;

export type Tile = {
  id: string;
  kind: TileKind;
  x: number;
  y: number;
  layer: number;
  coveredBy: string[];
  /** Key tiles that must leave the board before this tile is pickable.
   * The same selectability rule as coveredBy, just from tiles anywhere —
   * locks are static generator data and never change during play. */
  lockedBy?: string[];
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
  insertionIndex: number;
  arrival: GameState;
  matchingIds: string[];
  result: GameState;
};

export const TRAY_CAPACITY = 6;
export const capacityOf = (state: GameState) => state.capacity ?? TRAY_CAPACITY;

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

  if (tile.lockedBy?.some((keyId) =>
    state.board.some((item) => item.id === keyId),
  )) {
    return false;
  }

  return !tile.coveredBy.some((coverId) =>
    state.board.some((item) => item.id === coverId),
  );
}

/** True while at least one of the tile's key tiles is still on the board. */
export function isLocked(state: GameState, id: string): boolean {
  const tile = state.board.find((item) => item.id === id);
  return Boolean(
    tile?.lockedBy?.some((keyId) => state.board.some((item) => item.id === keyId)),
  );
}

/**
 * The single matching rule, shared by the engine, the save validator, the
 * boosters, and hints so they can never disagree: three of one kind.
 *
 * `tray` must already contain `insertedId`, and any returned triple always
 * contains it, so callers can ask "would this pick clear anything?".
 */
export function findTriple(tray: Tile[], insertedId: string): string[] {
  const inserted = tray.find((tile) => tile.id === insertedId);
  if (!inserted) return [];

  const same = tray.filter((tile) => tile.kind === inserted.kind);
  return same.length >= 3 ? same.slice(0, 3).map((tile) => tile.id) : [];
}

/** True when the tray already holds something that must have cleared. */
export function holdsTriple(tray: Tile[]): boolean {
  return tray.some((tile) => findTriple(tray, tile.id).length > 0);
}

export function planMove(state: GameState, id: string): Move | null {
  if (!isSelectable(state, id)) return null;

  const tile = state.board.find((item) => item.id === id)!;
  const limit = state.limit
    ? { limit: state.limit.limit, used: state.limit.used + 1 }
    : undefined;

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

  const matchingIds = findTriple(tray, tile.id);

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
    insertionIndex,
    arrival: earned,
    matchingIds,
    // Resolve the triple before the capacity and move-limit checks.
    result: resolveState({ ...earned, tray: remainingTray }),
  };
}
