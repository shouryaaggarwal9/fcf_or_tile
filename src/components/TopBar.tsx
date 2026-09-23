type TopBarProps = {
  level: number;
  chapter: string;
  coins: number;
  gentle: boolean;
  busy: boolean;
  /** Increments right after a banked win, to pulse the coin chip once. */
  coinPulse?: number;
  /** Non-null while a daily puzzle is the active board. */
  daily: string | null;
  streak: number;
  onOpenDaily: () => void;
  onOpenLevels: () => void;
  onOpenSettings: () => void;
};

export function TopBar({
  level,
  chapter,
  coins,
  gentle,
  busy,
  coinPulse = 0,
  daily,
  streak,
  onOpenDaily,
  onOpenLevels,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{daily ? "Daily puzzle" : chapter}</p>
        <h1>{daily ? "Daily puzzle" : `Level ${level}`}</h1>
        {daily ? (
          <span className="level-note">
            {streak > 0 ? `${streak}-day streak` : "A new puzzle today"}
          </span>
        ) : (
          gentle && <span className="level-note">A gentle puzzle</span>
        )}
      </div>

      <div className="topbar-controls">
        {/* The key re-runs the pop animation on each pulse without keeping
            extra state; 0 means "never pulsed", so the first paint is calm. */}
        <span
          key={coinPulse}
          className={`coin-chip ${coinPulse > 0 ? "coin-chip-pulse" : ""}`}
          aria-label={`${coins} coins`}
        >
          <span aria-hidden="true">◎</span>{" "}
          {new Intl.NumberFormat().format(coins)}
        </span>
        {streak > 0 && !daily && (
          <span className="streak-chip" aria-label={`${streak}-day daily streak`}>
            {streak}-day
          </span>
        )}
        <button
          className="quiet-button"
          onClick={onOpenDaily}
          aria-haspopup="dialog"
          disabled={busy}
        >
          Daily
        </button>
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
