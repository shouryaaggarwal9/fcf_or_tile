# Slice 4: component structure, UI tests, and a slice 2–3 audit

## Run locally

From this directory:

- `npm test` — everything: rules, levels, sessions, persistence, feedback, and the rendered app.
- `npm run check` — TypeScript plus the full test suite.
- `npm run lint`, `npm run build` — static checks and the production/PWA build.

## Component structure

`App.tsx` was a single 486-line component holding board, tray, four overlays, the flight animation, and all session state. It is now composition only, and the workflow lives in one hook:

- `hooks/useCozyTiles.ts` — session state, the move workflow, booster purchases, settings, save warnings, and level selection. No markup.
- `flight.ts` — `animateFlight` and `wait`, outside React.
- `components/` — `TileIcon`, `Board`, `Tray`, `TopBar`, `GameFooter`, `ConfirmDialog`, `SettingsDialog`, `LostDialog`, `WinDialog`, `SaveWarning`, `LevelMap`.

Result dialogs now focus their own heading on mount instead of App driving a ref. Overlay order in `App.tsx` is deliberate: result screens paint first, then save warnings, purchases, settings, and the level map, so an opened dialog stacks above the result it was opened from.

Two bugs surfaced while splitting the file (the first was pre-existing, not introduced by the refactor):

1. **Stacking.** Settings opened from a win screen rendered *underneath* the win card, because both overlays are `position: absolute` with the same `z-index` and the result screen came last in the DOM. Reordering fixes it; `App.test.tsx` asserts the document order with a regression test.
2. **Template leftovers.** `src/App.css` and `src/assets/{hero.png,react.svg,vite.svg}` were unreferenced and are deleted.

## UI tests

`src/App.test.tsx` drives the real UI with React Testing Library and `user-event`: blocking and unblocking, triple clearing, the coin-charged undo confirmation, purchase cancellation, the out-of-slots recovery dialog, a full 12-move win paying the reward once, settings and progress surviving a remount, level-map locking and chapter paging, and dialog stacking.

- Vitest runs in the Node environment by default, so the 245 logic tests keep their speed. Component suites opt into jsdom with a `// @vitest-environment jsdom` docblock.
- `src/test/setup.ts` registers `@testing-library/jest-dom`, RTL cleanup, and a `matchMedia` stub (jsdom has none, and the board reads it for reduced motion).
- jsdom has no `Element.animate`, so the flight animation throws and is caught exactly as it is in a browser that refuses the animation. Tests await the booster-disabled `Settings` button becoming enabled, which is the precise "move fully resolved" signal the input lock already provides — no sleeps and no racing the animation.

## Audit of slices 2 and 3

Both slices are complete as documented. Every claim in `SLICE-2.md` and `SLICE-3.md` was re-checked against the code, and the claims that had no test now do:

- Seventh slot: a triple landing in the seventh slot clears before the loss check, and the seventh slot fills into a loss without a triple (previously only the six-slot cases were covered).
- Seventh slot across app closes: a capacity-7 session round-trips through storage, including its undo history.
- Win screen persistence: a won level reloads as won, with the reward already banked and `rewardedThrough` intact.
- Refused shuffles: an uncompletable tray is refused and charges nothing, leaving the board, tray, and `shuffleCount` untouched (only the accepted path was tested before).
- Relaxed Mode: the documented "all of them free" claim was only tested for the seventh slot; undo and skip are now covered too.
- Save size: the largest realistic save — level 1,000,000,000 with a full 48-frame undo history — is about 141 KB, well inside the 1 MB decode limit and the localStorage quota. No silent-reset risk from the size guard.
- Level paging: chapter math never crosses the last level and refuses invalid chapters.

Notes for future work rather than defects:

- `progress.ts` is now migration-only. `decodeProgress` is still required to read Slice 2 move-list saves, but its writers are unused outside tests; it should not be deleted while version 1 saves can exist.
- The 48-frame undo cap is only reachable on the 48-tile maximum, and `.slice(-UNDO_LIMIT)` never actually trims there. It is defensive, not load-bearing.
## Offline updates

`registerType: "prompt"` was configured, but nothing imported `virtual:pwa-register`, so the "new version available" prompt never appeared and installed users stayed on a stale build until a manual reload. That is now wired up:

- `components/PwaUpdate.tsx` owns the service worker handshake through `useRegisterSW` and renders nothing until an update is actually waiting. `components/UpdatePrompt.tsx` is the presentational notice: **Refresh** calls `updateServiceWorker(true)`, **Later** hides it, and the old version stays playable meanwhile.
- Reloading is safe by construction. An accepted move is saved before it animates, so a reload always resumes a completed move rather than a transient triple.
- The notice is a non-modal toast at `z-index: 15`, deliberately below the dialogs (`20`) so it can never cover a modal action.
- `pwa.ts` schedules an hourly `registration.update()` plus a check whenever a backgrounded app becomes visible again. Browsers only look for a new worker on navigation, and an installed game can run for days without one.
- `workbox.cleanupOutdatedCaches` is enabled so a reload cannot serve a mix of old and new assets.

Tests cannot exercise a real service worker, so the split is deliberate: `pwa.test.ts` unit-tests the check scheduling against a fake registration (interval, foreground return, cleanup, and both failure modes), and `App.test.tsx` drives the notice through a controllable double. `vite.config.ts` skips the PWA plugin in test mode and aliases `virtual:pwa-register/react` to `src/test/pwaRegisterStub.ts`, so no test depends on a generated worker.

The production build was inspected directly: `workbox-window` is code-split and precached, `sw.js` contains the outdated-cache cleanup, and the plugin injects **no** competing register script because `injectRegister: "auto"` detects the manual import. The test double does not reach `dist`.

## Progression

Unlock tracking (`unlockedThrough`, `goToLevel`) and a chapter-paged level map are implemented; the Level button in the top bar opens it. Boosters, coins, and the win reward keep working unchanged on replayed levels because `rewardedThrough` only ever moves forward.

## Phone acceptance checks

1. Serve the build over HTTPS, install the PWA, and let the first load finish before reopening offline.
2. Change something visible, rebuild, and redeploy.
3. Return to the installed app — the notice should appear on the next launch, or after sending it to the background and re-opening it.
4. Tap Refresh: the new version loads and the level, tray, coins, and settings are intact.
5. Tap Later: the notice disappears, play continues on the old version, and the notice returns on the next launch.
6. Check that the toast does not cover the booster bar or any dialog action on a real phone.

Automated tests do not substitute for browser interaction, phone performance, or installed-PWA testing.
