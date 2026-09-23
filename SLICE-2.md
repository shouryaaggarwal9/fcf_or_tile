# Slice 2: levels and local progress

## Run locally

From this directory:

- `npm test` — rules, generated levels, and persistence tests.
- `npm run lint` — static lint checks.
- `npm run build` — TypeScript and production/PWA build (does not deploy).
- `npm run dev -- --host 0.0.0.0` — phone testing on the same Wi-Fi.

## Behavior

Level 1 retains the original 12-tile tutorial. Subsequent levels alternate compact rectangle/diamond layouts, use geometry-derived coverage, and scale to 48 tiles, six layers, and sixteen SVG symbols. Every eighth level uses fewer kinds. The difficulty table is in `src/levels.ts`; the tutorial intentionally retains four kinds rather than the table's three.

The generator removes legal positions sequentially and assigns matching symbols to consecutive triples. It replays that witness through `planMove` before returning a generated level. Solvable means a winning path exists from the initial board, not that every player choice remains recoverable. This is a basic difficulty curve, not a solver-based difficulty rating.

Accepted moves are saved synchronously before animation, storing the resolved move outcome as a level number plus move history. An interrupted animation therefore resumes with that move completed, never with a transient triple still in the tray. Loading replays and validates the history. Won/lost screens persist; winning advances only when Next level is pressed. Retry resets the current level, not progression.

Storage key: `cozy-tiles.progress`. Save schema and generator are versioned. Generator version 1 supports levels 1–1,000,000,000. Changes to the algorithm/layout/symbol assignments require an explicit migration or generator-version bump because histories depend on deterministic generation.

Invalid or incompatible saves produce a visible warning and a fresh tutorial; loading alone does not overwrite the original value. The next accepted move or restart replaces it. Storage access/quota errors show a warning while allowing play. Clearing site data, private browsing, browser eviction, or changing origin can remove progress; this is not cloud backup. Multiple simultaneous tabs are not synchronized (last write wins).

## Phone acceptance checks

1. Win level 1 and press Next level; verify the title and new board.
2. Make several moves, refresh, and confirm the board/tray and level are restored.
3. Refresh during a flight or triple animation; the accepted move should be complete.
4. Lose, refresh, and retry; verify the same starting puzzle and level.
5. Win and refresh before pressing Next level; the win screen should remain.
6. Check readability, scrolling, overlap, and animation smoothness on the actual Android phone, particularly later levels.
7. For installed/offline testing, use an HTTPS origin (plain HTTP LAN testing is not sufficient for service workers). Allow the first load to finish before reopening offline.

Automated tests do not substitute for browser interaction, phone performance, or installed-PWA testing. Coins, boosters, a seventh slot, sound/haptics, a level map, and final artwork remain out of scope.
