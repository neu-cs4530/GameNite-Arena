# Profile rework + puzzle fixes — design

Branch: `zach/profile-puzzles-rework`. Scope: puzzle correctness fixes + the
user-profile rework around game pills. Everything serves REAL data — no client
mocks on any new surface. Unit tests only (no new e2e); exactly one shared
mock profile fixture is allowed for client unit tests.

## Puzzle fixes (server)

1. **Streak decoupled from the rated slot.** Today the streak only updates
   inside `if (rated)`, and a failed rated attempt spends the day's slot — so
   a later genuine solve can never extend the streak. New rule: the streak
   advances on the first **unhinted successful solve** of a puzzle-date,
   regardless of whether the attempt was rated. Hinted solves never advance it
   (the hint reveals the answer).
2. **Effective streak.** `current` is stored but only meaningful relative to
   `lastSolvedAt`. Every read path serves
   `effectiveCurrent = lastSolvedAt ∈ {today, yesterday} ? current : 0`
   (helper `effectiveStreak()` in puzzle.service). The DB value is never
   trusted raw again.
3. **Date pinning.** `POST /api/puzzle/:gameKey/attempt` now requires `date`
   (YYYY-MM-DD) in the payload. Grading, the rated economy, the attempt log,
   and streak math all key off that puzzle's date — a session straddling UTC
   midnight is graded against the puzzle it actually shows.
4. **Sound grading.** Game services gain an optional
   `isWinningMove(state, move)` hook (nim: resulting `remaining ≡ 1 (mod 4)`).
   Mining only accepts splits where the archived move passes the hook; grading
   accepts ANY winning move, not just the archived one. Puzzles are now both
   sound (the labeled solution wins) and complete (every winning move scores).
5. **Solution leak closed.** `GET /api/puzzle/:gameKey` strips `solution`.
   Hints move server-side: `POST /api/puzzle/:gameKey/hint` (authed, `{date}`)
   returns the solution move and records the grant in `PuzzleHintRepo` under
   `<userId>|<puzzleId>`; `submitAttempt` derives `hintsUsed` from that repo
   and ignores the client-reported number. The attempt response now carries
   `solutionMove` + `explanation` so the verdict panel can still teach.
6. **Per-game puzzle ratings.** `UserRecord.puzzleRating: GlickoRating`
   becomes `puzzleRatings: Partial<Record<GameKey, GlickoRating>>` (migration
   002 moves the legacy global rating to `nim`, the only puzzle game to date).
   Overall puzzle elo = mean of per-game ratings. The streak stays global (any
   game's solve counts — "solved a puzzle today").

## New read endpoints (server, all real data)

- `GET /api/profile/:username` → `ProfileSummary` (shared type):
  - `user`: SafeUserInfo
  - `general`: totals + W/L/D, `peakElo`, `avgElo` (mean of current per-game
    ratings), 7×24 heatmap buckets (all games), `bestAi` (the user's
    highest-rated AI model with its W/L from the match archive, or null),
    `mostViewed` replay summary (or null)
  - `perGame[]` (one per ReplayGameKey with any data): rating
    (current/peak/avg over time from archived `ratingChanges`), W/L/D, heatmap
    buckets for that game, `mostViewed` replay for that game
  - `puzzles`: per-game `{rating, attempts, solves, solveRate, avgTimeMs}`
    - `overallRating` + effective streak + recent attempts (last 20) Peak/avg
      elo are reconstructed by replaying the user's rated matches'
      `ratingChanges` in `completedAt` order from the match archive.
- `GET /api/puzzle/leaderboard?game=<key|overall>&page&limit` → ranked
  `{username, displayName, rating, attempts, solves, solveRate, streakCurrent, streakBest}`;
  built from UserRepo + PuzzleAttemptRepo scans, Redis-cached 5 minutes (same
  pattern as the match leaderboard).
- `GET /api/puzzle/:gameKey?for=<username>` additionally returns
  `viewerAttempt: {attempted, solved, rated} | null` for that user+date so
  Home/Portal can show solved badges without a second endpoint.

## Profile UI (client)

Tabs stay (`Overview` (was "matches") / `Watch later` / `Edit profile`).
Inside Overview, a pill row scopes EVERY element:
`General (default) | Nim | Guess | Tic-tac-toe | Connect 4 | Checkers | Puzzles`,
deep-linked via `?scope=`.

- **General**: heatmap (all games), W/L/D + totals, peak + average elo,
  best-AI card, most-viewed replay hero (any game), then the standard filtered
  replay area defaulting to newest, all games.
- **Game scope**: identical layout, every element scoped — heatmap for that
  game, that game's W/L/D and current/peak/avg elo, most-popular replay hero
  for that game, filtered area pre-filtered to the game (sort newest).
- **Puzzles scope**: no replays — stat tiles (overall + per-game puzzle elo,
  solve rate, avg time-to-solve, attempts) + streak (effective current +
  best) + recent attempt history table.

One fetch (`GET /api/profile/:username`) powers all scopes; pill switches are
client-side. The page has **no mock fallback** — a failed fetch renders the
error state. Anything that cannot be real must wear a red "MOCKED" badge
(`.ga-mock-flag`); as designed, nothing needs one (best-AI renders an honest
empty state until AI matches exist).

ActivityHeatmap becomes a pure presentational component fed real bucket data
(testids and aria-label format preserved).

## Site-wide puzzle visibility

- `/leaderboards` gains a Puzzles section (per-game + overall boards).
- Home gets a real daily-puzzle card (today's puzzle + solved badge).
- GamesPortal tiles badge "Daily puzzle" on puzzle-enabled games.

## Testing

- Server: vitest unit tests first, per service/controller (in-memory keyv +
  seeded repos — the established pattern).
- Client: vitest + jsdom + @testing-library/react (new infra), unit tests for
  pills/scope switching, heatmap bucket rendering, puzzle stat tiles, and
  services — sharing ONE mock `ProfileSummary` fixture
  (`client/src/__fixtures__/profileSummary.ts`).
- Existing e2e specs are updated where the rework moves testids; no new e2e.
