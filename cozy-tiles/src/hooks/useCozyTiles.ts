import { useEffect, useRef, useState } from "react";
import { capacityOf } from "../game";
import { boardBounds, difficultyFor } from "../levels";
import {
  advanceSession,
  exitDaily,
  goToLevel,
  newSession,
  payForHint,
  pick,
  price,
  purchase,
  rescue as rescueMove,
  rescueAvailable,
  restartSession,
  startDaily,
  starsOf,
  unavailable,
  winsOnItsOwn,
} from "../session";
import type { Session, Settings } from "../session";
import { clearSession, decodeSession, loadSession, saveSession } from "../sessionStorage";
import { SAVE_KEY } from "../progress";
import { activeDailyStreak, dailyClearedToday, dailyDateOf } from "../daily";
import { hintFor, hintKindOf } from "../hints";
import { LABELS } from "../symbols";
import { feedback } from "../feedback";
import type { Booster } from "../boosters";
import { animateFlight } from "../flight";
import type { TileKind } from "../game";
import { flyCoins, spawnBurst } from "../celebrate";
import { ComboCounter } from "../combo";

// Motion preference probed on demand, for effects outside the pick flow.
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const [showDaily, setShowDaily] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [matchingIds, setMatchingIds] = useState<string[]>([]);
  const [hintId, setHintId] = useState<string | null>(null);
  // The symbol the hint points at, so the board can ghost its two partners.
  const [hintKind, setHintKind] = useState<TileKind | null>(null);
  // The goal kind whose tile was just collected, for a one-shot board pulse.
  const [goalHit, setGoalHit] = useState<TileKind | null>(null);
  // Celebration layer: the live consecutive-clear chain, and a counter that
  // re-pulses the coin chip after each banked win.
  const [combo, setCombo] = useState(0);
  const [coinPulse, setCoinPulse] = useState(0);
  const comboCounter = useRef(new ComboCounter());
  // What the current win actually paid. Session state alone cannot tell a
  // first clear from a replay (both arrive with the level already banked), so
  // the win dialog is told honestly: 20, or a replay note.
  const winPaid = useRef<number | null>(null);

  // Synchronous lock: two rapid taps cannot start overlapping moves.
  const inputLocked = useRef(false);
  const slots = useRef<Array<HTMLDivElement | null>>([]);
  const latest = useRef(session);

  useEffect(() => {
    // Feedback must match restored settings immediately.
    feedback.configure(loaded.session.settings);
  }, [loaded.session.settings]);

  useEffect(() => () => feedback.silence(), []);

  // A hint shows the way, so it stays until the player acts on it. Only a
  // real event — picking, help of any kind, a new hint, a fresh board — clears
  // it. There is no idle timer: payers are never punished for thinking.

  // Auto-scroll a hinted tile into view. Deep boards can place the paid-for
  // tile below the fold; the advice must arrive, not just exist. Engines
  // without scrollIntoView (jsdom) simply skip the scroll.
  useEffect(() => {
    if (!hintId) return;
    const node = document.querySelector<HTMLElement>(`[data-tile-id="${hintId}"]`);
    if (typeof node?.scrollIntoView !== "function") return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hintId]);

  // The goal pulse is a beat, not a state: it fades itself out.
  useEffect(() => {
    if (!goalHit) return;
    const timer = window.setTimeout(() => setGoalHit(null), 600);
    return () => window.clearTimeout(timer);
  }, [goalHit]);

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
    // A first clear pays exactly once, on the pick that wins the level.
    if (next.game.status === "won" && winPaid.current === null) {
      winPaid.current = next.coins - latest.current.coins;
    }
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
    setHintKind(null);
    setGoalHit(null);
    setNotice("");
    setCombo(0);
    comboCounter.current.reset();
    winPaid.current = null;
  }

  async function selectTile(id: string, source: HTMLButtonElement) {
    if (inputLocked.current) return;

    const picked = pick(session, id);
    if (!picked) return;
    // An accepted pick replaces any refusal explanation still on the status line.
    setNotice("");
    const { move, session: next } = picked;
    // Goal progress as it stood before this pick, to detect a fresh collect.
    const collectedBefore = session.game.goal?.collected ?? 0;

    inputLocked.current = true;
    // Persist the accepted move before animation; interruption resumes its result.
    commit(next);
    setBusy(true);
    setMovingId(id);
    setHintId(null);
    setHintKind(null);
    setGoalHit(null);
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
      // A goal tile leaving the board pulses its kind on the board, so the
      // objective chip visibly ticks down at the moment it happens — whether
      // or not that pick also completed a triple.
      if (move.arrival.goal && move.arrival.goal.collected > collectedBefore) {
        setGoalHit(move.arrival.goal.target);
      }

      if (move.matchingIds.length > 0) {
        setMatchingIds(move.matchingIds);
        feedback.match();

        // Celebration layer: a particle pop where the triple cleared, and a
        // rising note whenever the pick extends a chain of consecutive clears.
        const slot = slots.current[move.insertionIndex];
        if (slot) {
          const rect = slot.getBoundingClientRect();
          spawnBurst(
            { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            "match",
            reducedMotion,
          );
        }
        const streak = comboCounter.current.onMatch();
        setCombo(streak);
        if (streak > 1) feedback.combo(streak);
      } else if (comboCounter.current.onPick()) {
        // Two idle picks in a row broke the chain; drop the chip.
        setCombo(0);
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
    if (session.undo.length === 0 && !session.usedBooster) {
      restart();
      return;
    }
    setConfirmRestart(true);
  }

  // When the pick that banks a win pays coins, they fly into the balance chip.
  function advance() {
    if (inputLocked.current) return;
    const next = advanceSession(session);
    if (next === session) return;
    if (winPaid.current !== null && winPaid.current > 0) {
      flyCoins(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        Math.min(5, Math.ceil(winPaid.current / 4)),
        prefersReducedMotion(),
      );
    }
    commit(next);
    // Back on the board after a banked win: draw the eye to the new balance.
    setCoinPulse((count) => count + 1);
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
    setHintKind(null);
    // Help of any kind resets the clean-skill match chain.
    comboCounter.current.reset();
    setCombo(0);
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
    setHintKind(null);
    comboCounter.current.reset();
    setCombo(0);
    feedback.slot();
  }

  function showHint() {
    if (inputLocked.current) return;
    const hint = hintFor(session.game, session.level, session.daily);
    if (!hint) {
      setNotice("Nothing to suggest right now.");
      return;
    }
    const paid = payForHint(session);
    if (paid.error) {
      setNotice(paid.error);
      return;
    }
    commit(paid.session);
    setHintId(hint.id);
    setHintKind(hintKindOf(paid.session.game, hint));
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

  // A refused tap explains itself through the status line.
  function blocked(reason: "covered" | "locked") {
    if (reason === "locked") {
      setNotice("That tile is guarded — collect its key tile first.");
    } else {
      setNotice("");
    }
  }

  function resetProgress() {
    clearSession();
    // A fresh tutorial, keeping the player's audio and difficulty settings.
    const next = { ...newSession(1), settings: session.settings };
    commit(next);
    resetView(next);
    setShowSettings(false);
  }

  function playDaily() {
    if (inputLocked.current) return;
    const next = startDaily(session, dailyDateOf());
    if (next !== session) {
      commit(next);
      resetView(next);
    }
    setShowDaily(false);
  }

  function leaveDaily() {
    if (inputLocked.current) return;
    const next = exitDaily(session);
    commit(next);
    resetView(next);
    setShowDaily(false);
  }

  const difficulty = difficultyFor(session.level);
  const capacity = capacityOf(game);
  const lost = game.status === "lost";
  const canUndo = !unavailable(session, "undo");
  const canRescue = rescueAvailable(session);
  const today = dailyDateOf();
  const streak = activeDailyStreak(session.lastDaily, session.dailyStreak, today);
  const clearedToday = dailyClearedToday(session.lastDaily, today);

  const movesLeft = game.limit ? Math.max(0, game.limit.limit - game.limit.used) : null;
  const objective = game.goal
    ? `Collect ${Math.max(0, game.goal.needed - game.goal.collected)} more ${LABELS[game.goal.target]}`
    : movesLeft !== null
      ? `${movesLeft} move${movesLeft === 1 ? "" : "s"} left`
      : "";
  const urgent = movesLeft !== null && movesLeft <= 2;
  const lostByMoves = game.status === "lost" && movesLeft === 0 && game.tray.length < capacity;

  const statusText =
    game.status === "won"
      ? "Level complete!"
      : game.status === "lost"
        ? lostByMoves
          ? "Out of moves."
          : "Out of slots."
        : `${objective ? `${objective} · ` : ""}${game.board.length} tiles remaining. ${game.tray.length} of ${capacity} tray slots used.`;

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
    hintKind,
    goalHit,
    combo,
    coinPulse,
    difficulty,
    capacity,
    autoAdvancing,
    lost,
    canUndo,
    canRescue,
    stars: starsOf(session),
    winPaid: winPaid.current,
    statusText,
    objective,
    urgent,
    lostByMoves,
    slots,
    today,
    streak,
    clearedToday,
    showDaily,
    showStats,
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
    playDaily,
    leaveDaily,
    blocked,
    dismissSaveWarning: () => setSaveWarning(""),
    openLevels: () => setShowLevels(true),
    closeLevels: () => setShowLevels(false),
    cancelPending: () => setPending(null),
    cancelRestart: () => setConfirmRestart(false),
    openSettings: () => setShowSettings(true),
    closeSettings: () => setShowSettings(false),
    // Only ever one auxiliary dialog at a time, so Escape cannot close two.
    openDaily: () => {
      setShowStats(false);
      setShowDaily(true);
    },
    closeDaily: () => setShowDaily(false),
    openStats: () => {
      setShowSettings(false);
      setShowStats(true);
    },
    closeStats: () => setShowStats(false),
  };
}
