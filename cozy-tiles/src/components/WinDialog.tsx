import { useEffect, useRef } from "react";
import { DAILY_COINS } from "../daily";
import { MAX_LEVEL } from "../levels";
import { LABELS } from "../symbols";
import type { Session } from "../session";
import { spawnBurst } from "../celebrate";
import { feedback } from "../feedback";
import { Modal } from "./Modal";

// The card floats above the overlay, so the finale bursts from just behind it.
const BURST_Y_OFFSET = 120;

/** One star, popped in with a stagger. */
function Star({ delay, filled }: { delay: number; filled: boolean }) {
  return (
    <span
      className={`star ${filled ? "star-earned" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden="true"
    >
      {filled ? "★" : "☆"}
    </span>
  );
}

/** The daily result: no stars, no coins beyond the streak line, no finale. */
export function DailyWinDialog({
  session,
  onRestart,
  onExitDaily,
}: {
  session: Session;
  onRestart: () => void;
  onExitDaily: () => void;
}) {
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

export function WinDialog({
  session,
  stars,
  winPaid,
  onAdvance,
  onRestart,
}: {
  session: Session;
  stars: number;
  /** Coins the winning pick actually banked; null on a loaded/replayed win. */
  winPaid: number | null;
  onAdvance: () => void;
  onRestart: () => void;
}) {
  // Read once per render: the celebration adapts to the OS motion setting.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The finale fires once per mount of the win moment.
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (reducedMotion) return;
    spawnBurst(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 - BURST_Y_OFFSET },
      "finale",
      reducedMotion,
    );
    for (let index = 0; index < stars; index++) {
      window.setTimeout(() => feedback.stars(), 350 + index * 350);
    }
  }, [reducedMotion, stars]);

  return (
    <Modal titleId="result-title">
      <div className="result-symbol" aria-hidden="true">
        ✦
      </div>
      <h2 id="result-title" data-autofocus tabIndex={-1}>
        Lovely matching!
      </h2>
      <p className="star-row" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((index) => (
          <Star key={index} delay={200 + index * 350} filled={index < stars} />
        ))}
      </p>
      <p>
        {session.game.goal
          ? `Goal reached — you collected every ${LABELS[session.game.goal.target]}.`
          : session.game.limit
            ? `Cleared with ${Math.max(0, session.game.limit.limit - session.game.limit.used)} moves to spare.`
            : "You cleared every tile."}{" "}
        {/* Say what really happened: the first clear banks coins, a replay is
            free practice. winPaid is null whenever the win was loaded from a
            save or already banked, which is exactly the replay case. */}
        {winPaid !== null && winPaid > 0
          ? `+${winPaid} coins earned.`
          : "A replay — coins stay banked from your first clear."}
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
