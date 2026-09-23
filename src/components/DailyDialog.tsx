import { DAILY_COINS } from "../daily";
import type { Session } from "../session";
import { Modal } from "./Modal";

type DailyDialogProps = {
  session: Session;
  today: string;
  streak: number;
  clearedToday: boolean;
  onPlay: () => void;
  onLeave: () => void;
  onClose: () => void;
};

function readableDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
}

export function DailyDialog({
  session,
  today,
  streak,
  clearedToday,
  onPlay,
  onLeave,
  onClose,
}: DailyDialogProps) {
  const playing = session.daily === today;

  return (
    <Modal titleId="daily-title" onClose={onClose}>
      <h2 id="daily-title" data-autofocus tabIndex={-1}>
        Daily puzzle
      </h2>
      <p className="confirm-description">{readableDate(today)}</p>
      <p>
        {clearedToday
          ? "You have already cleared today's puzzle. Come back tomorrow for a new one."
          : `A fresh puzzle every day, the same for everyone. Clear it to earn ${DAILY_COINS} coins.`}
      </p>
      <p className="confirm-price">
        {streak > 0
          ? `${streak}-day streak · best ${session.dailyBestStreak}`
          : "No streak yet — clear today to start one."}
      </p>
      <div className="recovery-row">
        <button className="primary-button" onClick={onPlay}>
          {playing
            ? "Keep playing today's puzzle"
            : clearedToday
              ? "Replay today's puzzle"
              : "Play today's puzzle"}
        </button>
        {/* Only offered while a daily is actually on the board. */}
        {session.daily !== null && (
          <button className="quiet-button" onClick={onLeave}>
            Back to level {session.level}
          </button>
        )}
        <button className="quiet-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="confirm-description">
        {session.dailiesCleared} daily
        {session.dailiesCleared === 1 ? " puzzle" : " puzzles"} cleared. Best streak{" "}
        {session.dailyBestStreak}.
      </p>
    </Modal>
  );
}
