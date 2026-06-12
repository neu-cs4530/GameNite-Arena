"""
GameNite Arena — SLOW verification: real PPO learns on the v2 nim env
=====================================================================
The standing proof that the v2 observation contract actually trains: a
short real PPO burst (~8k steps, no platform, no mocks) through the
adapter must strictly beat the untrained baseline's win rate against the
unshaped default env (misère opponent, 25% blunders).

Background: with the legacy scalar observation PPO cannot learn nim at
all (collapses to best-constant ~0.30); with [pile/21, onehot4(pile % 4)]
it reaches the theoretical optimum. If this test stops passing, the
contract (or the pinned stack) broke.

Skipped by default to keep the suite fast. Run it with:

    GAMENITE_SLOW=1 pytest ai/tests/test_v2_learning_slow.py -v -s

Runtime: well under 90 s on a laptop.
"""

import os

import pytest

import train as train_cli

RUN_SLOW = os.environ.get("GAMENITE_SLOW") == "1"
TRAIN_STEPS = 8_192          # 4 PPO rollouts (n_steps 512 x 4 envs)


@pytest.mark.slow
@pytest.mark.skipif(not RUN_SLOW, reason="set GAMENITE_SLOW=1 to run the real PPO burst")
def test_short_ppo_burst_beats_untrained_baseline():
    from stable_baselines3 import PPO

    from adapter.example_nim_adapter import NimAdapter

    env_params = train_cli.nim_env_params(None)   # catalog defaults
    adapter = NimAdapter(user_id="verify", env_kwargs=env_params)
    env = adapter.build_env()
    model = PPO("MlpPolicy", env, learning_rate=3e-4,
                n_steps=train_cli.PPO_N_STEPS, seed=0, verbose=0)

    baseline_win, baseline_reward = train_cli.evaluate_nim(model, env_params)
    model.learn(total_timesteps=TRAIN_STEPS)
    trained_win, trained_reward = train_cli.evaluate_nim(model, env_params)
    env.close()

    print(f"\n[verify] untrained: winRate={baseline_win:.3f} "
          f"meanReward={baseline_reward:+.3f}")
    print(f"[verify] after {TRAIN_STEPS} steps: winRate={trained_win:.3f} "
          f"meanReward={trained_reward:+.3f}")

    assert trained_win > baseline_win, (
        f"PPO did not improve on the v2 env: {baseline_win:.3f} -> {trained_win:.3f}"
    )
    # The proven recipe clears ~0.6 by 6k steps; 0.45 leaves slack for seed
    # variance while still being far beyond best-constant scalar play (~0.30).
    assert trained_win >= 0.45, (
        f"winRate {trained_win:.3f} after {TRAIN_STEPS} steps is below the "
        f"floor the v2 contract was proven to clear"
    )
