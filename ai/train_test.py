"""
Quick training script — run this to produce a test .pth for testing #26.

Run from the ai/ directory:
    cd ai
    python train_test.py

Produces test_model.pth in the current directory.
Then upload it to R2 and test /load + /move.
"""

import sys
import os

# Ensure base_adapter is importable (it's at ai/ root)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecEnv

from base_adapter import GameNiteAdapter


# Minimal Nim environment
# obs: raw remaining pile (matches encoders.py which also passes raw remaining)
# action: 0=take1, 1=take2, 2=take3
# reward: +1 win, -1 lose

class NimEnv(gym.Env):
    START = 9

    def __init__(self):
        super().__init__()
        self.observation_space = spaces.Box(
            low=0.0, high=float(self.START),
            shape=(1,), dtype=np.float32,
        )
        self.action_space = spaces.Discrete(3)
        self.remaining = self.START

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.remaining = self.START
        return np.array([float(self.remaining)], dtype=np.float32), {}

    def step(self, action):
        take = int(action) + 1
        self.remaining = max(0, self.remaining - take)

        if self.remaining <= 0:
            # We took the last — we win
            return np.array([0.0], dtype=np.float32), 1.0, True, False, {}

        # Simple opponent: take 1
        self.remaining = max(0, self.remaining - 1)
        if self.remaining <= 0:
            return np.array([0.0], dtype=np.float32), -1.0, True, False, {}

        return (
            np.array([float(self.remaining)], dtype=np.float32),
            0.0, False, False, {},
        )

    def render(self):
        pass


# Nim adapter

class NimTestAdapter(GameNiteAdapter):
    def __init__(self):
        super().__init__("nim", "test_user")

    def get_state_representation(self, board) -> np.ndarray:
        return np.array([float(board)], dtype=np.float32)

    def get_action(self, state: np.ndarray) -> int:
        return int(np.argmax(state))

    def build_env(self) -> VecEnv:
        return make_vec_env(NimEnv, n_envs=4)


# Train

if __name__ == "__main__":
    print("Training nim model for 5000 steps (takes ~30s)...")
    adapter = NimTestAdapter()
    adapter.train(total_episodes=5000)

    out = "test_model.pth"
    adapter.save(out)
    print(f"\nDone. Artifact saved to ai/{out}")
