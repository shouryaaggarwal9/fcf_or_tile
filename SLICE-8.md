# Slice 8: the seventh slot is a permanent unlock

One focused change to the economy. The seventh slot used to be bought *per
attempt*: it stayed open across app closes but a retry or the next level returned
the tray to six. It is now a one-time, permanent upgrade.

## Behaviour

- Buying the seventh slot marks the save with `seventhSlot: true`. From then on
  every attempt, retry, later level, and daily puzzle opens with seven slots —
  including across app closes.
- **The option never returns.** Once owned, the `+ Slot` button disappears, and
  the purchase is refused as "already open" if it is somehow requested again.
- Nothing else about the slot changes: it still costs 40 coins, is free in
  Relaxed Mode, and gives its opening bonus of four stars' worth of safety.
- Progress reset remains the only way to give it up, because reset is a full
  wipe (coins, levels, stars, and the slot).

## Implementation

The flag lives on the session, not the game, because it outlives any single
board. A small `withSlots(game, seventhSlot)` helper applies it wherever a board
is created — `restartSession`, `startDaily`, `exitDaily`, and the purchase
itself — so every generated or restored board agrees. Undo restores already pass
the current capacity explicitly, so older frames stay valid.

`requestRestart` no longer treats the tray capacity as something at stake; an
untouched board is still restarted without a confirmation prompt.

## Saving

Save schema version 6 adds `seventhSlot`. Older saves are honoured: when the
flag is absent, an attempt whose active board already has seven slots keeps them
permanently, so a player who had bought the slot does not lose it. The flag is
validated as a boolean when present.

## Tests

385 tests pass. Updated and new coverage: the slot opens once with coins and
survives a retry, a win-and-advance, and a reload; the option is refused
afterwards; and the rendered app buys it once, shows seven slots, and never
offers `+ Slot` again even after a remount.

## Phone acceptance checks

1. Buy the seventh slot and confirm seven slots appear.
2. Retry the level, play the next level, and reopen the app: seven slots each
   time, and no `+ Slot` button anywhere.
3. Confirm the free rescue, undo, and the rest of the booster row still behave.
