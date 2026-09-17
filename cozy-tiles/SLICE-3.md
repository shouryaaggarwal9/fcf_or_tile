# Slice 3: coins, boosters, seventh slot, sound and haptics

## Run locally

From this directory:

- `npm test` — rules, levels, sessions, and feedback tests.
- `npm run check` — TypeScript plus the full test suite.
- `npm run lint`, `npm run build` — static checks and the production/PWA build.
- `npm run dev -- --host 0.0.0.0` — phone testing on the same Wi-Fi.

## Economy

One-time welcome balance of 100 coins; the first completion of each level pays 20 coins exactly once (replays and refreshes never re-reward; skip pays nothing). Prices: undo 20, seventh slot 40, shuffle 40, wand 60, skip 80. Every spend requires an explicit confirmation showing the price and balance; unavailable actions and refused shuffles cost nothing. Relaxed Mode (Settings) makes all of them free. These values live in `src/boosters.ts` and `src/session.ts`.

## Seventh slot

Six slots by default. Purchasing the seventh opens it for the current attempt, including across app closes; retry or the next level returns to six. A triple landing in the last slot clears safely before any loss check. When the tray fills without a match, the recovery dialog offers the seventh slot, undo, wand, and free retry — only eligible options appear.

## Boosters (our rules, in this order)

- **Undo** (level 1): restores the board and tray from before the most recent ordinary pick, including a cleared triple. Repeated picks can be undone in order (history capped at 48). Does not reverse purchases or refund coins. Shuffle and wand clear undo history.
- **Shuffle** (level 3): rearranges board symbols only, preserving positions, symbol counts, and the tray. Accepted only after verifying a winning continuation against the current tray and capacity; otherwise nothing changes and nothing is charged. A board-only shuffle cannot fix a tray of mismatched singletons — use undo or the wand for that.
- **Wand** (level 4): removes one matching triple from the combined board and tray, preferring a kind already in the tray, and may collect covered tiles (a deliberate booster exception). Atomic — needs no spare slots.
- **Skip** (level 5): advances to the next level after confirmation, without a win reward.

## Sound and haptics

Web Audio tones and the Vibration API — no audio files, no new dependencies. Independent persisted toggles for sound and vibration; both fail silently when unsupported. Audio is created on first use (autoplay-safe); loading saved progress plays nothing. Feedback never blocks or alters game rules.

## Saving

Versioned snapshot saves (level, game state with capacity, coins, reward tracking, settings, undo history, shuffle count) replace Slice 2's move list. Existing Slice 2 saves migrate automatically: the same puzzle is rebuilt by replaying the recorded moves, and that level is marked already rewarded. Snapshots are validated against the generated level (positions, coverage, symbol counts, tray consistency); invalid saves show a warning and start fresh without deleting the stored value. Storage failures degrade to a visible warning while play continues. Cleared site data still removes progress; there is no cloud backup. Multiple tabs are not synchronized (last write wins).

## Phone acceptance checks

1. Win a level: coins increase once; the win dialog shows the reward.
2. Get stuck: confirm the recovery dialog offers the right options; buy the seventh slot and continue; confirm coins decrease once.
3. Close and reopen with the seventh slot open — it should still be open; retry, and it should be six again.
4. Undo through a cleared triple; verify the board, tray, and coins.
5. Shuffle: symbol counts stay identical; a failed shuffle changes nothing.
6. Wand on a full tray removes a triple and resumes play.
7. Toggle sound/vibration/Relaxed Mode in Settings; each persists across a refresh.
8. Pick, match, and fail sounds plus vibration feel right at real volume on the phone; audio starts after the first tap; nothing plays on app reopen.
9. Slice 2 saves (if any) open at the same level and puzzle after migration.
