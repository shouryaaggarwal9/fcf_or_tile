import { BOOSTERS, BOOSTER_ORDER, price, unavailable } from "../session";
import type { Session } from "../session";
import type { Booster } from "../boosters";

type GameFooterProps = {
  session: Session;
  capacity: number;
  busy: boolean;
  notice: string;
  statusText: string;
  /** The collect goal or moves left, or empty for a plain clear. */
  objective: string;
  /** True when a pick limit is nearly spent. */
  urgent: boolean;
  onRequest: (action: Booster) => void;
  onHint: () => void;
  onRestart: () => void;
};

export function GameFooter({
  session,
  capacity,
  busy,
  notice,
  statusText,
  objective,
  urgent,
  onRequest,
  onHint,
  onRestart,
}: GameFooterProps) {
  return (
    <footer className="game-footer">
      <div className="booster-bar">
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
        {/* Hints are guidance, not an economy: always free. */}
        <button className="booster-button" onClick={onHint} disabled={busy}>
          Hint
          <span className="booster-price">Free</span>
        </button>
      </div>

      {objective && (
        <p className={`goal-line ${urgent ? "goal-line-warning" : ""}`}>
          {objective}
        </p>
      )}

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
