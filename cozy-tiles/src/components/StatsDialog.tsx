import { ACHIEVEMENTS, totalStars } from "../achievements";
import type { Session } from "../session";
import { Modal } from "./Modal";

type StatsDialogProps = {
  session: Session;
  streak: number;
  onOpenDaily: () => void;
  onClose: () => void;
};

export function StatsDialog({
  session,
  streak,
  onOpenDaily,
  onClose,
}: StatsDialogProps) {
  const cleared = session.rewardedThrough;

  return (
    <Modal titleId="stats-title" onClose={onClose}>
      <h2 id="stats-title" data-autofocus tabIndex={-1}>
        Stats & achievements
      </h2>

      <dl className="stats-grid">
        <div>
          <dt>Levels cleared</dt>
          <dd>{cleared}</dd>
        </div>
        <div>
          <dt>Stars collected</dt>
          <dd>{totalStars(session)}</dd>
        </div>
        <div>
          <dt>Coins</dt>
          <dd>{session.coins}</dd>
        </div>
        <div>
          <dt>Daily streak</dt>
          <dd>{streak}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{session.dailyBestStreak}</dd>
        </div>
        <div>
          <dt>Dailies cleared</dt>
          <dd>{session.dailiesCleared}</dd>
        </div>
      </dl>

      <h3 className="stats-heading">Achievements</h3>
      <ul className="achievement-list">
        {ACHIEVEMENTS.map((achievement) => {
          const earned = achievement.earned(session);
          return (
            <li
              key={achievement.id}
              className={`achievement ${earned ? "achievement-earned" : ""}`}
              aria-label={`${achievement.label}: ${earned ? "earned" : "not earned"}`}
            >
              <span className="achievement-mark" aria-hidden="true">
                {earned ? "★" : "☆"}
              </span>
              <span className="achievement-text">
                <strong>{achievement.label}</strong>
                <span className="achievement-description">
                  {achievement.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="recovery-row">
        <button className="quiet-button" onClick={onOpenDaily}>
          Daily puzzle
        </button>
        <button className="primary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
