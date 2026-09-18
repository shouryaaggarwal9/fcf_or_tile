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

  const matchingIds = findTriple(tray, tile.id, board);

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
