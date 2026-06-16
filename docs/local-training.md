# Local Training Sessions

GameNite Arena does **not** train models on the server. Users train on their
own machines — with the adapter SDK (`ai/base_adapter.py`) or anything else
that produces a compatible `.pth` — and the platform **records and displays**
the run. This document covers the infrastructure that connects a local
training loop to the platform.

```
 user's machine                          GameNite server                browser
┌──────────────────┐  REST (auth'd)   ┌─────────────────────┐  socket.io ┌────────────┐
│ training loop    │ ───────────────► │ /api/training/...   │ ─────────► │ Trainer    │
│ + session_       │  submit/progress │ TrainingJobRepo     │  per-job   │ dashboard  │
│   reporter.py    │  complete/fail   │ (source of truth)   │  rooms     │ live page  │
│                  │  artifact (.pth) │        │            │            └────────────┘
└──────────────────┘                  │        ▼            │
        ▲  response carries status    │ Redis pub/sub       │
        └── "canceled" = stop ────────│ training:progress   │
                                      │ (bridge, PR #64)    │
                                      └─────────────────────┘
```

Two producer paths coexist by design:

- **Local sessions** (this doc): `trainingSession.service.ts` — the user's
  machine drives the run.
- **Queue-managed runs**: `trainingQueue.service.ts` + `trainingWorker.ts` —
  the BullMQ path. Both write the same `TrainingJobRecord` and publish the
  same `TrainingProgressEvent`, so the dashboard does not care where a run
  executes.

## Getting the kit (users and teammates)

The platform distributes its own training kit — never copy files out of the
repo by hand. One line fetches everything into `./gamenite-training-kit/`,
creates a `.venv`, and installs the pinned requirements:

```bash
curl -fsSL http://localhost:8000/api/training/kit/install.sh | sh
```

With a job registered on the web form, the same line hands off straight into
the attached run (the job page shows this exact command):

```bash
curl -fsSL http://localhost:8000/api/training/kit/install.sh | sh -s -- --job-id <id> --token <tkn>
```

(or click **Get the local training kit** on the AI Trainer dashboard, or fetch
individual files from `GET /api/training/kit/<name>` — the manifest is at
`GET /api/training/kit`). The kit contains:

- `train.py` — the trainer CLI (the kit **entrypoint**): real chunked SB3 PPO,
  real rollout evaluation, live reporting, artifact upload.
- `session_reporter.py` — the stdlib HTTP client (use it directly from your
  own loop if you outgrow `train.py`).
- `base_adapter.py` + the per-game example adapters.
- `requirements.txt` — **pinned exactly** to the stack the platform verified
  real learning on (torch 2.11.0, stable-baselines3 2.8.0, gymnasium 1.2.3,
  numpy 2.2.3).

## Security model

- The trainer exchanges its password **exactly once** at
  `POST /api/training/token` for an opaque token that expires after 24 h;
  every other call authenticates with the token. `GameNiteSession` does this
  transparently (and re-exchanges once if the token expires mid-run), so the
  password never sits in loops, logs, or shell history. A pre-issued token can
  be used instead of a password: `GameNiteSession(url, token=...)`.
- Every mutating route enforces ownership (only the session's owner can
  report, cancel, complete, or upload to it). Payload sizes are capped in the
  shared schemas.
- Session info — including `fail()` reasons and `config.extra` — is **publicly
  readable** (the platform displays runs). Send failure summaries, not stack
  traces with machine paths.
- Run production traffic over HTTPS (a deployment concern; localhost dev is
  plain HTTP).

## Endpoints

All mutating routes take `{ auth, payload }` bodies where `auth` is either
`{ username, password }` or `{ token }`. Payload schemas:
`shared/src/trainingSession.types.ts`.

| Endpoint                        | Method | Purpose                                                                                                    |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `/api/training/token`           | POST   | Exchange password for an expiring trainer token                                                            |
| `/api/training/kit`             | GET    | Training-kit manifest                                                                                      |
| `/api/training/kit/install.sh`  | GET    | One-line kit bootstrap script                                                                              |
| `/api/training/kit/:name`       | GET    | One whitelisted kit file                                                                                   |
| `/api/training/submit`          | POST   | Register a session (creates job + model if needed)                                                         |
| `/api/training/list`            | GET    | Newest-first list, `?username=` filter, paginated                                                          |
| `/api/training/:jobId`          | GET    | One session                                                                                                |
| `/api/training/:jobId/progress` | POST   | Episode-batch report; **response status = control channel** (a canceled session tells the trainer to stop) |
| `/api/training/:jobId/complete` | POST   | Terminal: completed (folds finalMetrics into record)                                                       |
| `/api/training/:jobId/fail`     | POST   | Terminal: failed with reason                                                                               |
| `/api/training/:jobId/cancel`   | POST   | Cancel from the web UI (409 on double-cancel)                                                              |
| `/api/training/:jobId/artifact` | POST   | Multipart `.pth` upload; `auth` is one JSON-string field                                                   |
| `/api/training/:jobId/artifact` | GET    | Download the trained `.pth`                                                                                |

Live events reuse the bridge contract
(`shared/src/trainingProgress.types.ts`): clients emit
`training:subscribe { jobId }` and receive `training:progress` events, with a
last-event snapshot replay on subscribe.

## Using the reporter in a training loop

```python
from session_reporter import GameNiteSession

session = GameNiteSession("http://localhost:8000", "user0", "pwd0000")
session.start("nim", episodes=50_000, learning_rate=3e-4,
              model_display_name="my-nim-bot")

for batch in range(50):
    # ... your actual training (e.g. adapter.train() chunk) ...
    if not session.report(episodes=batch * 1000,
                          metrics={"winRate": wr, "meanReward": mr}):
        break                      # canceled from the web UI
else:
    session.complete(final_metrics={"winRate": wr})
    session.upload_artifact("my-nim-bot.pth")
```

## Artifact storage and the deployment handoff

`server/src/services/artifactStore.service.ts` is the single owner of
trained-model files. The contract:

- One root (`server/models/`), one file per model, named `<modelId>.pth`.
  Uploads are moved into that name atomically; a retrain replaces the previous
  artifact. `ModelRecord.artifactRef` holds the store-relative name (never a
  path) and `artifactMeta` records `{ bytes, sha256, uploadedAt }`.
- All reads resolve through `resolveArtifactRef()`, which only ever resolves
  inside the root — refs cannot point file-serving code anywhere else.
- This is exactly the layout the inference service loads from
  (`inference_service.py` opens `MODEL_STORE / f"{model_id}.pth"` on
  `/inference/load`), so deployment needs zero glue:

  ```bash
  MODEL_STORE_PATH=server/models uvicorn inference_service:app --port 8001
  ```

  and a `/inference/load { model_id }` for any model with `hasArtifact: true`
  finds its file.

Migration `001_canonical_artifact_refs` rewrites legacy absolute-path refs
into this shape (`npm run -w server migrate`).

## Self-hosted inference box (artifact pull-and-cache)

The Python inference service can run on a **self-hosted box** instead of
sharing Render's disk. Render stays the **canonical** artifact store; the box
keeps a **local cache** filled lazily on demand. The upload/deploy flow and
the frontend are unchanged.

Topology:

- **Node (on Render)** exposes `GET /api/inference/artifact/:modelId`, which
  streams the canonical `<modelId>.pth` (resolved through the same
  `resolveArtifactRef` so traversal/absolute `:modelId` values 404, never
  escape the store). It is gated by a **shared bearer token**, not user
  body-auth, and **fails closed** (503) when the token is unconfigured.
- **Node → box**: `inferenceClient.ts` calls the box's `/inference/load`,
  `/inference/move`, `/inference/unload` over HTTPS, sending
  `Authorization: Bearer <INFERENCE_SHARED_TOKEN>`. For the box's
  **self-signed cert** it trusts a pinned CA via an undici dispatcher (it
  never disables TLS verification globally — mirrors `redis.ts`'s self-signed
  handling).
- **Box → Render**: on `/inference/load`, if `MODEL_STORE/<model_id>.pth` is
  missing the box pulls it once from
  `NODE_API_URL/api/inference/artifact/<model_id>` (with the shared token),
  writes it to disk, then loads it. If the file already exists it loads from
  disk with **no** network call. The box verifies Render's (valid) cert
  normally. `model_id` is sanitized (no path separators / `..`) before it
  touches the filesystem or the URL.
- `/inference/health` stays open but returns minimal info (status + occupancy
  count); it never leaks the loaded deployment-id list without the token.

### Environment variables

| Var                      | Side | Purpose                                                                                                                                                           |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFERENCE_SHARED_TOKEN` | both | Shared bearer secret for the Node↔box link. Unset/empty ⇒ the gated endpoints fail closed (Node 503; box 503). Never logged.                                      |
| `INFERENCE_SERVICE_URL`  | Node | Base URL Node uses to reach the box, e.g. `https://inference.your-box.example` (dev: `http://localhost:8001`).                                                    |
| `INFERENCE_TLS_CA`       | Node | The box's self-signed CA, either inline PEM or a path to a PEM file. When set, Node's fetch trusts it (verification stays on). Unset ⇒ verify against system CAs. |
| `NODE_API_URL`           | box  | The Render base URL the box pulls canonical artifacts from, e.g. `https://gamenite.onrender.com`.                                                                 |
| `MODEL_STORE_PATH`       | box  | Local cache directory for `<model_id>.pth` (default `models`).                                                                                                    |

Combined (single-host) deploys still work: leave `INFERENCE_TLS_CA` /
`NODE_API_URL` unset, point `MODEL_STORE_PATH` at `server/models`, and the
artifact is already on disk so no pull happens.

## The trainer CLI

`ai/train.py` is the canonical workflow with nothing faked: chunked SB3 PPO
through the adapter SDK, real rollout evaluation per chunk, live reporting,
and artifact upload (the platform validates and stores it — bytes + sha256
appear on the job page). Two modes:

```bash
# Attach to a run registered on the web form — the job carries the game,
# episodes, learning rate, and the heuristics you picked there:
.venv/bin/python train.py --base-url http://localhost:8000 --job-id <id> --token <tkn>

# Or self-register from the CLI (game defaults apply):
.venv/bin/python train.py --base-url http://localhost:8000 --game nim \
    --username user0 --password pwd0000
```

`--token` also reads env `GAMENITE_TOKEN` and `--job-id` reads
`GAMENITE_JOB_ID`, which is how the install.sh hand-off works. Only **nim**
has a local trainer today; the other adapters are reference implementations —
`train.py` exits with a clear message for any other game. Cancel from the web
UI stops the loop on the next report.

### Training heuristics

The new-run form exposes per-game training choices (catalog:
`shared/src/trainingHeuristics.ts`). They ride in `config.extra.heuristics` on
the job; `train.py` reads them back after attaching (public
`GET /api/training/:jobId`) and maps them onto env parameters. Missing or
invalid values fall back to the defaults per key. For nim:

| Heuristic       | Options (default first)                                    | Env effect                                                                                                                       |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `opponentStyle` | `misere-blunder-25`, `misere-blunder-15`, `uniform-random` | misère-optimal opponent with 25%/15% blunders, or a uniform random mover                                                         |
| `startingPile`  | `random-8-21`, `fixed-21`                                  | random pile in [8, 21] per episode, or always the arena's 21                                                                     |
| `rewardShaping` | `none`, `potential-mod4`                                   | optional potential-based mod-4 shaping (φ(terminal)=0, never changes the optimal policy); win-rate evals always run **unshaped** |

### The nim v2 observation (and legacy artifacts)

Training and serving share one observation contract per game
(`ai/inference-service/encoders.py` mirrors the adapters). For nim the v2
contract is a `(5,)` vector: `[pile/21, onehot4(pile % 4)]` — proven
necessary: with only the normalized scalar, on-policy PPO cannot learn nim at
all (collapses to a best-constant ~0.30 win rate); with the mod-4 one-hot it
reaches the theoretical optimum. The serving encoder normalizes (the Node side
sends the raw `{remaining}`) and dispatches on the **loaded artifact's**
recorded `obs_size`: legacy `(1,)` artifacts keep working and now receive the
normalized `[pile/21]` they were actually trained on.

## The trainer UI is real data, full stop

The trainer workflow surfaces (dashboard, new-run form, live page) read and
write the live API only — there is no mock mode and no flag. The dashboard is
organized as a build-up: count chips and a single Live-Now card at a glance;
Runs / Deployments / Models sections that open on demand (chips are the doors
— clicking one opens its section pre-filtered); per-run row expansion for
config, full errors, and artifact integrity (bytes + sha256); and raw session
data one level deeper. Zero-count states render nothing.

Two ways to start a run, same result:

- **From the web**: "New training run" registers a queued session and the live
  page shows the exact `--job-id` command to connect your trainer
  (`session_reporter.attach(job_id)` under the hood). The page is already
  subscribed — it flips live on the trainer's first report.
- **From the CLI**: `start()` registers and reports in one go.

The trainer e2e suites (`client/tests/e2e/trainer-*.e2e.spec.ts`,
`training-job-live`, `new-training-run`) create every fixture through the live
API with a throwaway user per suite — they are the standing proof that what
the UI shows is what a real run produced. The model **discovery** pages
(browse / card / fork) remain fixture-backed until their endpoints land; that,
plus a persisted-series compare-runs view and a matches-over-time sparkline
derived from MatchRepo, is the next block.

## Demo runbook

1. **Redis** must be running (`redis-server`, or `brew services start redis`).
2. **Backend + frontend**:

   ```bash
   REDIS_URL=redis://localhost:6379 npm run dev
   ```

3. Log in (e.g. `user0` / `pwd0000`) and open **AI Trainer** — a fresh user
   sees the two-step quickstart (kit one-liner + run command).
4. Start a real local run (everything in the pipeline is live data — there is
   no synthetic-metrics mode):

   ```bash
   python3 ai/train.py --game nim --username user0 --password pwd0000
   ```

   …or register from the web form first and attach with the shown `--job-id`
   command (or let the install.sh one-liner do the whole hand-off).

5. Open the printed `/trainer/jobs/<id>` URL: the queued handoff card yields
   to the live chart on the first report, and the metrics update with each
   chunk (~2k steps per report).
6. Optional beats: click **Cancel** in the UI and watch the trainer log
   `canceled from the web UI - stopping`; a completed run uploads its artifact
   automatically, lighting up Download/Deploy and the sha-256 in the Advanced
   panel.

### Known limitations (accepted, documented)

- **The live chart is per-visit**: it accumulates from the stream while the
  page is open (labeled "live since you opened this page"). Persisting a
  downsampled series server-side is queued as future work and would also
  re-enable a run-comparison view.
- **Cancel emits no live event** (the bridge contract has no `canceled`
  status). The canceling tab refetches; another open tab keeps the stale state
  until refreshed. The local trainer always finds out on its next report.
