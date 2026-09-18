import { findTriple, isSelectable, planMove } from "./game";
import type { GameState } from "./game";
import { generateLevel } from "./levels";

export type Hint = { id: string; safe: boolean };

/**
 * A hint is only called safe when it is proven: either the level's remaining
 * witness still wins from the current position, or the pick completes a triple
 * already in the tray. Anything weaker is returned as a plain suggestion.
 *
 * Generation is deterministic, so the witness is recomputed on demand and never
 * has to be stored with the save.
 */
export function hintFor(state: GameState, level: number): Hint | null {
  if (state.status !== "playing") return null;

  const remaining = generateLevel(level).solution.filter((id) =>
    state.board.some((tile) => tile.id === id),
  );

  if (remaining.length) {
    let node = state;
    let replayable = true;
    for (const id of remaining) {
      const move = planMove(node, id);
      if (!move) {
        replayable = false;
        break;
      }
      node = move.result;
    }
    if (replayable && node.status === "won") {
      const first = remaining.find((id) => isSelectable(state, id));
      if (first) return { id: first, safe: true };
    }
  }

  // Completing a trio strictly shrinks the tray, so it can never hurt. The
  // same check covers a rainbow finishing a pair.
  const completing = state.board.find(
    (tile) =>
      isSelectable(state, tile.id) &&
      findTriple([...state.tray, tile], tile.id, state.board).length > 0,
  );
  if (completing) return { id: completing.id, safe: true };

  // Otherwise suggest progress toward a group, and finally anything legal.
  const progressing = state.board.find(
    (tile) =>
      isSelectable(state, tile.id) &&
      state.tray.some((held) => held.kind === tile.kind),
  );
  const fallback =
    progressing ?? state.board.find((tile) => isSelectable(state, tile.id));

  return fallback ? { id: fallback.id, safe: false } : null;
}
