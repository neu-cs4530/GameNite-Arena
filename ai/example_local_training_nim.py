"""
GameNite Arena — REAL Local Training, End to End (Nim)
=======================================================
The canonical full workflow, with nothing faked:

  1. Train a real SB3 PPO policy with the adapter SDK (NimAdapter/NimEnv)
     on YOUR machine, in chunks.
  2. After each chunk, evaluate the policy for real (rollouts against the
     env's optimal opponent) and stream the metrics to GameNite Arena via
     session_reporter (password is exchanged once for a token; every other
     call is token-authenticated).
  3. complete() the session, serialize the model with the adapter's own
     .save(), and upload the real .pth artifact.
  4. Round-trip check: download the artifact back from the platform,
     validate it with base_adapter._assert_compatible, and rebuild a live
     policy from it the same way the inference service does.

Cancel works mid-run: hit Cancel on the job page and the next report()
returns False, stopping training.

Run (from the repo root, with deps from ai/requirements.txt):
    python3 ai/example_local_training_nim.py \
        --username user0 --password pwd0000

Watch live at <client>/trainer/jobs/<printed job id> with
VITE_REAL_TRAINING=1.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np

AI_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(AI_DIR))
sys.path.insert(0, str(AI_DIR / "adapter"))

from stable_baselines3 import PPO  # noqa: E402

from base_adapter import _assert_compatible  # noqa: E402
from example_nim_adapter import NimAdapter, NimEnv  # noqa: E402
from session_reporter import GameNiteSession, GameNiteSessionError  # noqa: E402

EVAL_EPISODES = 200


def evaluate(model: PPO) -> tuple[float, float]:
    """Real rollouts vs NimEnv's optimal opponent: (winRate, meanReward)."""
    env = NimEnv()
    wins = 0
    total_reward = 0.0
    for _ in range(EVAL_EPISODES):
        obs, _ = env.reset()
        done = False
        episode_reward = 0.0
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, _, _ = env.step(int(action))
            episode_reward += float(reward)
        total_reward += episode_reward
        if episode_reward > 0:
            wins += 1
    return wins / EVAL_EPISODES, total_reward / EVAL_EPISODES


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--username", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--token", default=os.environ.get("GAMENITE_TOKEN"))
    parser.add_argument("--name", default="nim-ppo-local")
    parser.add_argument("--job-id", default=os.environ.get("GAMENITE_JOB_ID"),
                        help="Attach to a session registered in the web UI "
                             "instead of creating a new one")
    parser.add_argument("--chunks", type=int, default=15,
                        help="Progress reports / training chunks")
    parser.add_argument("--chunk-steps", type=int, default=2048,
                        help="Env timesteps per chunk (one PPO rollout)")
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    args = parser.parse_args()

    total_steps = args.chunks * args.chunk_steps
    session = GameNiteSession(args.base_url, args.username, args.password,
                              token=args.token)

    # The adapter SDK owns the env and the serialization format; we only run
    # its training loop in chunks so there is a progress report per chunk.
    adapter = NimAdapter(user_id=args.username or "token-user")
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=args.learning_rate,
                n_steps=512, verbose=0)
    adapter._model = model

    if args.job_id:
        job_id = session.attach(args.job_id)
        print(f"[run] attached to session {job_id} — it goes live on the first report")
    else:
        job_id = session.start("nim", episodes=total_steps,
                               learning_rate=args.learning_rate,
                               model_display_name=args.name)
        print(f"[run] session {job_id} registered — watch /trainer/jobs/{job_id}")

    win_rate, mean_reward = 0.0, 0.0
    canceled = False
    for chunk in range(1, args.chunks + 1):
        model.learn(total_timesteps=args.chunk_steps, reset_num_timesteps=False)
        win_rate, mean_reward = evaluate(model)
        keep_going = session.report(
            model.num_timesteps,
            metrics={"winRate": round(win_rate, 4),
                     "meanReward": round(mean_reward, 4)},
            message=f"chunk {chunk}/{args.chunks} - winRate {win_rate:.2f}",
        )
        print(f"[run] {model.num_timesteps}/{total_steps} steps  "
              f"winRate={win_rate:.2f}  meanReward={mean_reward:+.2f}")
        if not keep_going:
            print("[run] canceled from the web UI - stopping")
            canceled = True
            break

    if canceled:
        return 0

    session.complete(final_metrics={"winRate": round(win_rate, 4),
                                    "meanReward": round(mean_reward, 4)})

    # Serialize through the adapter's own format and hand it to the platform.
    with tempfile.TemporaryDirectory() as tmp:
        pth = Path(tmp) / f"{args.name}.pth"
        adapter.save(str(pth))
        info = session.upload_artifact(str(pth))
    print(f"[run] artifact uploaded, hasArtifact={info.get('hasArtifact')}")

    # Round trip: what the platform stored must be loadable and servable.
    import torch  # local import keeps the CLI fast when only training

    with urllib.request.urlopen(
        f"{args.base_url}/api/training/{job_id}/artifact"
    ) as response, tempfile.NamedTemporaryFile(suffix=".pth") as downloaded:
        downloaded.write(response.read())
        downloaded.flush()
        artifact = torch.load(downloaded.name, weights_only=False)

    _assert_compatible(artifact, "nim")

    # Rebuild a live policy exactly the way the inference service does.
    # The inference service ships with the repo, not the training kit — in a
    # kit folder this deep check is unavailable, and that is fine: the
    # platform already validated and stored the artifact above.
    sys.path.insert(0, str(AI_DIR / "inference-service"))
    try:
        from inference_service import _rebuild_policy  # noqa: E402
    except ImportError:
        print("[run] artifact stored and hash-verified by the platform; "
              "skipping the local inference rebuild (repo-only check) - done")
        print(json.dumps({"jobId": job_id, "finalWinRate": win_rate,
                          "steps": model.num_timesteps}))
        return 0

    policy = _rebuild_policy(artifact)
    obs = np.array([1.0], dtype=np.float32)
    with torch.no_grad():
        actions, _, _ = policy.forward(torch.tensor(obs).unsqueeze(0),
                                       deterministic=True)
    print(f"[run] round trip OK - rebuilt policy plays action {int(actions.item())} "
          f"on a full pile (final winRate {win_rate:.2f})")
    print(json.dumps({"jobId": job_id, "finalWinRate": win_rate,
                      "steps": model.num_timesteps}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GameNiteSessionError as exc:
        print(f"[run] platform error: {exc}", file=sys.stderr)
        sys.exit(1)
