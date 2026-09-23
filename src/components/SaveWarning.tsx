type SaveWarningProps = { message: string; onDismiss: () => void };

export function SaveWarning({ message, onDismiss }: SaveWarningProps) {
  return (
    <div className="save-warning" role="status">
      <span aria-hidden="true">⚠</span>
      <p>{message}</p>
      <button className="quiet-button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
