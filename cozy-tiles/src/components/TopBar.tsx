type TopBarProps = {
  level: number;
  chapter: string;
  coins: number;
  gentle: boolean;
  busy: boolean;
  onOpenLevels: () => void;
  onOpenSettings: () => void;
};

export function TopBar({
  level,
  chapter,
  coins,
  gentle,
  busy,
  onOpenLevels,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{chapter}</p>
        <h1>Level {level}</h1>
        {gentle && <span className="level-note">A gentle puzzle</span>}
      </div>

      <div className="topbar-controls">
        <span className="coin-chip" aria-label={`${coins} coins`}>
          <span aria-hidden="true">◎</span>{" "}
          {new Intl.NumberFormat().format(coins)}
        </span>
        <button
          className="quiet-button"
          onClick={onOpenLevels}
          aria-haspopup="dialog"
          disabled={busy}
        >
          Levels
        </button>
        <button
          className="quiet-button"
          onClick={onOpenSettings}
          aria-haspopup="dialog"
          disabled={busy}
        >
          Settings
        </button>
      </div>
    </header>
  );
}
