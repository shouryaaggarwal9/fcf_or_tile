import { Board } from "./components/Board";
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
import { WinDialog } from "./components/WinDialog";
import { chapterName } from "./chapters";
import { useCozyTiles } from "./hooks/useCozyTiles";
import { chapterOf } from "./levels";

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
        daily={tiles.session.daily}
        streak={tiles.streak}
        onOpenDaily={tiles.openDaily}
        onOpenLevels={tiles.openLevels}
        onOpenSettings={tiles.openSettings}
      />

      <StatusChips />

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
        onSelect={tiles.selectTile}
      />

      <GameFooter
        session={tiles.session}
        capacity={tiles.capacity}
        busy={tiles.busy}
        notice={tiles.notice}
        statusText={tiles.statusText}
        objective={tiles.objective}
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

      {tiles.game.status === "won" && !tiles.autoAdvancing && (
        <WinDialog
          session={tiles.session}
          stars={tiles.stars}
          onAdvance={tiles.advance}
          onRestart={tiles.restart}
          onExitDaily={tiles.leaveDaily}
        />
      )}

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
