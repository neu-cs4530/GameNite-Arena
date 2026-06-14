# GameNite Arena — AI Adapter Guide

Complete reference for building, training, and deploying a custom AI model on
GameNite Arena.

---

## Overview

GameNite Arena lets you train a reinforcement learning model on any supported
game and deploy it to play ranked matches automatically on your behalf. The
platform handles matchmaking, move validation, Glicko-2 ratings, and live
broadcasting — you just provide the game logic.

**Supported games**

| Game        | Observation size | Action space | Notes                              |
| ----------- | ---------------- | ------------ | ---------------------------------- |
| `nim`       | 1                | 3            | Single pile, take 1/2/3 objects    |
| `guess`     | 2                | 100          | Guess a number 1–100               |
| `checkers`  | 160              | dynamic      | 32 dark squares × 5 one-hot values |
| `connect4`  | 42               | 7            | 6×7 board, column index            |
| `tictactoe` | 9                | 9            | 3×3 board, cell index              |

---

## Quick start

```bash
# 1. Get the local training kit
curl -fsSL https://summer26-project-su26-group-109.onrender.com/api/training/kit/install.sh | sh

# 2. Activate the kit environment
cd gamenite-kit
conda activate course4100   # or your local Python env

# 3. Train and upload
python3 example_local_training_nim.py \
  --base-url https://summer26-project-su26-group-109.onrender.com \
  --username <your-username> \
  --password <your-password>
```

---

## The adapter contract

Every model is a subclass of `GameNiteAdapter` from `base_adapter.py`. You
implement three methods; the base class owns the training loop and artifact
serialisation.

```python
from base_adapter import GameNiteAdapter
import numpy as np
from stable_baselines3.common.vec_env import VecEnv

class MyNimAdapter(GameNiteAdapter):

    def __init__(self):
        super().__init__(game="nim", user_id="your-user-id")

    def get_state_representation(self, board) -> np.ndarray:
        """
        Convert the raw board value into a flat float32 observation vector.
        Must match the shape in GAME_OBS_SIZES (base_adapter.py).
        """
        return np.array([float(board)], dtype=np.float32)

    def get_action(self, state: np.ndarray) -> int:
        """
        Return an action index given an observation vector.
        Used for manual evaluation outside SB3 training.
        """
        return int(np.argmax(state))

    def build_env(self) -> VecEnv:
        """
        Return a vectorised Gym environment for self-play training.
        Observation and action spaces must match the game's spec above.
        """
        from stable_baselines3.common.env_util import make_vec_env
        return make_vec_env(MyNimEnv, n_envs=4)
```

### Observation encoding reference

| Game        | Shape         | Values                                                           |
| ----------- | ------------- | ---------------------------------------------------------------- |
| `nim`       | `(5,)` v2     | `[remaining/21, onehot4(remaining % 4)]` — v2 contract           |
| `nim`       | `(1,)` legacy | `[remaining/21]` normalized — legacy artifacts                   |
| `guess`     | `(2,)`        | `[num_opponents/3, 0.0]` (adapter uses `numguesser` as game key) |
| `tictactoe` | `(9,)`        | each cell: `-1` opponent, `0` empty, `1` you                     |
| `connect4`  | `(42,)`       | 6×7 row-major, same encoding as tictactoe                        |
| `checkers`  | `(160,)`      | 32 dark squares × 5 one-hot: empty/R/B/RK/BK                     |

### Action encoding reference

| Game        | Action `a`  | Meaning                       |
| ----------- | ----------- | ----------------------------- |
| `nim`       | `0 / 1 / 2` | take 1 / 2 / 3 objects        |
| `guess`     | `0 – 99`    | guess `a + 1` (i.e. 1–100)    |
| `tictactoe` | `0 – 8`     | cell index, row-major         |
| `connect4`  | `0 – 6`     | column index                  |
| `checkers`  | `0 – N-1`   | index into `legal_moves` list |

---

## Training

```python
adapter = MyNimAdapter()

# Fresh training run
adapter.train(total_episodes=100_000)

# Resume from a checkpoint (CoS 2.10)
adapter.train(total_episodes=100_000, checkpoint_path="previous_run.pth")

# Save the artifact
adapter.save("my_nim_model.pth")
```

The `.pth` artifact schema:

```
{
  "sb3_state":       OrderedDict   — SB3 PPO policy state dict
  "metadata":        {
      game, user_id, adapter_version,
      obs_size, action_space, trained_at
  }
  "hyperparameters": { learning_rate, n_steps }
}
```

`adapter_version` must be `"1.0.0"` to pass server-side validation.

---

## Uploading and deploying

### Via the trainer dashboard

1. Go to **Trainer** in the nav bar.
2. Click **New training run** and register your session.
3. Run your training script locally — progress streams to the dashboard live.
4. When training completes, upload the `.pth` from the job's live page.
5. Click **Deploy** — your model enters the ranked matchmaking queue
   immediately.

### Via the session reporter (CLI / script)

```python
from session_reporter import GameNiteSession

session = GameNiteSession(
    "https://summer26-project-su26-group-109.onrender.com",
    username="your-username",
    password="your-password",
)

# Register the run
job_id = session.start(
    "nim",
    episodes=100_000,
    learning_rate=3e-4,
    model_display_name="my-nim-bot",
)

# Optional: resume from a checkpoint (CoS 2.10)
ckpt = session.download_checkpoint("resume.pth")
adapter.train(total_episodes=100_000, checkpoint_path=ckpt)

# Report progress inside your training loop
for batch in range(100):
    # ... train one batch ...
    keep_going = session.report(
        episodes=(batch + 1) * 1000,
        metrics={"winRate": win_rate, "meanReward": mean_reward},
    )
    if not keep_going:   # canceled from the web UI
        break

# Complete and upload
session.complete(final_metrics={"winRate": win_rate})
session.upload_artifact("my_nim_model.pth")
```

### Deployment limits

- Maximum **3 active deployments per game** per user (CoS 2.7).
- A deployed model plays ranked matches automatically using the same move
  submission path as a human player (CoS 2.6).
- After **3 consecutive invalid moves** the deployment is forfeited (CoS 2.8).
- Pause, resume, or retire a deployment any time from the Trainer dashboard
  (CoS 2.9).

---

## Inference service API

The inference service is a separate FastAPI process that loads `.pth`
artifacts and serves moves. It is used internally by the game loop; you do not
need to call it directly unless you are developing against the platform
locally.

**Base URL (local):** `http://localhost:8001`  
**Base URL (Render):** set `INFERENCE_SERVICE_URL` on the Node server.

| Method | Path                | Description                                            |
| ------ | ------------------- | ------------------------------------------------------ |
| `GET`  | `/inference/health` | Liveness check + list of loaded deployment IDs         |
| `POST` | `/inference/load`   | Load a `.pth` from `models/<model_id>.pth` into a slot |
| `POST` | `/inference/unload` | Free a runtime slot                                    |
| `POST` | `/inference/move`   | Run one forward pass and return a move                 |

**`POST /inference/load`**

```json
{
  "deployment_id": "string",
  "game": "nim | guess | checkers | connect4 | tictactoe",
  "model_id": "string"
}
```

**`POST /inference/move`**

```json
{
  "deployment_id": "string",
  "state": {
    /* game-specific, see observation encoding above */
  },
  "legal_moves": ["array", "required", "for", "checkers"]
}
```

Response:

```json
{ "deployment_id": "string", "move": <number or string> }
```

On 3 consecutive invalid encodings the response is:

```json
{
  "detail": {
    "error": "string",
    "consecutive_invalid": 3,
    "forfeit": true
  }
}
```

---

## Running locally

```bash
# Install Python dependencies
cd ai
pip install -r requirements.txt

# Start the inference service
cd inference-service
set -a; source .env; set +a
uvicorn inference_service:app --port 8001 --reload

# Run the inference load test (#39)
python3 test_inference_load.py
# Expected: sequential p95 < 50ms, concurrent p95 < 200ms, 0% errors

# Run the inference boundary tests (#28)
cd ..
pytest tests/test_inference_integration.py -v
```

**Required environment variables** (in `ai/inference-service/.env`):

```
MODEL_STORE_PATH        path to the models directory (default: "models")
INFERENCE_SERVICE_URL   Node server uses this to reach the inference service
```

---

## Troubleshooting

| Symptom                                | Likely cause                        | Fix                                                                                              |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `422 Unknown game: numguesser`         | Old game key                        | Use `"guess"` not `"numguesser"`                                                                 |
| `422 Adapter version mismatch`         | Stale artifact                      | Retrain with current `base_adapter.py`                                                           |
| `404 Artifact not found`               | Wrong `model_id` or missing file    | Check file exists in `models/<model_id>.pth`                                                     |
| `500 Loaded artifact has no predict()` | Wrong export format                 | Ensure `base_adapter.save()` was used                                                            |
| Nim model plays randomly / won't learn | Legacy `(1,)` obs or wrong encoding | Retrain with v2 `NimAdapter` — v2 obs `(5,)` with mod-4 one-hot is required for PPO to learn nim |
| AI never takes its turn (guess game)   | Old `game.service.ts`               | Update to Sprint 3 version                                                                       |
| AI freezes on nim endgame              | Old `game.service.ts`               | Update to Sprint 3 version (move clamping)                                                       |
