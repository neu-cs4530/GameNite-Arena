/**
 * Shared identifiers and fixture constants for the trainer-related e2e tests
 * (`trainer-*.e2e.spec.ts`).
 *
 * Login helpers (`logIn`, `logInAndReady`, `DEFAULT_USER`, etc.) are owned by
 * `./replayTestUtils.ts` - import them directly from there, do not re-export.
 *
 * INSTRUCTION TO CODE AGENT: the deterministic mock fixtures in
 * `client/src/__mocks__/training.ts` MUST satisfy the following invariants so
 * that these e2e tests have stable, predictable assertions to make:
 *
 *  Models (`MOCK_MODELS: ModelDetail[]`):
 *  - At least 40 entries total.
 *  - The FIRST entry's id is `FIXTURE_FIRST_MODEL_ID` (`"mock-model-1"`).
 *  - The first entry is owned by user0 (`username: "user0"`), is PUBLIC
 *    visibility, is a Nim model, has at least one ACTIVE deployment record
 *    in `MOCK_DEPLOYMENTS` pointing at it, and has at least one saved
 *    checkpoint (i.e. its `hasCheckpoint` flag is true so it appears under
 *    "Has checkpoint" filter).
 *  - The first 12 entries are owned by user0; the rest are owned by other
 *    users (so the "Yours only" / "Others only" segmented filter changes
 *    the visible count).
 *  - Visibility split: a mix of public and private across the first 12
 *    (so "Public only" / "Private only" filters change the count).
 *  - At least one entry has `forkedFrom` populated AND was forked within
 *    the last 7 days (for the "Recently forked" featured strip).
 *  - At least one entry has `isStarterTemplate: true` (for the
 *    "Hello world starters" featured strip).
 *  - At least one entry per supported game has a public model so the
 *    "Top models per game" strip has 5 cards.
 *  - Elo distribution spans 950..2350 so the Elo range slider exercises
 *    different counts at the extremes.
 *  - Subsequent ids follow the pattern `mock-model-N` for stable references
 *    (`mock-model-2`, `mock-model-3`, ...).
 *
 *  Jobs (`MOCK_JOBS: TrainingJobDetail[]`):
 *  - At least 12 entries spanning every status:
 *    queued / running / completed / failed / canceled.
 *  - The FIRST entry's id is `FIXTURE_FIRST_JOB_ID` (`"mock-job-1"`),
 *    is a COMPLETED Nim job owned by user0 with at least one checkpoint
 *    in its `checkpoints` array, a downloadable `.pth` artifact, and
 *    `meanReward` / `winRate` curves populated for the chart.
 *  - At least one job is currently `running` with id
 *    `FIXTURE_RUNNING_JOB_ID` (`"mock-job-running"`), owned by user0,
 *    has partial progress (e.g. ~40% episodes), and at least one
 *    checkpoint already saved.
 *  - The running job triggers the mock WebSocket emit loop on subscribe.
 *  - At least one `failed` and one `canceled` job for user0 so the
 *    Recent completed runs section can render all status pills.
 *
 *  Deployments (`MOCK_DEPLOYMENTS: DeploymentDetail[]`):
 *  - At least 4 entries for user0 spanning active / paused / retired.
 *  - For game key `FIXTURE_FULL_CAP_GAME` (`"connect4"`), user0 already
 *    has EXACTLY 3 ACTIVE deployments so the 3-active-per-game cap is
 *    exercised. Attempts to create a 4th MUST throw the friendly
 *    "cap exceeded" error.
 *  - At least one ACTIVE deployment has an `invalidMoveStreak` > 0 (but
 *    less than 3) so the streak indicator is visible.
 *  - At least one deployment has `lastForfeitAt` set so the
 *    "last forfeit" timestamp is visible on its card.
 *
 *  Hello world template (`MOCK_HELLO_WORLD: { source, name }`):
 *  - `source` is non-empty `.py` text that includes the substring
 *    `def choose_move` so a textarea/preview assertion can match it.
 *  - `name` is a friendly display string (e.g. "Hello, GameNite!").
 *
 *  Mock WebSocket (`subscribeLiveProgress(jobId, cb)`):
 *  - Emits an event every ~400ms (test polling tolerates up to ~2s).
 *  - Each event monotonically increases `episodes` (by +1000) and
 *    includes `meanReward` and `winRate` numbers in [0, 1].
 *  - After 12 events emits a `complete` event and stops.
 *  - Returns an `unsubscribe()` cleanup; the hook must call it on
 *    unmount and on jobId change so navigating away leaves no timers.
 */

/** First fixture model id - user0-owned, public, Nim, has deployment + checkpoint. */
export const FIXTURE_FIRST_MODEL_ID = "mock-model-1";

/** First fixture job id - completed Nim job for user0 with downloadable .pth. */
export const FIXTURE_FIRST_JOB_ID = "mock-job-1";

/** Currently-running job - WebSocket assertions target this id. */
export const FIXTURE_RUNNING_JOB_ID = "mock-job-running";

/** Game where user0 has 3 active deployments so the cap is exercised. */
export const FIXTURE_FULL_CAP_GAME = "connect4";

/** Pagination sizes from the spec. */
export const MODELS_PER_PAGE = 24;
export const JOBS_PER_PAGE = 12;
export const DEPLOYMENTS_PER_PAGE = 24;

/** Maximum active deployments per (user, game) pair (Story 2.7). */
export const DEPLOYMENT_CAP_PER_GAME = 3;

/** Supported game keys per the trainer spec. */
export const SUPPORTED_GAMES = ["nim", "guess", "checkers", "connect4", "tictactoe"] as const;

/** Game keys that use self-play training mode. */
export const SELF_PLAY_GAMES = ["nim", "checkers", "connect4", "tictactoe"] as const;

/** Game keys that use environment-driven training mode. */
export const ENV_DRIVEN_GAMES = ["guess"] as const;

/**
 * Minimal valid `.py` content used by the upload test. The test uses
 * `page.setInputFiles` with a Buffer holding this content.
 */
export const SAMPLE_HEURISTIC_PY = `import torch

def choose_move(state):
    """Trivial heuristic - returns the first legal action."""
    return state.legal_actions[0]
`;
