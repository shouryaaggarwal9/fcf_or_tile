import { BOOSTERS } from "../session";
import type { Session } from "../session";
import type { Booster } from "../boosters";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  action: Booster;
  session: Session;
  free?: boolean;
  onApply: (action: Booster) => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  action,
  session,
  free = false,
  onApply,
  onCancel,
}: ConfirmDialogProps) {
  const cost = free ? 0 : BOOSTERS[action].price;

  return (
    <Modal titleId="confirm-title" onClose={onCancel}>
      <h2 id="confirm-title" data-autofocus tabIndex={-1}>
        {BOOSTERS[action].label}
      </h2>
      <p className="confirm-description">{BOOSTERS[action].description}</p>
      <p className="confirm-price">
        {free
          ? "Free rescue — no coins needed."
          : session.settings.relaxed
            ? "Free in Relaxed Mode"
            : `Costs ${BOOSTERS[action].price} coins · balance ${session.coins}`}
      </p>
      <div className="recovery-row">
        <button className="primary-button" onClick={() => onApply(action)}>
          {cost === 0
            ? "Activate"
            : `Spend ${BOOSTERS[action].price}`}
        </button>
        <button className="quiet-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
