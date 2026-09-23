import { useState } from "react";
import { chapterLevels, chapterOf } from "../levels";
import { chapterName } from "../chapters";
import { MAX_STARS, unlockedThrough } from "../session";
import type { Session } from "../session";
import { Modal } from "./Modal";

type LevelMapProps = {
  session: Session;
  onSelect: (level: number) => void;
  onClose: () => void;
};

function NodeGlyph({ locked, completed }: { locked: boolean; completed: boolean }) {
  if (locked) return <span aria-hidden="true">🔒</span>;
  if (completed) return <span aria-hidden="true">✓</span>;
  return null;
}

export function LevelMap({ session, onSelect, onClose }: LevelMapProps) {
  const [chapter, setChapter] = useState(() => chapterOf(session.level));
  const unlocked = unlockedThrough(session);
  const lastChapter = chapterOf(unlocked);
  const levels = chapterLevels(chapter);
  const cleared = session.rewardedThrough;

  return (
    <Modal titleId="levels-title" onClose={onClose}>
      <h2 id="levels-title" data-autofocus tabIndex={-1}>
        {chapterName(chapter)}
      </h2>
      <p className="confirm-description">
        {cleared === 0
          ? "Clear level 1 to unlock the next one. Every level can be replayed."
          : `${cleared} level${cleared === 1 ? "" : "s"} cleared. Replays stay free and never pay the completion reward twice.`}
      </p>

      <div className="chapter-nav">
        <button
          className="quiet-button"
          aria-label="Previous levels"
          disabled={chapter <= 1}
          onClick={() => setChapter(chapter - 1)}
        >
          ◀
        </button>
        <span className="chapter-label">
          Levels {levels[0]}–{levels[levels.length - 1]}
        </span>
        <button
          className="quiet-button"
          aria-label="Next levels"
          disabled={chapter >= lastChapter}
          onClick={() => setChapter(chapter + 1)}
        >
          ▶
        </button>
      </div>

      <ol className="level-grid">
        {levels.map((level) => {
          const locked = level > unlocked;
          const completed = !locked && level <= cleared;
          const current = level === session.level;
          const rating = session.stars[level] ?? 0;

          return (
            <li key={level}>
              <button
                className={`level-node level-node-${
                  locked ? "locked" : completed ? "completed" : "open"
                } ${current ? "level-node-current" : ""}`}
                disabled={locked}
                aria-current={current ? "step" : undefined}
                aria-label={`Level ${level}, ${
                  locked ? "locked" : completed ? "completed" : "unlocked"
                }${rating ? `, ${rating} of ${MAX_STARS} stars` : ""}`}
                onClick={() => onSelect(level)}
              >
                <span className="level-node-number">{level}</span>
                <span className="level-node-mark">
                  {rating > 0 ? "★".repeat(rating) : <NodeGlyph locked={locked} completed={completed} />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button className="primary-button" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}
