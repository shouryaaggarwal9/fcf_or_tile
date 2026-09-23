// The live match streak chip. Purely celebratory: it never gates a rule, and
// it stays out of the accessibility tree as a status because the game's real
// state is always announced through the footer status line.
export function ComboChip({ streak }: { streak: number }) {
  if (streak < 2) return null;

  return (
    <div className="combo-chip" aria-hidden="true" key={streak}>
      <span className="combo-label">Combo</span>
      <span className="combo-count">×{streak}</span>
    </div>
  );
}
