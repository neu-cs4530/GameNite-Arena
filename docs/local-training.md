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

## Endpoints

All mutating routes take the standard
`{ auth: { username, password }, payload: ... }` body. Payload schemas:
`shared/src/trainingSession.types.ts`.

| Endpoint                        | Method | Purpose                                                                                                    |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
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
