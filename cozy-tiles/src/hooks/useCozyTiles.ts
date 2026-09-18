import { useEffect, useRef, useState } from "react";
import { capacityOf } from "../game";
import { boardBounds, difficultyFor } from "../levels";
import {
  advanceSession,
  goToLevel,
  newSession,
  pick,
  price,
  purchase,
  rescue as rescueMove,
  rescueAvailable,
  restartSession,
  starsOf,
  unavailable,
  winsOnItsOwn,
} from "../session";
import type { Session, Settings } from "../session";
import { clearSession, decodeSession, loadSession, saveSession } from "../sessionStorage";
import { SAVE_KEY } from "../progress";
import { hintFor } from "../hints";
import { feedback } from "../feedback";
import type { Booster } from "../boosters";
import { animateFlight, wait } from "../flight";

const HINT_DURATION = 4000;

// All session state and the move/booster workflow, with no markup. Components
// stay presentational so they can be tested through the rendered game.
export function useCozyTiles() {
  const [loaded] = useState(() => loadSession());
  const [session, setSession] = useState(loaded.session);
  const [game, setGame] = useState(loaded.session.game);
  const [saveWarning, setSaveWarning] = useState(loaded.warning);
  const [layout, setLayout] = useState(() =>
    boardBounds(loaded.session.game.board),
  );
  const [pending, setPending] = useState<Booster | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [matchingIds, setMatchingIds] = useState<string[]>([]);
  const [hintId, setHintId] = useState<string | null>(null);

  // Synchronous lock: two rapid taps cannot start overlapping moves.
  const inputLocked = useRef(false);
  const slots = useRef<Array<HTMLDivElement | null>>([]);
  const latest = useRef(session);

  useEffect(() => {
    // Feedback must match restored settings immediately.
    feedback.configure(loaded.session.settings);
  }, [loaded.session.settings]);

  useEffect(() => () => feedback.silence(), []);

  useEffect(() => {
    if (!hintId) return;
    const timer = window.setTimeout(() => setHintId(null), HINT_DURATION);
    return () => window.clearTimeout(timer);
  }, [hintId]);

  useEffect(() => {
    latest.current = session;
  }, [session]);

  // Auto-advance replaces the win dialog with a short pause and a footer note.
  const autoAdvancing = winsOnItsOwn(session);
  useEffect(() => {
    if (!autoAdvancing) return;
    const timer = window.setTimeout(() => {
      const current = latest.current;
      const next = advanceSession(current);
      if (next === current) return;
      commit(next);
      resetView(next);
      setNotice(`Level ${current.level} cleared.`);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoAdvancing]);

  // A second tab (or a second installed window) must never be silently
  // overwritten. Adopt its save instead of writing back, which would loop.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SAVE_KEY || !event.newValue) return;
      if (inputLocked.current) return;
      try {
        const adopted = decodeSession(event.newValue);
        setSession(adopted);
        setGame(adopted.game);
        setLayout(boardBounds(adopted.game.board));
        setMatchingIds([]);
        setPending(null);
        setConfirmRestart(false);
        setHintId(null);
        feedback.configure(adopted.settings);
        setNotice("Progress updated from another tab.");
      } catch {
        // A save written by a newer version is not ours to read.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  function resetView(next: Session) {
    setLayout(boardBounds(next.game.board));
    setGame(next.game);
    setMatchingIds([]);
    setMovingId(null);
    setPending(null);
    setConfirmRestart(false);
    setHintId(null);
    setNotice("");
  }

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
    setHintId(null);
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
      else if (move.result.tray.length === capacityOf(move.result) - 1) {
        // One slot from losing: the cue that prevents most accidental losses.
        feedback.warn();
      }
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
    resetView(next);
  }

  function requestRestart() {
    if (inputLocked.current) return;
    // An untouched board has nothing to lose, so skip the confirmation.
    if (session.undo.length === 0 && capacityOf(session.game) === 6) {
      restart();
      return;
    }
    setConfirmRestart(true);
  }

  function advance() {
    if (inputLocked.current) return;
    const next = advanceSession(session);
    if (next === session) return;
    commit(next);
    resetView(next);
  }

  function selectLevel(level: number) {
    if (inputLocked.current) return;
    const next = goToLevel(session, level);
    if (!next) return;
    commit(next);
    resetView(next);
    setShowLevels(false);
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
    setHintId(null);
    if (action === "skip") setLayout(boardBounds(next.session.game.board));
    if (action === "slot") feedback.slot();
    else feedback.booster();
  }

  function rescue() {
    if (inputLocked.current) return;
    const next = rescueMove(session, session.revision);
    if (next.error) {
      setNotice(next.error);
      return;
    }
    commit(next.session);
    setGame(next.session.game);
    setHintId(null);
    feedback.slot();
  }

  function showHint() {
    if (inputLocked.current) return;
    const hint = hintFor(session.game, session.level);
    if (!hint) {
      setNotice("Nothing to suggest right now.");
      return;
    }
    setHintId(hint.id);
    setNotice(hint.safe ? "Highlighted: a safe pick." : "Highlighted: a suggested pick.");
    feedback.hint();
  }

  function updateSetting(key: keyof Settings, value: boolean) {
    const next = {
      ...session,
      settings: { ...session.settings, [key]: value },
      revision: session.revision + 1,
    };
    commit(next);
    feedback.configure(next.settings);
  }

  function resetProgress() {
    clearSession();
    // A fresh tutorial, keeping the player's audio and difficulty settings.
    const next = { ...newSession(1), settings: session.settings };
    commit(next);
    resetView(next);
    setShowSettings(false);
  }

  const difficulty = difficultyFor(session.level);
  const capacity = capacityOf(game);
  const lost = game.status === "lost";
  const canUndo = !unavailable(session, "undo");
  const canRescue = rescueAvailable(session);

  const statusText =
    game.status === "won"
      ? "Level complete!"
      : game.status === "lost"
        ? "Out of slots."
        : `${game.board.length} tiles remaining. ${game.tray.length} of ${capacity} tray slots used.`;

  return {
    session,
    game,
    saveWarning,
    layout,
    pending,
    confirmRestart,
    notice,
    showSettings,
    showLevels,
    busy,
    movingId,
    matchingIds,
    hintId,
    difficulty,
    capacity,
    autoAdvancing,
    lost,
    canUndo,
    canRescue,
    stars: starsOf(session),
    statusText,
    slots,
    selectTile,
    restart,
    requestRestart,
    advance,
    request,
    apply,
    rescue,
    showHint,
    updateSetting,
    resetProgress,
    selectLevel,
    dismissSaveWarning: () => setSaveWarning(""),
    openLevels: () => setShowLevels(true),
    closeLevels: () => setShowLevels(false),
    cancelPending: () => setPending(null),
    cancelRestart: () => setConfirmRestart(false),
    openSettings: () => setShowSettings(true),
    closeSettings: () => setShowSettings(false),
  };
}
