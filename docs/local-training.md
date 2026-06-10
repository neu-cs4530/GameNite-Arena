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
4. Start a fake local run (synthetic metrics, no real training):

   ```bash
   python3 ai/demo_local_session.py --username user0 --password pwd0000 \
       --game nim --episodes 40 --steps 20 --step-delay 1.5
   ```

   …or register from the web form first and attach with the shown `--job-id`
   command.

5. Open the printed `/trainer/jobs/<id>` URL: the queued handoff card yields
   to the live chart on the first report, and the metrics update with each.
6. Optional beats: click **Cancel** in the UI and watch the script log
   `server says canceled — stopping the local loop`; re-run with
   `--upload-artifact` to light up Download/Deploy and the sha-256 in the
   Advanced panel.

### Known limitations (accepted, documented)

- **The live chart is per-visit**: it accumulates from the stream while the
  page is open (labeled "live since you opened this page"). Persisting a
  downsampled series server-side is queued as future work and would also
  re-enable a run-comparison view.
- **Cancel emits no live event** (the bridge contract has no `canceled`
  status). The canceling tab refetches; another open tab keeps the stale state
  until refreshed. The local trainer always finds out on its next report.
