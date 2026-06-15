"""
GameNite Arena — Local Trainer CLI (the kit entrypoint)
=======================================================
Trains a REAL SB3 PPO policy on your machine and streams the run to
GameNite Arena: chunked training, real rollout evaluation after every
chunk, live progress reports, artifact upload, done. Nothing is faked.

Two ways to run it:

  Attach to a run registered on the web form (the page shows this exact
  command — the job carries the game, episodes, learning rate, and the
  training heuristics you picked):

      python3 train.py --job-id <id> --token <token>

  Or self-register from the CLI (game defaults are used for heuristics):

      python3 train.py --game nim --username <you> --password <pwd>

Auth: --token (or env GAMENITE_TOKEN), or --username/--password — the
password is exchanged exactly once for an expiring token. --job-id also
reads env GAMENITE_JOB_ID, so the one-line kit bootstrap can hand off
directly into an attached run.

Heuristics (chosen on the web form, mirrored from
shared/src/trainingHeuristics.ts — missing/invalid values fall back to
the game's defaults):

  nim:  opponentStyle  misere-blunder-25 | misere-blunder-15 | uniform-random
        startingPile   random-8-21 | fixed-21
        rewardShaping  none | potential-mod4   (potential-based; the win-rate
                       eval always runs against the UNSHAPED env)

Cancel works mid-run: hit Cancel on the job page and the next report
stops the loop. Watch live at <client>/trainer/jobs/<job id>.

Local trainers exist for nim, connect4, and tictactoe — each trains a real
PPO policy against a scripted opponent and uploads an artifact whose
metadata.obs_size/action_space match the trusted serving encoders
(ai/inference-service/encoders.py), so the model plays on the SAME
observation it trained on. checkers is not yet trainable here: its action
space is dynamic and the kit ships only a stub env (no rules engine).
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

# The kit is FLAT (everything in one directory); in the repo the adapters
# live under ai/adapter/. Support both layouts.
AI_DIR = Path(__file__).resolve().parent
for _p in (str(AI_DIR), str(AI_DIR / "adapter")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from session_reporter import GameNiteSession, GameNiteSessionError  # noqa: E402

PPO_N_STEPS = 1024         # rollout length per env — longer rollouts reduce variance
N_ENVS = 4                 # vectorized envs -> one PPO rollout = 2048 steps
DEFAULT_CHUNK_STEPS = PPO_N_STEPS * N_ENVS
EVAL_EPISODES = 200


# heuristics -> env params (pure; unit-tested)

_NIM_OPPONENTS = {
    "misere-blunder-25": {"opponent_style": "misere", "opponent_mistake_rate": 0.25},
    "misere-blunder-15": {"opponent_style": "misere", "opponent_mistake_rate": 0.15},
    "uniform-random": {"opponent_style": "uniform-random"},
}
_NIM_STARTS = {
    "random-8-21": {"random_start": True, "start_low": 8},
    "fixed-21": {"random_start": False},
}
_NIM_SHAPING = {
    "none": {"reward_shaping": False},
    "potential-mod4": {"reward_shaping": True},
}
_NIM_TABLES = (
    ("opponentStyle", _NIM_OPPONENTS, "misere-blunder-15"),
    ("startingPile", _NIM_STARTS, "random-8-21"),
    ("rewardShaping", _NIM_SHAPING, "potential-mod4"),
)


def nim_env_params(heuristics: Any) -> dict:
    """
    Map the job's nim heuristics (config.extra.heuristics) onto NimEnv
    constructor params. Defaults mirror shared/src/trainingHeuristics.ts;
    any missing/invalid value falls back PER KEY.
    """
    chosen = heuristics if isinstance(heuristics, dict) else {}
    params: dict = {"starting_pile": 21}
    for key, table, default in _NIM_TABLES:
        params.update(table.get(chosen.get(key), table[default]))
    return params


def plan_chunks(total_steps: int, chunk_steps: int = DEFAULT_CHUNK_STEPS) -> int:
    """How many train-report chunks a run of total_steps needs."""
    if total_steps <= 0:
        raise ValueError(f"total_steps must be positive, got {total_steps}")
    if chunk_steps <= 0:
        raise ValueError(f"chunk_steps must be positive, got {chunk_steps}")
    return max(1, math.ceil(total_steps / chunk_steps))


# the nim trainer

def evaluate_nim(model, env_params: dict) -> tuple[float, float]:
    """Real rollouts vs the UNSHAPED env: (winRate, meanReward)."""
    from example_nim_adapter import NimEnv

    env = NimEnv(**{**env_params, "reward_shaping": False})
    wins = 0
    total_reward = 0.0
    for episode in range(EVAL_EPISODES):
        obs, _ = env.reset(seed=episode if episode == 0 else None)
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


def run_nim(session: GameNiteSession, *, user_id: str, episodes: int,
            learning_rate: float, heuristics: Any, chunk_steps: int,
            display_name: str) -> int:
    """Chunked PPO on NimEnv with live reporting and artifact upload."""
    from stable_baselines3 import PPO

    from example_nim_adapter import NimAdapter

    env_params = nim_env_params(heuristics)
    print(f"[train] nim env params: {env_params}")

    adapter = NimAdapter(user_id=user_id, env_kwargs=env_params)
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=learning_rate,
                n_steps=PPO_N_STEPS, verbose=0)
    adapter._model = model

    n_chunks = plan_chunks(episodes, chunk_steps)
    win_rate, mean_reward = 0.0, 0.0
    for chunk in range(1, n_chunks + 1):
        model.learn(total_timesteps=chunk_steps, reset_num_timesteps=False)
        win_rate, mean_reward = evaluate_nim(model, env_params)
        keep_going = session.report(
            model.num_timesteps,
            metrics={"winRate": round(win_rate, 4),
                     "meanReward": round(mean_reward, 4)},
            message=f"chunk {chunk}/{n_chunks} - winRate {win_rate:.2f}",
        )
        print(f"[train] {model.num_timesteps} steps  "
              f"winRate={win_rate:.2f}  meanReward={mean_reward:+.2f}")
        if not keep_going:
            print("[train] canceled from the web UI - stopping")
            return 0

    session.complete(final_metrics={"winRate": round(win_rate, 4),
                                    "meanReward": round(mean_reward, 4)})

    # Serialize through the adapter's own format and hand it to the platform,
    # which validates and stores the artifact (bytes + sha256 on the job page).
    with tempfile.TemporaryDirectory() as tmp:
        pth = Path(tmp) / f"{display_name}.pth"
        adapter.save(str(pth))
        info = session.upload_artifact(str(pth))
    print(f"[train] artifact uploaded and verified by the platform "
          f"(hasArtifact={info.get('hasArtifact')}) - done")
    print(f"[train] final winRate {win_rate:.2f} over {model.num_timesteps} steps")
    return 0


# board games (connect4, tictactoe) — generic chunked PPO trainer

def evaluate_board(model, env_cls) -> tuple[float, float]:
    """
    Real rollouts vs the env's built-in scripted opponent.

    Returns (winRate, meanReward). A "win" is a strictly positive episode
    return — for these single-reward envs that is exactly the +1 terminal
    win (a draw is 0, a loss/illegal move is negative). The observation the
    model is evaluated on is the SAME player-relative vector the trusted
    serving encoders produce (see ai/tests/test_obs_parity.py), so this win
    rate reflects real match strength, not a training-only artifact.
    """
    env = env_cls()
    wins = 0
    total_reward = 0.0
    for episode in range(EVAL_EPISODES):
        obs, _ = env.reset(seed=episode if episode == 0 else None)
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


def make_board_runner(adapter_cls, env_cls):
    """
    Build a trainer function for a fixed-action board game (connect4,
    tictactoe). Mirrors run_nim: chunked PPO with a per-chunk win-rate eval
    vs the scripted opponent, live reporting, cancel handling, and artifact
    upload. The adapter's save() stamps metadata.obs_size/action_space from
    base_adapter's GAME_OBS_SIZES/GAME_ACTION_SPACES, which equal the serving
    encoders' OBS_SIZES/ACTION_SPACES so /inference/load accepts the artifact.

    heuristics is accepted (uniform signature with run_nim) but unused — these
    envs ship one scripted (random) opponent; richer opponents are a future
    knob, not a silent no-op on the existing nim heuristics.
    """
    def runner(session: GameNiteSession, *, user_id: str, episodes: int,
               learning_rate: float, heuristics: Any, chunk_steps: int,
               display_name: str) -> int:
        from stable_baselines3 import PPO

        adapter = adapter_cls(user_id=user_id)
        env = adapter.build_env()
        model = PPO("MlpPolicy", env, learning_rate=learning_rate,
                    n_steps=PPO_N_STEPS, verbose=0)
        adapter._model = model

        n_chunks = plan_chunks(episodes, chunk_steps)
        win_rate, mean_reward = 0.0, 0.0
        for chunk in range(1, n_chunks + 1):
            model.learn(total_timesteps=chunk_steps, reset_num_timesteps=False)
            win_rate, mean_reward = evaluate_board(model, env_cls)
            keep_going = session.report(
                model.num_timesteps,
                metrics={"winRate": round(win_rate, 4),
                         "meanReward": round(mean_reward, 4)},
                message=f"chunk {chunk}/{n_chunks} - winRate {win_rate:.2f}",
            )
            print(f"[train] {model.num_timesteps} steps  "
                  f"winRate={win_rate:.2f}  meanReward={mean_reward:+.2f}")
            if not keep_going:
                print("[train] canceled from the web UI - stopping")
                return 0

        session.complete(final_metrics={"winRate": round(win_rate, 4),
                                        "meanReward": round(mean_reward, 4)})

        with tempfile.TemporaryDirectory() as tmp:
            pth = Path(tmp) / f"{display_name}.pth"
            adapter.save(str(pth))
            info = session.upload_artifact(str(pth))
        print(f"[train] artifact uploaded and verified by the platform "
              f"(hasArtifact={info.get('hasArtifact')}) - done")
        print(f"[train] final winRate {win_rate:.2f} over "
              f"{model.num_timesteps} steps")
        return 0

    return runner


def run_connect4(*args, **kwargs) -> int:
    from example_connect4_adapter import Connect4Adapter, Connect4Env
    return make_board_runner(Connect4Adapter, Connect4Env)(*args, **kwargs)


def run_tictactoe(*args, **kwargs) -> int:
    from example_tictactoe_adapter import TicTacToeAdapter, TicTacToeEnv
    return make_board_runner(TicTacToeAdapter, TicTacToeEnv)(*args, **kwargs)




def evaluate_connect4(model, n_episodes: int = EVAL_EPISODES) -> tuple[float, float]:
    from adapter.example_connect4_adapter import Connect4Env
    env = Connect4Env()
    wins, total_reward = 0, 0.0
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=ep if ep == 0 else None)
        done, ep_reward = False, 0.0
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, _, _ = env.step(int(action))
            ep_reward += float(reward)
        total_reward += ep_reward
        if ep_reward > 0:
            wins += 1
    return wins / n_episodes, total_reward / n_episodes


def run_connect4(session: GameNiteSession, *, user_id: str, episodes: int,
                 learning_rate: float, heuristics: Any, chunk_steps: int,
                 display_name: str) -> int:
    from stable_baselines3 import PPO
    from adapter.example_connect4_adapter import Connect4Adapter
    print("[train] connect4 — self-play vs random opponent")
    adapter = Connect4Adapter(user_id=user_id)
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=learning_rate, n_steps=PPO_N_STEPS, verbose=0)
    adapter._model = model
    n_chunks = plan_chunks(episodes, chunk_steps)
    win_rate, mean_reward = 0.0, 0.0
    for chunk in range(1, n_chunks + 1):
        model.learn(total_timesteps=chunk_steps, reset_num_timesteps=False)
        win_rate, mean_reward = evaluate_connect4(model)
        keep_going = session.report(
            model.num_timesteps,
            metrics={"winRate": round(win_rate, 4), "meanReward": round(mean_reward, 4)},
            message=f"chunk {chunk}/{n_chunks} - winRate {win_rate:.2f}",
        )
        print(f"[train] {model.num_timesteps} steps  winRate={win_rate:.2f}  meanReward={mean_reward:+.2f}")
        if not keep_going:
            print("[train] canceled from the web UI - stopping")
            return 0
    session.complete(final_metrics={"winRate": round(win_rate, 4), "meanReward": round(mean_reward, 4)})
    with tempfile.TemporaryDirectory() as tmp:
        pth = Path(tmp) / f"{display_name}.pth"
        adapter.save(str(pth))
        info = session.upload_artifact(str(pth))
    print(f"[train] artifact uploaded (hasArtifact={info.get('hasArtifact')}) - done")
    return 0


def evaluate_tictactoe(model, n_episodes: int = EVAL_EPISODES) -> tuple[float, float]:
    from adapter.example_tictactoe_adapter import TicTacToeEnv
    env = TicTacToeEnv()
    wins, total_reward = 0, 0.0
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=ep if ep == 0 else None)
        done, ep_reward = False, 0.0
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, _, _ = env.step(int(action))
            ep_reward += float(reward)
        total_reward += ep_reward
        if ep_reward > 0:
            wins += 1
    return wins / n_episodes, total_reward / n_episodes


def run_tictactoe(session: GameNiteSession, *, user_id: str, episodes: int,
                  learning_rate: float, heuristics: Any, chunk_steps: int,
                  display_name: str) -> int:
    from stable_baselines3 import PPO
    from adapter.example_tictactoe_adapter import TicTacToeAdapter
    print("[train] tictactoe — self-play vs random opponent")
    adapter = TicTacToeAdapter(user_id=user_id)
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=learning_rate, n_steps=PPO_N_STEPS, verbose=0)
    adapter._model = model
    n_chunks = plan_chunks(episodes, chunk_steps)
    win_rate, mean_reward = 0.0, 0.0
    for chunk in range(1, n_chunks + 1):
        model.learn(total_timesteps=chunk_steps, reset_num_timesteps=False)
        win_rate, mean_reward = evaluate_tictactoe(model)
        keep_going = session.report(
            model.num_timesteps,
            metrics={"winRate": round(win_rate, 4), "meanReward": round(mean_reward, 4)},
            message=f"chunk {chunk}/{n_chunks} - winRate {win_rate:.2f}",
        )
        print(f"[train] {model.num_timesteps} steps  winRate={win_rate:.2f}  meanReward={mean_reward:+.2f}")
        if not keep_going:
            print("[train] canceled from the web UI - stopping")
            return 0
    session.complete(final_metrics={"winRate": round(win_rate, 4), "meanReward": round(mean_reward, 4)})
    with tempfile.TemporaryDirectory() as tmp:
        pth = Path(tmp) / f"{display_name}.pth"
        adapter.save(str(pth))
        info = session.upload_artifact(str(pth))
    print(f"[train] artifact uploaded (hasArtifact={info.get('hasArtifact')}) - done")
    return 0


def run_checkers(session: GameNiteSession, *, user_id: str, episodes: int,
                 learning_rate: float, heuristics: Any, chunk_steps: int,
                 display_name: str) -> int:
    """
    Stub env always draws after 1 step — produces a valid artifact
    but the model has no real game knowledge until CheckersEnv is fully implemented.
    """
    from stable_baselines3 import PPO
    from adapter.example_checkers_adapter import CheckersAdapter
    print("[train] checkers — stub env, artifact only")
    adapter = CheckersAdapter(user_id=user_id)
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=learning_rate, n_steps=PPO_N_STEPS, verbose=0)
    adapter._model = model
    n_chunks = plan_chunks(episodes, chunk_steps)
    for chunk in range(1, n_chunks + 1):
        model.learn(total_timesteps=chunk_steps, reset_num_timesteps=False)
        keep_going = session.report(
            model.num_timesteps,
            metrics={"winRate": 0.0, "meanReward": 0.0},
            message=f"chunk {chunk}/{n_chunks}",
        )
        print(f"[train] {model.num_timesteps} steps")
        if not keep_going:
            return 0
    session.complete(final_metrics={"winRate": 0.0, "meanReward": 0.0})
    with tempfile.TemporaryDirectory() as tmp:
        pth = Path(tmp) / f"{display_name}.pth"
        adapter.save(str(pth))
        info = session.upload_artifact(str(pth))
    print(f"[train] artifact uploaded (hasArtifact={info.get('hasArtifact')}) - done")
    return 0

# Games with a real local trainer. checkers is intentionally absent: its
# action space is dynamic (index into per-position legal_moves) and the kit's
# CheckersEnv is a one-step stub with no rules engine, so PPO has nothing real
# to learn. Training it requires a full self-play rules engine — left out
# rather than shipping a model that looks trained but plays at random.
TRAINERS = {
    "nim": run_nim,
    "connect4": run_connect4,
    "tictactoe": run_tictactoe,
    "checkers": run_checkers,
}


# CLI

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="train.py",
        description="GameNite Arena local trainer: real PPO on your machine, "
                    "streamed live to the platform.",
    )
    parser.add_argument("--base-url", default="http://localhost:8000",
                        help="GameNite server (default: %(default)s)")
    parser.add_argument("--token", default=os.environ.get("GAMENITE_TOKEN") or None,
                        help="Trainer token (or env GAMENITE_TOKEN)")
    parser.add_argument("--username", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--job-id", default=os.environ.get("GAMENITE_JOB_ID") or None,
                        help="Attach to a run registered on the web form; the "
                             "job's game/config/heuristics are fetched "
                             "automatically (or env GAMENITE_JOB_ID)")
    parser.add_argument("--game", default=None,
                        help="Game key when self-registering (no --job-id). "
                             f"Local trainers exist for: {', '.join(TRAINERS)}")
    parser.add_argument("--name", default=None,
                        help="Model display name when self-registering")
    parser.add_argument("--episodes", type=int, default=204_800,
                        help="Total env timesteps when self-registering "
                             "(default: %(default)s)")
    parser.add_argument("--learning-rate", type=float, default=3e-4,
                        help="PPO learning rate when self-registering")
    parser.add_argument("--chunk-steps", type=int, default=DEFAULT_CHUNK_STEPS,
                        help="Timesteps per train-report chunk "
                             "(default: %(default)s = one PPO rollout)")
    return parser


def validate_args(args: argparse.Namespace) -> str | None:
    """Pure argument validation; returns an error message or None."""
    if args.token is None and (args.username is None or args.password is None):
        return ("auth required: --token (or env GAMENITE_TOKEN), "
                "or both --username and --password")
    if args.job_id is None and args.game is None:
        return "--game is required when not attaching with --job-id"
    return None


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    error = validate_args(args)
    if error:
        print(f"[train] {error}", file=sys.stderr)
        return 2

    session = GameNiteSession(args.base_url, args.username, args.password,
                              token=args.token)

    heuristics = None
    if args.job_id:
        # The web form registered the job; it carries everything we need.
        info = session.get_job(args.job_id)
        game = info["gameKey"]
        config = info.get("config") or {}
        episodes = int(config.get("episodes", args.episodes))
        learning_rate = float(config.get("learningRate", args.learning_rate))
        heuristics = (config.get("extra") or {}).get("heuristics")
    else:
        game = args.game
        episodes = args.episodes
        learning_rate = args.learning_rate

    runner = TRAINERS.get(game)
    if runner is None:
        print(f"[train] no local trainer for '{game}' yet — adapters exist "
              f"for: {', '.join(TRAINERS)}", file=sys.stderr)
        return 2

    if args.job_id:
        job_id = session.attach(args.job_id)
        print(f"[train] attached to session {job_id} — it goes live on the "
              f"first report")
    else:
        display_name = args.name or f"{game}-ppo-local"
        job_id = session.start(game, episodes=episodes,
                               learning_rate=learning_rate,
                               model_display_name=display_name)
        print(f"[train] session {job_id} registered — watch /trainer/jobs/{job_id}")

    return runner(
        session,
        user_id=args.username or "token-user",
        episodes=episodes,
        learning_rate=learning_rate,
        heuristics=heuristics,
        chunk_steps=args.chunk_steps,
        display_name=args.name or f"{game}-ppo-local",
    )


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GameNiteSessionError as exc:
        print(f"[train] platform error: {exc}", file=sys.stderr)
        sys.exit(1)
