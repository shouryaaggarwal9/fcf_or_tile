import { Board } from "./components/Board";
import { ComboChip } from "./components/ComboChip";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ConfirmPrompt } from "./components/ConfirmPrompt";
import { DailyDialog } from "./components/DailyDialog";
import { GameFooter } from "./components/GameFooter";
import { LevelMap } from "./components/LevelMap";
import { LostDialog } from "./components/LostDialog";
import { PwaUpdate } from "./components/PwaUpdate";
import { SaveWarning } from "./components/SaveWarning";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatsDialog } from "./components/StatsDialog";
import { StatusChips } from "./components/StatusChips";
import { TopBar } from "./components/TopBar";
import { Tray } from "./components/Tray";
import { DailyWinDialog, WinDialog } from "./components/WinDialog";
import { chapterName } from "./chapters";
import { useCozyTiles } from "./hooks/useCozyTiles";
import { chapterOf } from "./levels";

// commit comment

export default function App() {
  const tiles = useCozyTiles();

  return (
    <main className="game-shell">
      <TopBar
        level={tiles.session.level}
        chapter={chapterName(chapterOf(tiles.session.level))}
        coins={tiles.session.coins}
        gentle={tiles.difficulty.gentle}
        busy={tiles.busy}
        coinPulse={tiles.coinPulse}
        daily={tiles.session.daily}
        streak={tiles.streak}
        onOpenDaily={tiles.openDaily}
        onOpenLevels={tiles.openLevels}
        onOpenSettings={tiles.openSettings}
      />

      <StatusChips />

      <ComboChip streak={tiles.combo} />

      <Tray
        game={tiles.game}
        capacity={tiles.capacity}
        matchingIds={tiles.matchingIds}
        slots={tiles.slots}
      />

      <Board
        game={tiles.game}
        layout={tiles.layout}
        busy={tiles.busy}
        movingId={tiles.movingId}
        hintId={tiles.hintId}
        hintKind={tiles.hintKind}
        goalTarget={tiles.game.goal?.target ?? null}
        goalHit={tiles.goalHit}
        onSelect={tiles.selectTile}
        onBlocked={tiles.blocked}
      />

      <GameFooter
        session={tiles.session}
        capacity={tiles.capacity}
        busy={tiles.busy}
        notice={tiles.notice}
        statusText={tiles.statusText}
        objective={tiles.objective}
        goalTarget={tiles.game.goal?.target ?? null}
        goalRemaining={Math.max(
          0,
          (tiles.game.goal?.needed ?? 0) - (tiles.game.goal?.collected ?? 0),
        )}
        goalNeeded={tiles.game.goal?.needed ?? 0}
        urgent={tiles.urgent}
        onRequest={tiles.request}
        onHint={tiles.showHint}
        onRestart={tiles.requestRestart}
      />

      {/* Result screens paint first so every dialog opened above them stacks on top. */}
      {tiles.lost && !tiles.pending && (
        <LostDialog
          session={tiles.session}
          capacity={tiles.capacity}
          canUndo={tiles.canUndo}
          rescueAvailable={tiles.canRescue}
          reason={tiles.lostByMoves ? "moves" : "slots"}
          onRequest={tiles.request}
          onRescue={tiles.rescue}
          onRestart={tiles.restart}
        />
      )}

      {tiles.game.status === "won" && !tiles.autoAdvancing &&
        (tiles.session.daily ? (
          <DailyWinDialog
            session={tiles.session}
            onRestart={tiles.restart}
            onExitDaily={tiles.leaveDaily}
          />
        ) : (
          <WinDialog
            session={tiles.session}
            stars={tiles.stars}
            winPaid={tiles.winPaid}
            onAdvance={tiles.advance}
            onRestart={tiles.restart}
          />
        ))}

      {tiles.saveWarning && (
        <SaveWarning
          message={tiles.saveWarning}
          onDismiss={tiles.dismissSaveWarning}
        />
      )}

      {tiles.pending && (
        <ConfirmDialog
          action={tiles.pending}
          session={tiles.session}
          onApply={tiles.apply}
          onCancel={tiles.cancelPending}
        />
      )}

      {tiles.confirmRestart && (
        <ConfirmPrompt
          titleId="restart-title"
          title="Restart level?"
          description="This clears your current board, tray, and undo history for this attempt. Coins spent are not refunded."
          confirmLabel="Restart"
          onConfirm={tiles.restart}
          onCancel={tiles.cancelRestart}
        />
      )}

      {tiles.showSettings && (
        <SettingsDialog
          session={tiles.session}
          onChange={tiles.updateSetting}
          onReset={tiles.resetProgress}
          onOpenStats={tiles.openStats}
          onClose={tiles.closeSettings}
        />
      )}

      {tiles.showLevels && (
        <LevelMap
          session={tiles.session}
          onSelect={tiles.selectLevel}
          onClose={tiles.closeLevels}
        />
      )}

      {tiles.showDaily && (
        <DailyDialog
          session={tiles.session}
          today={tiles.today}
          streak={tiles.streak}
          clearedToday={tiles.clearedToday}
          onPlay={tiles.playDaily}
          onLeave={tiles.leaveDaily}
          onClose={tiles.closeDaily}
        />
      )}

      {tiles.showStats && (
        <StatsDialog
          session={tiles.session}
          streak={tiles.streak}
          onOpenDaily={tiles.openDaily}
          onClose={tiles.closeStats}
        />
      )}

      <PwaUpdate />
    </main>
  );
}
