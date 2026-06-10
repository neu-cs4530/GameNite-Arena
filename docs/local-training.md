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
repo by hand. One line fetches everything into `./gamenite-training-kit/`:

```bash
curl -fsSL http://localhost:8000/api/training/kit/install.sh | sh
```

(or click **Get the local training kit** on the AI Trainer dashboard, or fetch
individual files from `GET /api/training/kit/<name>` — the manifest is at
`GET /api/training/kit`). The kit contains `session_reporter.py`, the adapter
SDK (`base_adapter.py` + per-game examples), `requirements.txt`, and the
`demo_local_session.py` smoke harness.

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

## The real thing

`ai/example_local_training_nim.py` is the canonical full workflow with nothing
faked: chunked SB3 PPO training through the adapter SDK, real rollout
evaluation per chunk, live reporting, artifact upload, and a round-trip check
that rebuilds the platform-stored `.pth` the way the inference service does.
Verified end to end (a 30k-step run reaches the optimal Nim policy):

```bash
python3 ai/example_local_training_nim.py --username user0 --password pwd0000
```

## Demo runbook

1. **Redis** must be running (`redis-server`, or `brew services start redis`).
2. **Backend + frontend** in real-training mode:

   ```bash
   REDIS_URL=redis://localhost:6379 VITE_REAL_TRAINING=1 npm run dev
   ```

   `VITE_REAL_TRAINING=1` switches the trainer pages from mock fixtures to the
   real session API + socket bridge. A yellow "Real training mode" badge shows
   on the trainer dashboard and live-job page whenever the flag is on.

3. Log in (e.g. `user0` / `pwd0000`) and open **AI Trainer**.
4. Start a fake local run (synthetic metrics, no real training):

   ```bash
   python3 ai/demo_local_session.py --username user0 --password pwd0000 \
       --game nim --episodes 40 --steps 20 --step-delay 1.5
   ```

5. Open the printed `/trainer/jobs/<id>` URL: status flips queued → running,
   the chart animates from the live stream, and the metrics panel updates.
6. Optional beats: click **Cancel** in the UI and watch the script log
   `server says canceled — stopping the local loop`; re-run with
   `--upload-artifact` to light up the Download button.

### Demo caveats (known, accepted for Sprint 1)

- **Do not refresh mid-run**: curve points live in the browser (accumulated
  from events); a refresh keeps the latest snapshot but drops the history
  until two new points arrive.
- **Cancel emits no live event** (the bridge contract has no `canceled`
  status). The canceling tab refetches; another open tab would keep showing
  the stale state until refreshed. The local trainer always finds out on its
  next report.
- **Run the e2e suite against a clean dev server.** The Playwright suite
  asserts on mock fixtures; if a `VITE_REAL_TRAINING=1` dev server is still on
  :4530, Playwright reuses it and the trainer suites fail. Kill it first (or
  `CI=1 npx playwright test` to force fresh servers).
- In real mode the web "New training run" form registers a session that stays
  **queued** until a local trainer attaches to that model — the normal flow is
  to start runs from the CLI.
