# Slice 5: fairness, accessibility, and depth

Two aims drove this slice: the best possible experience, and no ads. That second
aim settled one design question in particular — getting stuck must never be a
paywall.

## Run locally

From this directory:

- `npm test` — rules, levels, sessions, persistence, feedback, hints, chapters, and the rendered app.
- `npm run check` — TypeScript plus the full test suite.
- `npm run lint`, `npm run build` — static checks and the production/PWA build.

## Fairness

- **One free rescue per attempt.** Losing the tray no longer costs coins: the recovery dialog leads with *Free rescue — undo that pick*, and only then offers paid options. The rescue is spent once per attempt and returns on retry. Coins stay meaningful for optional help, not for undoing a loss.
- **Restart is confirmed and separated.** It used to sit in the same row as the purchasable boosters and fire instantly. It now lives below them and asks before discarding an attempt in progress. An untouched board still restarts immediately, because nothing is at stake.
- **The tray warns before it kills.** At one slot from full, the tray pulses, the caption says "one slot left", and a distinct tone plays. This matters because a full tray is the only loss condition in the game.
- **Hints are guidance, not economy.** The Hint button is always free and only claims *safe* when it can prove it: either the level's remaining witness still wins from the current position (verified by replaying it), or the pick completes a triple already in the tray. Anything weaker is labelled a suggestion. Generation is deterministic, so the witness is recomputed on demand and never stored.
- **Blocked tiles answer back.** They stay tappable with `aria-disabled` instead of `disabled`, so a mis-tap wobbles the tile and plays a soft tone instead of doing nothing. Assistive technology still hears "covered".

## Accessibility

- Every overlay now shares one modal shell: `role="dialog"`, `aria-modal`, a labelled heading, Escape to dismiss (only for dismissible dialogs), a focus trap, and focus returned to the button that opened it. The result screens previously were not dialogs at all, and Tab escaped behind the overlay.
- Tile labels became human: "Sun, available" instead of "Sun tile t0". Internal ids live on `data-tile-id` for tests. Tests target tiles by that attribute rather than by the accessible name.
- Typography moved to `rem` with OS text scaling enabled, and the 11px labels were raised. Unlike the previous fixed pixels, a device text-size setting now actually changes the type.
- Level-map state is no longer signalled by colour alone: completed levels carry a tick or their star count, locked levels carry a lock.
- Sound and vibration remain independent, persisted, and silent when unsupported.

## Layout and robustness

- **The board can no longer be clipped.** It keeps its exact aspect ratio (percentage-placed tiles distort otherwise), so instead of clamping height the width is capped by the height the screen actually has left, measured with a `ResizeObserver`. Verified in test: 100px of available height yields a 204px board for the level 1 layout.
- **An error boundary replaces the blank page.** A render error in an installed offline app used to leave nothing but white; it now offers a reload and says progress is safe.
- **Two tabs no longer clobber each other.** A `storage` event adopts the other tab's save instead of overwriting it, deliberately without writing back, which would loop. The footer says where the progress came from.
- **Reset progress** exists in Settings behind an explicit "cannot be undone" confirmation. Settings are kept; coins, levels, and stars start over.
- Offline and install chips: an install offer where the browser fires `beforeinstallprompt`, Share-sheet instructions on iOS which never fires it, and a reassurance line while offline.

## Depth past level 30

Difficulty used to plateau: every level from 31 upward shared one recipe. Now late levels cycle six recipes (36–48 tiles, 4–6 layers, 12–20 kinds) across six silhouettes — rectangle, arch, ring, cottage, heart, and diamond — while levels 1–30 keep their original curve and every eighth level stays gentle. Level 31 is unchanged.

The symbol set grew from sixteen to twenty-one: cloud, bell, honey, and acorn join the palette, so late recipes can ask for up to twenty distinct kinds, and the twenty-first is the rainbow described below.

**This required a generator bump.** `GENERATOR_VERSION` is now 3, because a saved board is only valid against the generator that produced it — and adding symbols changes the deterministic assignment even for levels whose recipe did not change. Saves from earlier generator versions are rejected with the existing visible warning and start fresh. That is the documented behaviour for changing layout or symbol assignment, and it is why the version is separate from the save schema.

## Rainbow tiles

The first new mechanic. A rainbow matches like a joker: it finishes any pair of a kind, a lone symbol plus two rainbows clears, and three rainbows clear as a plain triple. When a rainbow could complete more than one pair it is spent on the pair with the most tiles still on the board, then on the earliest symbol in palette order, so the same board always resolves the same way.

- **One rule, everywhere.** `findTriple` in `game.ts` is the only implementation of matching, and the engine, the save validator, the wand, and hints all call it. That is why they cannot drift apart.
- **Taught in place.** The rainbow has its own symbol, a warm sheen on both board and tray, and the instruction line changes to "Rainbow tiles finish any pair" only while one is in play.
- **Scheduled, not random.** Rainbows arrive as a whole triple — the first group of the witness — on every fourth level from 16, and as two triples from 60. Because a group of three rainbows is itself a legal triple, the level's witness keeps working and every level stays clearable.
- **Wand support.** The wand's same-kind pass cannot see a rainbow finishing a pair, so it gained that path explicitly. (Extended: a wand clear that would leave an unfinishable board is now refused — see `SLICE-9.md`.)
- **The witness only proves a level can be finished, not that every legal line stays finishable.** A free-choice rainbow can shift a symbol's count away from a multiple of three and strand its leftovers. Since `SLICE-9.md`, cleaning up a stranding pick is refused.
- **A stronger save invariant replaced a weaker one.** The validator no longer requires every kind to be a multiple of three (a rainbow breaks that), and instead requires the tile total to be a multiple of three and the tray to hold no completable triple. The second check is strictly better: it catches a match that was never resolved.

## Progression and feedback

- Chapters are named (Meadow, Orchard, Cottage, …), cycling with a numeral so they stay unique across a billion levels. The top bar shows the chapter, so the level map has meaning on the main screen.
- **Star ratings** per level: three stars for a clean run, two when help was taken before any loss, one when a loss forced the help. Ratings are remembered per level and shown on the level map. Replaying for a worse result never lowers a rating, and replays still never pay the reward twice.
- Auto-advance (Settings) skips the win dialog for players who do not want the interruption, showing a brief footer note instead of losing the reward or the rating.
- Feel: press states on tiles, a hint pulse, a mis-tap wobble, a tray alert, dialogs that pop in, and two new tones (hint, warning). All of it respects `prefers-reduced-motion`.

## Saving

Save schema version 3 adds rescue, attempt, booster-use, and star tracking. Version 2 saves migrate automatically by defaulting the new fields, and version 1 saves still migrate through the Slice 2 replay path. New invariants are validated — at most one rescue per attempt, ratings only for reachable levels, ratings within 1–3 — while benign counters such as attempts are deliberately lenient so a save is never discarded over bookkeeping. `autoAdvance` is optional so saves written before it still load.

## Tests

317 tests pass. New coverage: rescue rules and stale confirmations, star ratings including the replay-keeps-the-best case, version 2 migration, rejected impossible ratings and rescue counts, hint safety (following safe hints must actually finish the level, and hints are never illegal), chapter naming, error-boundary recovery, the board clamp, auto-advance on and off, install and offline chips, the rewritten app flows through the modal shell, and for rainbows: every matching shape, the deterministic choice between two available pairs, holding a rainbow with nothing to finish, losing when a rainbow fills the last slot, wand support, safe hints through a rainbow level, a mid-game rainbow save round-trip, the new unresolved-triple rejection, and that all twenty-one symbols are actually reachable.

## Not done yet

Deliberately left for later, in rough value order: a date-seeded daily puzzle with a streak; a local stats/achievements screen; the next tile mechanics (frozen tiles that need two picks, and goal or pick-limited levels); Zen or endless mode; multi-tab conflict resolution beyond adoption; CI and Playwright coverage for install, offline, and update flows; and string extraction for localisation. The first two are built in `SLICE-6.md`.

## Phone acceptance checks

1. Play a level on the smallest phone available: the board, footer, and booster bar must all stay on screen with no clipping.
2. Lose a level and take the free rescue; confirm no coins are spent and the rescue is gone after a retry.
3. Tap a blocked tile: it should wobble with a soft tone, not sit silent.
4. Ask for a hint: the highlighted tile must be pickable, and the countdown clear itself.
5. Reach the last tray slot and confirm the pulse and warning tone are noticeable without being alarming.
6. Set the OS text size to its largest setting and check nothing overflows its button or card.
7. Open the app in two tabs, move in one, and confirm the other adopts it rather than fighting.
8. Win a level with auto-advance on and off; confirm the reward and rating behave identically.
9. Play levels 31–36 and confirm the boards look and feel different from each other.
10. Play level 16: the three rainbows must be visibly special, finish a pair you are holding, and read clearly at real size. Check the twenty-one symbols are all distinguishable on a phone screen.
11. Turn on a screen reader and confirm dialogs trap focus, Escape closes them, and focus returns.

Automated tests do not substitute for browser interaction, phone performance, or installed-PWA testing.
