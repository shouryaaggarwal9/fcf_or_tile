export const TILE_KINDS = [
  "sun", "leaf", "drop", "berry", "moon", "star", "heart", "flower",
  "apple", "orange", "cherry", "mushroom", "fish", "butterfly", "gem", "cup",
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

// Tile-face size in board units. Shadows never participate in blocking.
export const TILE_FACE = 0.92;

export type Tile = {
  id: string;
  kind: TileKind;
  x: number;
  y: number;
  layer: number;
  coveredBy: string[];
};

export type GameState = {
  board: Tile[];
  tray: Tile[];
  status: "playing" | "won" | "lost";
  capacity?: 6 | 7;
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

export function resolveState(state: GameState): GameState {
  return { ...state, status: state.board.length === 0 && state.tray.length === 0
    ? "won" : state.tray.length >= capacityOf(state) ? "lost" : "playing" };
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

export function planMove(state: GameState, id: string): Move | null {
  if (!isSelectable(state, id)) return null;

  const tile = state.board.find((item) => item.id === id)!;
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

  const sameKind = tray.filter((item) => item.kind === tile.kind);

  const matchingIds =
    sameKind.length >= 3 ? sameKind.slice(0, 3).map((item) => item.id) : [];

  const remainingTray = tray.filter((item) => !matchingIds.includes(item.id));

  // Resolve the triple BEFORE checking capacity.
  const status: GameState["status"] =
    board.length === 0 && remainingTray.length === 0
      ? "won"
      : remainingTray.length >= capacityOf(state)
        ? "lost"
        : "playing";

  return {
    tile,
    insertionIndex,
    arrival: {
      ...state,
      board,
      tray,
      status: "playing",
    },
    matchingIds,
    result: {
      ...state,
      board,
      tray: remainingTray,
      status,
    },
  };
}
