# SLICE-10 — Adult difficulty overhaul

Bigger, denser, deeper boards with order-forcing **key tiles (locks)**, a
tighter objective economy, and priced hints — while keeping every board
deterministic, seed-stable, offline, and winnable by its witness.

## Motivation

The game capped at 48 tiles over at most 6 layers on a 4-column footprint.
Coverage was shallow: upper layers were sparse, most tiles covered only 1–2
tiles, and with every kind appearing exactly 3 times the tray was never under
real pressure. Adults need depth and ordering decisions, not timers.

## What changed

### 1. Difficulty curve (`src/levels.ts`)

| Levels   | Tiles     | Layers | Kinds  | Locks |
|----------|-----------|--------|--------|-------|
| 1–3      | 12        | 2      | 3      | 0     |
| 4–10     | 18        | 3      | 5      | 0     |
| 11–20    | 36        | 4      | 8      | 0     |
| 21–30    | 48        | 5      | 12     | 0     |
| 31–59    | 60–72     | 5–7    | 14–16  | 0–2   |
| 60–99    | 72–96     | 6–8    | 16–20  | 1–3   |
| 100+     | rotation + **abyss** (120 tiles, 8 layers, 20 kinds, 5 locks) every level ≡ 7 (mod 10) | | | |

Gentle levels (every 8th) shrink tiles to ~60% (rounded down to a multiple of
3), scale kinds to 70%, and carry no locks.

The diamond widened from 3×5 to 3×7 (17 positions) so dense recipes never
reuse a same-layer position, and three chokepoint shapes were added: **tower**,
**hourglass**, **pyramid** (up to 6 columns × 7 rows). Footprints stay within
`6.5 × 7.5` units so 320px-wide screens keep ~40px faces (tappable); ≤5-column
shapes keep the old 48px floor.

Dailies scale to 48–72 tiles (Mon–Sat rotation), with an 84-tile **tower**
"deep daily" when `dayNumber % 7 === 6`. No locks, no objectives.

### 2. Key tiles (locks)

`Tile.lockedBy?: string[]` (engine, `src/game.ts`): a tile is selectable only
when every key id is absent from the board — the same rule as `coveredBy`,
from tiles anywhere. The generator places locks on buried tiles whose key
appears **strictly earlier in the witness**, so every lock provably opens in
time, cycles are impossible by construction, and keys are always buried
themselves. `GENERATOR_VERSION` bumps to **6**: old saves reset.

UI: a lock chip renders on locked tiles, `aria-label` gains `, locked`, taps
show "That tile is guarded — collect its key tile first.", and the instruction
line gains "Key tiles unlock the tiles they guard." only on lock-bearing
boards. Storage restores locks from the regenerated board, so a stripped save
cannot lift them.

### 3. Tray-overflow safeguard (generator)

The removal order is now replayed through the engine before a board is
accepted: every step must be legal, the tray must never come within one slot
of a loss (peak ≤ capacity−1), and the order must win. Failed orders reshuffle
with the seeded RNG (12 attempts per kind-spread), then the palette narrows
one kind at a time down to 3 — the board shape is never abandoned. Generation
never throws for tray reasons on any seed.

### 4. Objectives and hint economy

- Pick-limit slack tightened from `max(5, 25%)` to `max(3, 10%)` of the witness.
- Hints cost **15 coins** in Standard Mode (`hintPrice` / `payForHint` in
  `src/session.ts`) and stay **free in Relaxed Mode** — the accessibility
  valve. Refusals charge nothing. Hint use still does not affect star ratings.
- Rescue, undo, shuffle, wand, skip unchanged.

## Verification

- 200-level sweep + `999 / 10_000 / MAX_LEVEL`: determinism, winnability,
  kind counts % 3, lock invariants (keys exist, precede targets, are buried),
  face-size floors (48px narrow, 40px wide shapes).
- Save round-trips for a 120-tile level and a lock-bearing level, including a
  tamper check (stripped `lockedBy` cannot unlock).
- App tests: lock chip, guarded-tap notice, key-collection unlock, hint charge.
- Manual QA: play levels 11, 31, 60, 97, 107; check chip legibility and ~40px
  faces on a 320px viewport.
