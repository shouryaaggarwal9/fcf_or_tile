# Slice 7: frozen tiles and objective levels

This slice adds the two remaining tile-level mechanics named in `SLICE-5.md`:
**frozen tiles that need two picks**, and **goal- or pick-limited levels**. Both
are generated, validated, and saved by the existing machinery — the matching rule
still lives in exactly one place, and a board is still only valid against the
generator that produced it.

## Run locally

From this directory:

- `npm test` — everything: rules, levels, daily, sessions, persistence, hints,
  achievements, feedback, and the rendered app.
- `npm run check` — TypeScript plus the full test suite.
- `npm run lint`, `npm run build` — static checks and the production/PWA build.

## Frozen tiles

- **A frozen tile costs two picks.** The first pick thaws it in place — it stays
  on the board, still covering whatever is beneath it, and nothing reaches the
  tray. The second pick collects it normally. `planMove` returns a `thaw: true`
  move for the first pick, and `resolveState` never sees a tray change from it.
- **Frost only ever melts.** A thawed tile is byte-identical to one that never
  froze (the property is removed rather than zeroed), which is what lets a save
  round-trip exactly.
- **Solvability is preserved by construction.** Thawing changes no coverage, so
  the existing center-out removal order still holds: the witness inserts a thaw
  immediately before each frozen tile's collection. The generator replays that
  expanded witness through `planMove` and refuses to return a board that does not
  win.
- **Scheduled, never random.** `frozenFor(level)` is zero below level 11 and on
  every gentle level, then grows to a cap of six. Frost is chosen from its own
  seeded stream, so a level with no frost is unchanged.
- **It reads and sounds different.** A translucent glaze sits over the face
  (the symbol still shows through), the tile announces "frozen" to assistive
  tech, the instruction line explains the rule only while frost is in play, and a
  dedicated thaw tone plays. Thaws do not animate a flight.

## Objective levels

Two win conditions join the plain clear. They are mutually exclusive per level
and never appear on a gentle level or in the first tier.

- **Collect goals** (`goal`): win the moment a named symbol is fully gathered.
  The target is the palette symbol whose first group sits nearest the middle of
  the removal order, so the goal is a real shortcut — reachable before the board
  clears, but never from the opening picks.
- **Pick limits** (`limit`): clear the board within a fixed number of picks.
  Frost makes this matter, because a thaw spends a pick. The limit is the witness
  length plus generous slack, so the level is always beatable.
- **Precedence is deliberate.** A win outranks a loss: `resolveState` checks the
  goal first, then the tray, then the limit. A final pick that both meets the
  goal and fills the tray is a win.
- **The HUD says which.** The footer shows a goal line — "Collect 3 more Sun" or
  "12 moves left" — that pulses when two picks remain, and the status line reads
  it out. A lost attempt says "Out of moves" or "Out of slots" with the matching
  reason, and a win names the objective it met.

## Boosters and hints

- **The wand cannot strand a goal.** Removing a triple counts any target tiles it
  takes toward the collect goal, so the objective can never become unreachable.
- **Shuffle is refused on goal and pick-limited levels** — rearranging symbols
  cannot preserve a fixed objective or a spent move budget — with a message that
  says so rather than a misleading "no safe shuffle found".
- **Hints still prove safety.** The witness is recomputed on demand (now with
  thaws), and a pick is only called safe when replaying it actually finishes the
  level.

## Saving

Save schema version 5 validates `frozen` per tile (it can only ever decrease),
and validates `goal` / `limit` against the level's fixed objective — target and
needed must match, `collected` and `used` may vary but never exceed their bound.
The undo-transition check was generalised: a frame must follow the last by
exactly one legal pick, which is now either a collection *or* a thaw. Capacity is
deliberately not part of a move's identity, because buying the seventh slot
changes the current game's capacity without rewriting older frames.

**This required a generator bump.** `GENERATOR_VERSION` is now 4, because adding
frost and objectives changes the deterministic board even for levels whose recipe
did not change. Saves from generator 3 are rejected with the existing visible
warning and start fresh, which is the documented behaviour for changing layout or
symbol assignment.

## Tests

384 tests pass (up from 350). New coverage: thaw rules (thaw then collect, still
covering, a whole frozen triple), frost scheduling and the expanded witness,
frozen hints and undo, frost save validation (including re-freezing rejection),
collect goals (only the target counts, wins when met, outranks a full tray,
thaws do not count), pick limits (loss when spent, win on the last pick, a thaw
costs a pick), objective scheduling, wand goal satisfaction, shuffle refusal,
objective round-trips and tamper rejection, and the rendered app (frost renders
and thaws, the goal and move lines, and the "Out of moves" screen).

## Not done yet

Still deliberate, in rough value order: Zen or endless mode; multi-tab conflict
resolution beyond adoption; CI and Playwright coverage for install, offline, and
update flows; and string extraction for localisation.

## Phone acceptance checks

1. Play level 11: a frosted tile should look icy, still show its symbol, and thaw
   with one tap without leaving the board or filling a slot.
2. Confirm the tile beneath a frozen tile stays unpickable until the frozen tile
   is actually collected, not merely thawed.
3. Play level 15 and watch the goal line count down as the named symbol is
   gathered; the win screen should name the goal.
4. Play level 20 with two moves left: the goal line must pulse, then the loss
   must read "Out of moves" and still offer the free rescue and retry.
5. Shuffle a goal or pick-limited level: it should say it is unavailable rather
   than charging for a failed shuffle.
6. Use the wand on a collect level with a full tray and confirm the goal still
   advances and the level stays completable.
7. Check that the frost glaze and the goal line stay readable on the smallest
   phone and at the largest OS text size.

Automated tests do not substitute for browser interaction, phone performance, or
installed-PWA testing.
