import { MAX_LEVEL } from "../levels";
import { WIN_COINS } from "../session";
import type { Session } from "../session";
import { Modal } from "./Modal";

type WinDialogProps = {
  session: Session;
  stars: number;
  onAdvance: () => void;
  onRestart: () => void;
};

export function WinDialog({
  session,
  stars,
  onAdvance,
  onRestart,
}: WinDialogProps) {
  return (
    <Modal titleId="result-title">
      <div className="result-symbol" aria-hidden="true">
        ✦
      </div>
      <h2 id="result-title" data-autofocus tabIndex={-1}>
        Lovely matching!
      </h2>
      <p className="star-row" aria-label={`${stars} of 3 stars`}>
        {"★".repeat(stars)}
        {"☆".repeat(3 - stars)}
      </p>
      <p>
        You cleared every tile. +
        {session.rewardedThrough >= session.level ? WIN_COINS : 0} coins earned.
      </p>
      <button
        className="primary-button"
        onClick={session.level < MAX_LEVEL ? onAdvance : onRestart}
      >
        {session.level < MAX_LEVEL ? "Next level" : "Try again"}
      </button>
    </Modal>
  );
}
