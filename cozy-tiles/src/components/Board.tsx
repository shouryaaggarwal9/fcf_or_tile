import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { isLocked, isSelectable, TILE_FACE } from "../game";
import type { GameState, Tile } from "../game";
import type { BoardBounds } from "../levels";
import { LABELS } from "../symbols";
import { feedback } from "../feedback";
import { TileIcon } from "./TileIcon";

type BoardProps = {
  game: GameState;
  layout: BoardBounds;
  busy: boolean;
  movingId: string | null;
  hintId: string | null;
  /** The symbol a paid hint points at; its board twins ghost alongside it. */
  hintKind: string | null;
  /** The collect goal's target symbol, so goal tiles stand out on the board. */
  goalTarget: string | null;
  /** The goal kind whose tile was just collected, for a one-shot pulse. */
  goalHit: string | null;
  onSelect: (id: string, source: HTMLButtonElement) => void;
  /** Called when a tap is refused, so the game can explain why. */
  onBlocked: (reason: "covered" | "locked") => void;
};

/**
 * How many tiles sit on top of this one, counting every higher-layer tile
 * whose face overlaps it. Used only to shade by burial depth, never to gate
 * picks — and because it counts the live board, piles lighten as you dig.
 */
const OVERLAP_EPSILON = 0.01;

function overlaps(a: Tile, b: Tile): boolean {
  return (
    Math.abs(a.x - b.x) < TILE_FACE - OVERLAP_EPSILON &&
    Math.abs(a.y - b.y) < TILE_FACE - OVERLAP_EPSILON
  );
}

function depthOf(game: GameState, tile: Tile): number {
  let depth = 0;
  for (const other of game.board) {
    if (other.layer > tile.layer && overlaps(tile, other)) depth++;
  }
  return Math.min(3, depth);
}

/**
 * The board's depth cue, in one class: buried tiles sink backwards (they
 * darken, desaturate, and blur a touch), while every tile casts a soft shadow
 * downward with a fixed light direction, so upper layers visibly float above
 * what they cover. Deeper tiles also sit a little lower, giving piles a
 * physical offset instead of a flat grid.
 */
function depthClass(game: GameState, tile: Tile): string {
  const depth = depthOf(game, tile);
  return depth > 0 ? `buried buried-${depth}` : "";
}

export function Board({
  game,
  layout,
  busy,
  movingId,
  hintId,
  hintKind,
  goalTarget,
  goalHit,
  onSelect,
  onBlocked,
}: BoardProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [widthLimit, setWidthLimit] = useState(Number.POSITIVE_INFINITY);
  const [deniedId, setDeniedId] = useState<string | null>(null);

  // The board must keep its exact aspect ratio, or the percentage-placed tiles
  // distort. Clamping the width to the height the screen actually has left is
  // therefore the only safe way to stop a tall stack from being clipped.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const ratio = layout.width / layout.height;
    const measure = () => {
      const height = node.clientHeight;
      setWidthLimit(height > 0 ? height * ratio : Number.POSITIVE_INFINITY);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (!deniedId) return;
    const timer = window.setTimeout(() => setDeniedId(null), 420);
    return () => window.clearTimeout(timer);
  }, [deniedId]);

  function deny(id: string, reason: "covered" | "locked") {
    setDeniedId(id);
    feedback.deny();
    onBlocked(reason);
  }

  const hasLocks = game.board.some((tile) => isLocked(game, tile.id));
  const instruction = hasLocks
    ? "Only uncovered tiles can be picked. Key tiles unlock the tiles they guard."
    : "Only uncovered tiles can be picked.";

  return (
    <section className="play-area" aria-label="Tile board">
      <p className="instruction">{instruction}</p>

      <div className="board-frame" ref={frame}>
        <div
          className="board"
          style={{
            aspectRatio: `${layout.width} / ${layout.height}`,
            maxWidth: `${Math.min(layout.width * 88, widthLimit)}px`,
          }}
        >
          {game.board.map((tile) => {
            const selectable = isSelectable(game, tile.id);
            const locked = !selectable && isLocked(game, tile.id);
            const block = selectable ? null : locked ? "locked" : "covered";

            const style = {
              left: `${(tile.x / layout.width) * 100}%`,
              top: `${(tile.y / layout.height) * 100}%`,
              width: `${(TILE_FACE / layout.width) * 100}%`,
              height: `${(TILE_FACE / layout.height) * 100}%`,
              zIndex: tile.layer + 1,
              // Layer scale comes from the inline custom property. Depth cues
              // (sinking, y-offset) come from the burial classes instead, so
              // the stack reads as a pile rather than a flat grid.
              "--tile-scale": 1 + tile.layer * 0.02,
            } as CSSProperties;

            const goalTile = goalTarget !== null && tile.kind === goalTarget;
            const ghostTile =
              hintKind !== null && tile.kind === hintKind && tile.id !== hintId;
            // Locked tiles are dimmed by their gate, not by the pile above.
            const depth = locked ? "lock-dim" : depthClass(game, tile);

            return (
              <button
                key={tile.id}
                data-tile-id={tile.id}
                data-kind={tile.kind}
                style={style}
                className={`tile board-tile ${block ? "blocked" : ""} ${
                  depth
                } ${movingId === tile.id ? "leaving" : ""} ${
                  hintId === tile.id ? "hinted" : ""
                } ${ghostTile ? "hint-ghost" : ""} ${
                  goalTile ? "goal-target" : ""
                } ${goalHit !== null && tile.kind === goalHit ? "goal-hit" : ""} ${
                  deniedId === tile.id ? "denied" : ""
                }`}
                // Blocked tiles stay tappable so a mis-tap can teach the rule;
                // aria-disabled keeps that honest for assistive tech.
                disabled={busy}
                aria-disabled={block !== null}
                aria-label={`${LABELS[tile.kind]}, ${
                  block === "locked" ? "locked" : block === "covered" ? "covered" : "available"
                }`}
                onClick={(event) => {
                  if (!block) onSelect(tile.id, event.currentTarget);
                  else deny(tile.id, block);
                }}
              >
                <TileIcon kind={tile.kind} />
                {locked && (
                  <span className="tile-lock" aria-hidden="true">
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path
                        d="M4.5 7V5.2a3.5 3.5 0 0 1 7 0V7"
                        fill="none"
                        stroke="#8a5a12"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <rect
                        x="2.8"
                        y="7"
                        width="10.4"
                        height="6.6"
                        rx="1.6"
                        fill="#f2b64c"
                        stroke="#8a5a12"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
