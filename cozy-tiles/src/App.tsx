import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { capacityOf, isSelectable, TILE_FACE } from "./game";
import type { TileKind } from "./game";
import { boardBounds, difficultyFor, MAX_LEVEL } from "./levels";
import {
  advanceSession,
  BOOSTERS,
  BOOSTER_ORDER,
  pick,
  price,
  purchase,
  restartSession,
  unavailable,
  WIN_COINS,
} from "./session";
import type { Session } from "./session";
import { loadSession, saveSession } from "./sessionStorage";
import { feedback } from "./feedback";
import type { Booster } from "./boosters";
import { EXTRA_SYMBOLS, LABELS } from "./symbols";

// root folder changed in vercel

// Simple original SVG symbols.
// Unlike emoji, these look the same across devices.
function TileIcon({ kind }: { kind: TileKind }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      {EXTRA_SYMBOLS[kind] && (
        <path
          d={EXTRA_SYMBOLS[kind].path}
          fill={EXTRA_SYMBOLS[kind].color}
          stroke="#35465b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "sun" && (
        <g stroke="#a95f0b" strokeWidth="3" strokeLinecap="round">
          <path d="M32 5v7M32 52v7M5 32h7M52 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5" />
          <circle cx="32" cy="32" r="15" fill="#ffc847" />
          <path d="M24 25c2-3 5-4 8-4" stroke="#fff3bd" />
        </g>
      )}

      {kind === "leaf" && (
        <g stroke="#28643a" strokeWidth="3" strokeLinecap="round">
          <path d="M13 43C8 23 28 10 52 12c2 25-13 43-32 35Z" fill="#79cc62" />
          <path d="M12 54 43 23M25 41V29M33 33h10" />
        </g>
      )}

      {kind === "drop" && (
        <g stroke="#08769a" strokeWidth="3" strokeLinecap="round">
          <path
            d="M32 7C25 19 13 30 13 40a19 19 0 0 0 38 0C51 30 39 19 32 7Z"
            fill="#40c6ed"
          />
          <path d="M23 33c-3 4-4 8-2 12" stroke="#e0faff" />
        </g>
      )}

      {kind === "berry" && (
        <g strokeWidth="3" strokeLinecap="round">
          <path
            d="M23 31 32 12l10 20M32 13c9-8 17-4 18 1-7 5-13 4-18-1Z"
            stroke="#32623b"
            fill="#78bb66"
          />
          <circle cx="22" cy="41" r="13" fill="#e65c83" stroke="#933251" />
          <circle cx="43" cy="42" r="12" fill="#d94b79" stroke="#933251" />
          <path d="m18 36 3-2M39 37l3-2" stroke="#ffd6e2" />
        </g>
      )}
    </svg>
  );
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function animateFlight(
  source: HTMLElement,
  destination: HTMLElement,
  reducedMotion: boolean,
) {
  if (reducedMotion) return;

  const from = source.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLButtonElement;

  ghost.setAttribute("aria-hidden", "true");
  ghost.removeAttribute("id");
  ghost.tabIndex = -1;
  ghost.disabled = true;

  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    transformOrigin: "top left",
    opacity: "1",
    filter: "none",
    animation: "none",
  });

  document.body.appendChild(ghost);

  try {
    const animation = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${to.left - from.left}px, ${
            to.top - from.top
          }px) scale(${to.width / from.width}, ${to.height / from.height})`,
        },
      ],
      {
        duration: 190,
        easing: "cubic-bezier(.2,.7,.25,1)",
        fill: "forwards",
      },
    );

    await animation.finished;
  } finally {
    ghost.remove();
  }
}

export default function App() {
  const [loaded] = useState(() => loadSession());
  const [session, setSession] = useState(loaded.session);
  const [game, setGame] = useState(loaded.session.game);
  const [saveWarning, setSaveWarning] = useState(loaded.warning);
  const [layout, setLayout] = useState(() =>
    boardBounds(loaded.session.game.board),
  );
  const [pending, setPending] = useState<Booster | null>(null);
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const difficulty = difficultyFor(session.level);
  const capacity = capacityOf(game);
  const lost = game.status === "lost";
  const canUndo = !unavailable(session, "undo");

  function commit(next: Session) {
    const saved = saveSession(next);
    setSaveWarning(
      saved
        ? ""
        : "Progress could not be saved. Keep this page open; browser storage may be full or disabled.",
    );
    setSession(next);
    feedback.configure(next.settings);
  }
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [matchingIds, setMatchingIds] = useState<string[]>([]);

  // Synchronous lock: two rapid taps cannot start overlapping moves.
  const inputLocked = useRef(false);
  const slots = useRef<Array<HTMLDivElement | null>>([]);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    feedback.configure(loaded.session.settings);
    // Runs once per mount; feedback must match restored settings immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (game.status !== "playing") {
      resultHeading.current?.focus();
    }
  }, [game.status]);

  useEffect(() => () => feedback.silence(), []);

  async function selectTile(id: string, source: HTMLButtonElement) {
    if (inputLocked.current) return;

    const picked = pick(session, id);
    if (!picked) return;
    const { move, session: next } = picked;

    inputLocked.current = true;
    // Persist the accepted move before animation; interruption resumes its result.
    commit(next);
    setBusy(true);
    setMovingId(id);
    feedback.pick();

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    try {
      const destination = slots.current[move.insertionIndex];

      if (destination) {
        try {
          await animateFlight(source, destination, reducedMotion);
        } catch {
          // If animation fails, still resolve the valid game move.
        }
      }

      setGame(move.arrival);
      setMovingId(null);

      if (move.matchingIds.length > 0) {
        setMatchingIds(move.matchingIds);
        feedback.match();

        if (!reducedMotion) {
          await wait(180);
        }
      }

      setMatchingIds([]);
      setGame(move.result);
      if (move.result.status === "lost") feedback.fail();
      if (move.result.status === "won") feedback.win();
    } finally {
      setMovingId(null);
      setBusy(false);
      inputLocked.current = false;
    }
  }

  function restart() {
    if (inputLocked.current) return;

    const next = restartSession(session);
    commit(next);
    setGame(next.game);
    setMatchingIds([]);
    setMovingId(null);
    setPending(null);
    setNotice("");
  }

  function advance() {
    if (inputLocked.current) return;
    const next = advanceSession(session);
    if (next === session) return;
    commit(next);
    setLayout(boardBounds(next.game.board));
    setGame(next.game);
    setMatchingIds([]);
    setMovingId(null);
    setPending(null);
    setNotice("");
  }

  function request(action: Booster) {
    if (inputLocked.current) return;
    setNotice("");
    if (
      action === "slot" &&
      !unavailable(session, action) &&
      price(session, action) === 0
    ) {
      // Free (Relaxed Mode) activation needs no confirmation.
      apply(action);
      return;
    }
    setPending(action);
  }

  function apply(action: Booster) {
    const next = purchase(session, action, session.revision);
    setPending(null);
    if (next.error) {
      setNotice(next.error);
      return;
    }
    commit(next.session);
    setGame(next.session.game);
    if (action === "skip") setLayout(boardBounds(next.session.game.board));
    if (action === "slot") feedback.slot();
    else feedback.booster();
  }

  const statusText =
    game.status === "won"
      ? "Level complete!"
      : game.status === "lost"
        ? "Out of slots."
        : `${game.board.length} tiles remaining. ${
            game.tray.length
          } of ${capacity} tray slots used.`;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">COZY TILES</p>
          <h1>Level {session.level}</h1>
          {difficulty.gentle && (
            <span className="level-note">A gentle puzzle</span>
          )}
        </div>

        <div className="topbar-controls">
          <span className="coin-chip" aria-label={`${session.coins} coins`}>
            <span aria-hidden="true">◎</span> {session.coins}
          </span>
          <button
            className="quiet-button"
            onClick={() => setShowSettings(true)}
            aria-haspopup="dialog"
            disabled={busy}
          >
            Settings
          </button>
        </div>
      </header>

      <section className="tray-panel" aria-label="Collection tray">
        <div className="tray-caption">
          <span>Match three of a kind</span>
          <span>
            {game.tray.length} / {capacity}
          </span>
        </div>

        <div className={`tray ${capacity === 7 ? "tray-seven" : ""}`}>
          {Array.from({ length: capacity }, (_, index) => {
            const tile = game.tray[index];
            const seventh = index === capacity - 1 && capacity === 7;

            return (
              <div
                key={index}
                className={`tray-slot ${seventh ? "tray-slot-bonus" : ""}`}
                ref={(element) => {
                  slots.current[index] = element;
                }}
                aria-label={
                  tile
                    ? `Slot ${index + 1}: ${LABELS[tile.kind]}`
                    : `Slot ${index + 1}: empty`
                }
              >
                {tile && (
                  <div
                    key={tile.id}
                    className={`tile tray-tile ${
                      matchingIds.includes(tile.id) ? "matching" : ""
                    }`}
                  >
                    <TileIcon kind={tile.kind} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="play-area" aria-label="Tile board">
        <p className="instruction">Only uncovered tiles can be picked.</p>

        <div
          className="board"
          style={{
            aspectRatio: `${layout.width} / ${layout.height}`,
            maxWidth: `${layout.width * 88}px`,
          }}
        >
          {game.board.map((tile) => {
            const selectable = isSelectable(game, tile.id);

            const style: CSSProperties = {
              left: `${(tile.x / layout.width) * 100}%`,
              top: `${(tile.y / layout.height) * 100}%`,
              width: `${(TILE_FACE / layout.width) * 100}%`,
              height: `${(TILE_FACE / layout.height) * 100}%`,
              zIndex: tile.layer + 1,
            };

            return (
              <button
                key={tile.id}
                style={style}
                className={`tile board-tile ${
                  !selectable ? "blocked" : ""
                } ${movingId === tile.id ? "leaving" : ""}`}
                disabled={!selectable || busy}
                aria-label={`${LABELS[tile.kind]} tile ${
                  tile.id
                }${selectable ? "" : ", blocked"}`}
                onClick={(event) =>
                  void selectTile(tile.id, event.currentTarget)
                }
              >
                <TileIcon kind={tile.kind} />
              </button>
            );
          })}
        </div>
      </section>

      <footer className="game-footer">
        <div className="booster-bar">
          {capacity === 6 && (
            <button
              className="booster-button"
              onClick={() => request("slot")}
              disabled={busy || Boolean(unavailable(session, "slot"))}
            >
              + Slot{" "}
              <span className="booster-price">
                {price(session, "slot") || "Free"}
              </span>
            </button>
          )}
          {BOOSTER_ORDER.map((action) => (
            <button
              key={action}
              className="booster-button"
              onClick={() => request(action)}
              disabled={busy || Boolean(unavailable(session, action))}
            >
              {BOOSTERS[action].label}
              <span className="booster-price">
                {price(session, action) || "Free"}
              </span>
            </button>
          ))}
          <button className="booster-button" onClick={restart} disabled={busy}>
            Restart
          </button>
        </div>
        <p role="status" aria-live="polite">
          {notice || statusText}
        </p>
        <span>No ads. No timer. Take your time.</span>
      </footer>

      {lost && !pending && (
        <div className="result-overlay">
          <section className="result-card" aria-labelledby="result-title">
            <div className="result-symbol" aria-hidden="true">
              ↻
            </div>
            <h2 id="result-title" ref={resultHeading} tabIndex={-1}>
              Out of slots
            </h2>
            <p>Try clearing a triple before collecting other symbols.</p>
            <div className="recovery-row">
              {capacity === 6 && !unavailable(session, "slot") && (
                <button
                  className="primary-button"
                  onClick={() => request("slot")}
                >
                  Open seventh slot
                </button>
              )}
              {canUndo && (
                <button
                  className="primary-button"
                  onClick={() => request("undo")}
                >
                  Undo last pick
                </button>
              )}
              {!unavailable(session, "wand") && (
                <button
                  className="primary-button"
                  onClick={() => request("wand")}
                >
                  Use wand
                </button>
              )}
              <button className="primary-button" onClick={restart}>
                Try again
              </button>
            </div>
          </section>
        </div>
      )}

      {saveWarning && (
        <div className="save-warning" role="status">
          <span aria-hidden="true">⚠</span>
          <p>{saveWarning}</p>
          <button className="quiet-button" onClick={() => setSaveWarning("")}>
            Dismiss
          </button>
        </div>
      )}

      {pending && (
        <div
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <section className="result-card">
            <h2 id="confirm-title">{BOOSTERS[pending].label}</h2>
            <p className="confirm-description">
              {BOOSTERS[pending].description}
            </p>
            <p className="confirm-price">
              {session.settings.relaxed
                ? "Free in Relaxed Mode"
                : `Costs ${BOOSTERS[pending].price} coins · balance ${session.coins}`}
            </p>
            <div className="recovery-row">
              <button className="primary-button" onClick={() => apply(pending)}>
                {session.settings.relaxed
                  ? "Activate"
                  : `Spend ${BOOSTERS[pending].price}`}
              </button>
              <button className="quiet-button" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div
          className="result-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <section className="result-card">
            <h2 id="settings-title">Settings</h2>
            {(
              [
                ["sound", "Sound effects"],
                ["vibration", "Vibration"],
                ["relaxed", "Relaxed Mode"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="setting-row">
                <input
                  type="checkbox"
                  checked={session.settings[key]}
                  onChange={(event) => {
                    const next = {
                      ...session,
                      settings: {
                        ...session.settings,
                        [key]: event.target.checked,
                      },
                      revision: session.revision + 1,
                    };
                    commit(next);
                    feedback.configure(next.settings);
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
            <p className="confirm-description">
              Relaxed Mode makes boosters and the extra slot free. Matching
              rules stay the same.
            </p>
            <button
              className="primary-button"
              onClick={() => setShowSettings(false)}
            >
              Close
            </button>
          </section>
        </div>
      )}

      {game.status === "won" && (
        <div className="result-overlay">
          <section className="result-card" aria-labelledby="result-title">
            <div className="result-symbol" aria-hidden="true">
              ✦
            </div>
            <h2 id="result-title" ref={resultHeading} tabIndex={-1}>
              Lovely matching!
            </h2>
            <p>
              You cleared every tile. +
              {session.rewardedThrough >= session.level ? WIN_COINS : 0} coins
              earned.
            </p>
            <button
              className="primary-button"
              onClick={session.level < MAX_LEVEL ? advance : restart}
            >
              {session.level < MAX_LEVEL ? "Next level" : "Try again"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
