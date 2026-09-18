type UpdatePromptProps = {
  onRefresh: () => void;
  onDismiss: () => void;
};

// A non-modal notice: the current version stays playable until the player
// chooses to reload. Every accepted move is saved before it animates, so
// reloading never loses progress.
export function UpdatePrompt({ onRefresh, onDismiss }: UpdatePromptProps) {
  return (
    <div className="update-prompt" role="status">
      <p>A new version of Cozy Tiles is ready.</p>
      <div className="update-actions">
        <button className="primary-button" onClick={onRefresh}>
          Refresh
        </button>
        <button className="quiet-button" onClick={onDismiss}>
          Later
        </button>
      </div>
    </div>
  );
}
