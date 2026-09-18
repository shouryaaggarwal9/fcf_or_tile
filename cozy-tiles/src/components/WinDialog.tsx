import { DAILY_COINS } from "../daily";
import { MAX_LEVEL } from "../levels";
import { LABELS } from "../symbols";
import { WIN_COINS } from "../session";
import type { Session } from "../session";
import { Modal } from "./Modal";

type WinDialogProps = {
  session: Session;
  stars: number;
  onAdvance: () => void;
  onRestart: () => void;
  onExitDaily: () => void;
};

export function WinDialog({
  session,
  stars,
  onAdvance,
  onRestart,
  onExitDaily,
}: WinDialogProps) {
  if (session.daily) {
    const played = session.lastDaily === session.daily;
    return (
      <Modal titleId="result-title">
        <div className="result-symbol" aria-hidden="true">
          ✦
        </div>
        <h2 id="result-title" data-autofocus tabIndex={-1}>
          Daily complete!
        </h2>
        <p>
          {played
            ? `A ${session.dailyStreak}-day streak. +${DAILY_COINS} coins earned.`
            : "You cleared today's puzzle."}
        </p>
        <button className="primary-button" onClick={onExitDaily}>
          Back to level {session.level}
        </button>
        <button className="quiet-button" onClick={onRestart}>
          Replay today's puzzle
        </button>
      </Modal>
    );
  }

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
        {session.game.goal
          ? `Goal reached — you collected every ${LABELS[session.game.goal.target]}.`
          : session.game.limit
            ? `Cleared with ${Math.max(0, session.game.limit.limit - session.game.limit.used)} moves to spare.`
            : "You cleared every tile."}{" "}
        +{session.rewardedThrough >= session.level ? WIN_COINS : 0} coins earned.
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
