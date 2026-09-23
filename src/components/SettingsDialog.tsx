import { useState } from "react";
import type { Session, Settings } from "../session";
import { Modal } from "./Modal";

type SettingsDialogProps = {
  session: Session;
  onChange: (key: keyof Settings, value: boolean) => void;
  onReset: () => void;
  onOpenStats: () => void;
  onClose: () => void;
};

export function SettingsDialog({
  session,
  onChange,
  onReset,
  onOpenStats,
  onClose,
}: SettingsDialogProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <Modal titleId="settings-title" onClose={onClose}>
      <h2 id="settings-title" data-autofocus tabIndex={-1}>
        Settings
      </h2>
      {(
        [
          ["sound", "Sound effects"],
          ["vibration", "Vibration"],
          ["relaxed", "Relaxed Mode"],
          ["autoAdvance", "Auto-advance after a win"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="setting-row">
          <input
            type="checkbox"
            checked={session.settings[key]}
            onChange={(event) => onChange(key, event.target.checked)}
          />
          <span>{label}</span>
        </label>
      ))}
      <p className="confirm-description">
        Relaxed Mode makes boosters and the extra slot free. Matching rules stay
        the same.
      </p>

      {confirmingReset ? (
        <>
          <p className="confirm-price">
            Erase all progress on this device? Coins, cleared levels, and
            settings reset to a fresh tutorial. This cannot be undone.
          </p>
          <div className="recovery-row">
            <button className="primary-button" onClick={onReset}>
              Erase everything
            </button>
            <button
              className="quiet-button"
              onClick={() => setConfirmingReset(false)}
            >
              Keep my progress
            </button>
          </div>
        </>
      ) : (
        <div className="recovery-row">
          <button className="quiet-button" onClick={onOpenStats}>
            Stats & achievements
          </button>
          <button
            className="quiet-button"
            onClick={() => setConfirmingReset(true)}
          >
            Reset progress
          </button>
          <button className="primary-button" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Modal>
  );
}
