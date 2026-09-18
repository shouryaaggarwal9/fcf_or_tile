# Slice 9: a pick can no longer strand the level

A correctness fix to the rainbow rules, found in play. Rainbows were added in
slice 7 to finish any pair, but a *free-choice* wildcard can also break the level:
spend one rainbow on a pair and that symbol's count is no longer a multiple of
three, so its leftovers may never match. On level 16 — the first rainbow level —
using a rainbow on two suns could leave a single sun that nothing could clear, and
the level became impossible to finish.

## Why it happened

The generator proves a level is winnable by replaying one witness: the canonical
path, where each group of three rainbows clears as its own triple. That proves a
level *can* be finished, not that every legal line *stays* finishable. Once the
player chooses which pair a rainbow completes, the tiles still in play are no
longer guaranteed to partition into legal triples.

The engine also had no way to notice. A pick is legal whenever it is uncovered,
so the stranding pick was accepted silently and the result was unwinnable.

## The fix: check the multiset

`isSolvable(state)` answers whether the tiles still in play can be partitioned
into legal triples at all, ignoring coverage:

- With no rainbow on the board or in the tray, every kind's count must be a
  multiple of three.
- With rainbows, a small dynamic program tracks the reachable numbers of rainbows
  spent, where a kind's count clears as whole triples, as pairs paired with one
  rainbow, or as singles paired with two. The remainder must clear as triples of
  rainbows.

`wouldStrand(state, id)` is then simply "this pick clears a triple and the result
is unsolvable". It is used in four places:

- **Ordinary picks** (`pick`): a stranding clear is refused exactly like a covered
  tile, and nothing moves.
- **The board** (`Board`): the tile renders as denied, is `aria-disabled`, and is
  announced as "would leave no way to finish". Because only a rainbow can shift a
  count off a multiple of three, the check is skipped entirely on ordinary levels.
- **The wand**: a clear that would strand the level is refused. The refusal is now
  named honestly — "That triple would leave tiles that can never match" — instead
  of claiming no triple exists.
- **Hints**: a hint is never suggested for a pick that would strand, so the
  lifeline points at the rescue rather than the trap.

Non-clearing picks and thaws are always allowed: they cannot change the multiset,
and being able to keep digging is what stops the guard from ever creating a
dead end of its own.

## Saves written before the guard

A save may already hold a stranded position. `recoverStranded` rewinds to the
newest playable frame in the undo history, so the player keeps their progress;
only when every frame is stranded does the attempt start over. It runs on load
and on multi-tab adoption.

An accepted pick also clears any refusal message still on the status line, so the
explanation never outlives the state it described.

## What is deliberately not done

- The guard does not search for a winning continuation; it checks a necessary
  condition (a partition into triples). It can accept a line that is still hard to
  finish, and it will never accept one that cannot be finished.
- Generator output is unchanged, so board layouts, seeds and `GENERATOR_VERSION`
  stay as they were. This is a rules fix, not a generator change.
- No new tile rule is introduced. Rainbows keep their current behaviour, including
  two rainbows finishing a lone tile.

## Tests

398 tests pass (up from 384 before the guard). New coverage in `fairness.test.ts`:
the multiset check itself (multiples of three, a lone tile rescued by two rainbows
but not one, an empty board), the refusal of the stranding pick with nothing
spent, the rescue still winning, the guard never blocking the intended solution on
any level (1 to the last, including frost, objectives, and rainbows), hints
pointing at the rescue, and both stranded save recoveries. The two rendered app
tests use a real level-16 position with a rainbow and a lone sun in hand: one sees
the sun denied and explained, watches the tray stay put, then makes a legal pick
to confirm the notice clears; the other loads a save that the old build had
already stranded and sees it rewound, with the explanation on screen.

Two older tests that built positions the engine can no longer reach were
tightened rather than deleted: the wand's tray-preferring case now uses a
finishable position, and the rainbow-pair wand case now ends the level.

## Phone acceptance checks

1. Reach level 16 and hold a rainbow with two suns. Picking a third sun must be
   refused with an explanation, not charged.
2. Confirm the remaining sun can still be cleared with a second rainbow, so the
   level stays winnable.
3. On an ordinary level, confirm no tile is ever denied for fairness reasons.
4. Try the wand on a rainbow level where the only triple would strand: it must say
   the triple would leave tiles that can never match and spend nothing.
5. Ask for a hint in that spot: it must point at the rescue, never at the trap.
