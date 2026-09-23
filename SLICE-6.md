# Slice 6: a daily puzzle, a streak, and a stats screen

This slice builds on the two deferred items that share the most player-visible
value with the least risk to the matching engine: a **date-seeded daily puzzle
with a streak**, and a **local stats and achievements screen**. Everything below
reuses the existing rules, generator, and save validator rather than adding a
second implementation of any of them.

## Run locally

From this directory:

- `npm test` — rules, levels, daily calendar, sessions, persistence, hints,
  achievements, feedback, and the rendered app.
- `npm run check` — TypeScript plus the full test suite.
- `npm run lint`, `npm run build` — static checks and the production/PWA build.

## The daily puzzle

- **One board a day, the same for everyone.** `generateDailyPuzzle(day)` in
  `levels.ts` seeds the existing board builder from a calendar day, never from a
  level number. The builder was extracted into one `buildPuzzle(recipe, seed)`
  so campaign and daily puzzles cannot drift apart: same silhouette set, same
  center-out fill, same witness replay that proves solvability before a board is
  returned.
- **Moderate recipes.** Dailies cycle five recipes (18–42 tiles, 3–5 layers,
  6–14 kinds) across all six silhouettes, with a rainbow day every eighth day.
  A daily should feel like a treat, not the hardest level in the game.
- **A calendar, not a level.** `daily.ts` maps a local `YYYY-MM-DD` date to a day
  number (DST-safe), formats and steps dates, and owns the streak math. Local
  dates mean "today" matches the player's day, not UTC's.
- **Enter, resume, leave.** `startDaily` sets the campaign attempt aside in a
  `stash` field and puts the day's board on screen; `exitDaily` restores the
  stash untouched. Re-opening the same day resumes it; a rollover keeps the
  campaign stash and discards yesterday's board rather than stashing a daily as
  if it were a campaign attempt.
- **Daily wins stay off the campaign.** A daily never records a star rating,
  never moves `rewardedThrough`, and never unlocks the next level. It pays
  `DAILY_COINS` (30) exactly once per date. `skip` is refused during a daily, and
  auto-advance is disabled so the streak screen is never skipped past.

## Streaks

- Finishing consecutive calendar days grows the streak; missing a day resets it
  to one on the next finish. `dailyBestStreak` is remembered.
- The displayed streak only counts while it is alive: `activeDailyStreak` shows
  the stored value when the last completion was today or yesterday, and zero
  once a day has been missed.
- The top bar shows the live streak (a chip on campaign levels, a note while
  playing the daily), and the Daily dialog shows current and best.

## Stats and achievements

- `StatsDialog` is opened from Settings. It reports levels cleared, stars
  collected, coins, the live and best daily streaks, and dailies cleared.
- Achievements live in `achievements.ts` and are **derived from the save, never
  stored**, so they cannot drift from progress. Every predicate reads only
  monotonic data — levels cleared, star totals, flawless-level counts, best
  streak, dailies cleared — which is why an achievement can never be re-locked by
  spending coins or missing a day.

## Saving

Save schema version 4 adds `daily`, `stash`, `lastDaily`, `dailyStreak`,
`dailyBestStreak`, and `dailiesCleared`. Version 2 and 3 saves still load; the
new fields default to "no daily has ever been played". The validator was split so
one `validateAttempt` routine checks the active attempt **and** a stashed campaign
attempt, each against the board it was generated from — the day's puzzle for a
daily, the campaign level for a stash. New invariants: a daily requires a stash,
a stash without a daily is rejected, a won daily must have banked its reward for
that exact date, `dailyBestStreak >= dailyStreak`, and a banked daily implies a
live streak and at least one completion. Benign counters stay lenient.

## Tests

350 tests pass (up from 319). New coverage: the calendar (leap years, month
boundaries, epoch day numbers, only-yesterday-is-consecutive, a streak that
expires), daily generation (deterministic, solvable, readable, recipe and
silhouette rotation, the every-eighth-day rainbow), the daily session workflow
(stashing and restoring the campaign attempt, same-day resume, rollover, reward
once, three-day streak then a reset that keeps the best, no campaign stars, retry
regenerating the identical board, no skip, no auto-advance, leaving via the level
map), persistence (active and completed daily round-trips, the new rejection
cases, version 3 migration), the achievements, and the rendered app (the Daily
dialog, entering and leaving, the completion screen, the reward and streak chip,
campaign progress staying untouched, and the stats screen unlocking the daily
achievement).

## Not done yet

Still deliberate, in rough value order: Zen or endless mode; multi-tab conflict
resolution beyond adoption; CI and Playwright coverage for install, offline, and
update flows; and string extraction for localisation. Frozen tiles and goal- or
pick-limited levels are built in `SLICE-7.md`.

## Phone acceptance checks

1. Open Daily, read the date and streak, and play today's puzzle.
2. Clear it: confirm the 30-coin reward, the streak screen, and that "Back to
   level N" returns you to exactly the board, tray, and undo history you left.
3. Make a campaign move, open the daily, close the app, reopen: the daily is
   still on the board; leave it and the campaign move is still there.
4. Win a daily today, then open Daily again: it should say today is already done
   and offer to replay without paying again.
5. Open Settings, then Stats & achievements: check the numbers and that the
   daily achievement is ticked and campaign ones are not.
6. Change the device date forward one day and finish that daily: the streak
   should read 2. Skip two days and finish: it should read 1 with the best kept.
7. Play a daily to the last tray slot and lose: the free rescue and the recovery
   options must behave exactly as in the campaign.
8. Check the top bar on the smallest phone: the Daily, Levels, and Settings
   buttons and the streak chip must wrap without overflowing.

Automated tests do not substitute for browser interaction, phone performance, or
installed-PWA testing.
