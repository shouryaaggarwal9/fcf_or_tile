import { unavailable } from "../session";
import type { Session } from "../session";
import type { Booster } from "../boosters";
import { Modal } from "./Modal";

type LostDialogProps = {
  session: Session;
  capacity: number;
  canUndo: boolean;
  rescueAvailable: boolean;
  onRequest: (action: Booster) => void;
  onRescue: () => void;
  onRestart: () => void;
};

export function LostDialog({
  session,
  capacity,
  canUndo,
  rescueAvailable,
  onRequest,
  onRescue,
  onRestart,
}: LostDialogProps) {
  return (
    <Modal titleId="result-title">
      <div className="result-symbol" aria-hidden="true">
        ↻
      </div>
      <h2 id="result-title" data-autofocus tabIndex={-1}>
        Out of slots
      </h2>
      <p>Try clearing a triple before collecting other symbols.</p>
      <div className="recovery-row">
        {/* Free options come first: getting stuck should never cost coins. */}
        {rescueAvailable && (
          <button className="primary-button" onClick={onRescue}>
            Free rescue — undo that pick
          </button>
        )}
        <button className="primary-button" onClick={onRestart}>
          Try again
        </button>
        {capacity === 6 && !unavailable(session, "slot") && (
          <button className="quiet-button" onClick={() => onRequest("slot")}>
            Open seventh slot · {session.settings.relaxed ? "free" : "40"}
          </button>
        )}
        {canUndo && (
          <button className="quiet-button" onClick={() => onRequest("undo")}>
            Undo last pick · {session.settings.relaxed ? "free" : "20"}
          </button>
        )}
        {!unavailable(session, "wand") && (
          <button className="quiet-button" onClick={() => onRequest("wand")}>
            Use wand · {session.settings.relaxed ? "free" : "60"}
          </button>
        )}
      </div>
    </Modal>
  );
}
