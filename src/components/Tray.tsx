import type { RefObject } from "react";
import type { GameState } from "../game";
import { LABELS } from "../symbols";
import { TileIcon } from "./TileIcon";

type TrayProps = {
  game: GameState;
  capacity: number;
  matchingIds: string[];
  slots: RefObject<Array<HTMLDivElement | null>>;
};

export function Tray({ game, capacity, matchingIds, slots }: TrayProps) {
  // One free slot left means the next unmatched pick loses the level.
  const danger =
    game.status === "playing" && game.tray.length >= capacity - 1;

  return (
    <section
      className={`tray-panel ${danger ? "tray-panel-danger" : ""}`}
      aria-label="Collection tray"
    >
      <div className="tray-caption">
        <span>Match three of a kind</span>
        <span>
          {game.tray.length} / {capacity}
          {danger ? " · one slot left" : ""}
        </span>
      </div>

      <div className={`tray ${capacity === 7 ? "tray-seven" : ""}`}>
        {Array.from({ length: capacity }, (_, index) => {
          const tile = game.tray[index];
          const seventh = index === capacity - 1 && capacity === 7;

          return (
            <div
              key={index}
              className={`tray-slot ${seventh ? "tray-slot-bonus" : ""}`}
              ref={(element) => {
                slots.current[index] = element;
              }}
              aria-label={
                tile
                  ? `Slot ${index + 1}: ${LABELS[tile.kind]}`
                  : `Slot ${index + 1}: empty`
              }
            >
              {tile && (
                <div
                  key={tile.id}
                  data-kind={tile.kind}
                  className={`tile tray-tile ${
                    matchingIds.includes(tile.id) ? "matching" : ""
                  }`}
                >
                  <TileIcon kind={tile.kind} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
