"""
GameNite Arena — Example Adapter: Number Guesser
=================================================
Single-turn competitive game. 2-3 players each guess a number 1-100.
Correct number revealed after all guesses. Closest guess wins.
Ties broken by lower guess (configurable by GameNite rules).

Observation : (2,) float32
  [0] num_opponents / 3     (normalised opponent count)
  [1] 0.0                   (reserved for future multi-round history)

Action      : Discrete(100) — action index i → guess value (i + 1)
  e.g. action 49 → guess 50

Strategy notes:
  2 opponents (3-player): optimal cluster around 33 and 67
  1 opponent  (2-player): any value works; model learns a prior
  The model will converge to a mixed strategy over the guess range.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from ai.base_adapter import GameNiteAdapter


class NumberGuesserEnv(gym.Env):
    """
    Single-turn competitive environment with a random opponent.
    Reward: +1 win, 0 draw, -1 loss.
    """

    def __init__(self, num_opponents: int = 1) -> None:
        super().__init__()
        self.num_opponents = num_opponents
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(2,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(100)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        return self._obs(), {}

    def step(self, action: int):
        our_guess   = action + 1                          # 1-100
        secret      = self.np_random.integers(1, 101)     # 1-100 inclusive
        opp_guesses = [
            self.np_random.integers(1, 101)
            for _ in range(self.num_opponents)
        ]

        our_dist  = abs(our_guess - secret)
        best_opp  = min(abs(g - secret) for g in opp_guesses)

        if our_dist < best_opp:
            reward = 1.0   # win
        elif our_dist == best_opp:
            # Tie-break: lower guess wins
            if our_guess <= min(opp_guesses):
                reward = 1.0
            else:
                reward = -1.0
        else:
            reward = -1.0  # loss

        # Single-turn: episode always ends after one step
        return self._obs(), reward, True, False, {}

    def _obs(self) -> np.ndarray:
        return np.array(
            [self.num_opponents / 3, 0.0], dtype=np.float32
        )


class NumberGuesserAdapter(GameNiteAdapter):

    def __init__(self, user_id: str, num_opponents: int = 1) -> None:
        super().__init__(game="numguesser", user_id=user_id)
        self.num_opponents = num_opponents

    def get_state_representation(self, board) -> np.ndarray:
        # board arrives as {"num_opponents": int}
        return np.array(
            [board["num_opponents"] / 3, 0.0], dtype=np.float32
        )

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)   # guess = action + 1

    def build_env(self):
        return make_vec_env(
            lambda: NumberGuesserEnv(self.num_opponents), n_envs=4
        )


if __name__ == "__main__":
    adapter = NumberGuesserAdapter(user_id="demo_user", num_opponents=1)
    print("Training Number Guesser for 30 000 steps…")
    adapter.train(total_episodes=30_000)
    adapter.save("numguesser_demo.pth")
    print("Done — numguesser_demo.pth ready to upload.")
