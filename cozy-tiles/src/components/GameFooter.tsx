import { BOOSTERS, BOOSTER_ORDER, hintPrice, price, unavailable } from "../session";
import type { Session } from "../session";
import type { Booster } from "../boosters";
import { LABELS } from "../symbols";
import { TileIcon } from "./TileIcon";

type GameFooterProps = {
  session: Session;
  capacity: number;
  busy: boolean;
  notice: string;
  statusText: string;
  /** The collect goal or moves left, or empty for a plain clear. */
  objective: string;
  /** The goal's target symbol and progress, for the objective chip's pips. */
  goalTarget: string | null;
  goalRemaining: number;
  goalNeeded: number;
  /** True when a pick limit is nearly spent. */
  urgent: boolean;
  onRequest: (action: Booster) => void;
  onHint: () => void;
  onRestart: () => void;
};

/**
 * Progress pips for a collect goal: filled for tiles already banked, hollow
 * for the ones still to collect. Coloured pips plus a count means the state
 * never hangs on colour alone.
 */
function GoalPips({
  remaining,
  needed,
}: {
  remaining: number;
  needed: number;
}) {
  const collected = Math.max(0, needed - remaining);
  return (
    <span className="goal-pips" aria-hidden="true">
      {Array.from({ length: needed }, (_, index) => (
        <span
          key={index}
          className={`goal-pip ${index < collected ? "goal-pip-on" : ""}`}
        />
      ))}
    </span>
  );
}

export function GameFooter({
  session,
  capacity,
  busy,
  notice,
  statusText,
  objective,
  goalTarget,
  goalRemaining,
  goalNeeded,
  urgent,
  onRequest,
  onHint,
  onRestart,
}: GameFooterProps) {
  return (
    <footer className="game-footer">
      <div className="booster-bar">
        {objective && (
          <p className={`objective-chip ${urgent ? "objective-chip-urgent" : ""}`}>
            <span className="objective-text">{objective}</span>
            {goalTarget !== null && (
              <span
                className="objective-icon"
                data-kind={goalTarget}
                title={LABELS[goalTarget as keyof typeof LABELS]}
              >
                <TileIcon
                  kind={goalTarget as Parameters<typeof TileIcon>[0]["kind"]}
                />
              </span>
            )}
            {goalTarget !== null && goalNeeded > 0 && goalNeeded <= 8 && (
              <GoalPips remaining={goalRemaining} needed={goalNeeded} />
            )}
          </p>
        )}

        {/* Offered only until the upgrade is owned for good. */}
        {capacity === 6 && !session.seventhSlot && (
          <button
            className="booster-button"
            onClick={() => onRequest("slot")}
            disabled={busy || Boolean(unavailable(session, "slot"))}
          >
            + Slot{" "}
            <span className="booster-price">
              {price(session, "slot") || "Free"}
            </span>
          </button>
        )}
        {BOOSTER_ORDER.map((action) => (
          <button
            key={action}
            className="booster-button"
            onClick={() => onRequest(action)}
            disabled={busy || Boolean(unavailable(session, action))}
          >
            {BOOSTERS[action].label}
            <span className="booster-price">
              {price(session, action) || "Free"}
            </span>
          </button>
        ))}
        {/* Hints are guidance, not an economy: always free in Relaxed Mode. */}
        <button className="booster-button" onClick={onHint} disabled={busy}>
          Hint
          <span className="booster-price">{hintPrice(session) || "Free"}</span>
        </button>
      </div>

      <p role="status" aria-live="polite">
        {notice || statusText}
      </p>

      {/* Deliberately kept away from the purchasable actions. */}
      <div className="footer-secondary">
        <button className="quiet-button" onClick={onRestart} disabled={busy}>
          Restart level
        </button>
      </div>

      <span>No ads. No timer. Take your time.</span>
    </footer>
  );
}
