import { Modal } from "./Modal";

type ConfirmPromptProps = {
  titleId: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmPrompt({
  titleId,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmPromptProps) {
  return (
    <Modal titleId={titleId} onClose={onCancel}>
      <h2 id={titleId} data-autofocus tabIndex={-1}>
        {title}
      </h2>
      <p className="confirm-description">{description}</p>
      <div className="recovery-row">
        <button className="primary-button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="quiet-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
