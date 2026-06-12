"""
GameNite Arena — Example Adapter: Nim
======================================
Single pile. Players take turns removing 1, 2, or 3 objects.
Player who takes the last object LOSES.

Observation : (1,) float32 — objects_remaining / starting_pile (normalised)
Action      : Discrete(3)  — 0=take1, 1=take2, 2=take3

Optimal misère strategy: always leave your opponent on pile ≡ 1 (mod 4)
(1, 5, 9, ...). The scripted opponent plays that line but blunders a
fraction of its moves, so games are winnable and the win rate measures
real skill instead of pinning at 0 or 1.

Edge cases handled by the inference service:
  If pile == 1: only action 0 (take1) is valid → model must take it
  If pile == 2: actions 0 or 1 valid (take1 or take2)
  If pile >= 3: all three actions valid
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter

STARTING_PILE = 21   # matches GameNite default


class NimEnv(gym.Env):
    def __init__(
        self, starting_pile: int = STARTING_PILE, opponent_mistake_rate: float = 0.25
    ) -> None:
        super().__init__()
        self.starting_pile = starting_pile
        self.opponent_mistake_rate = opponent_mistake_rate
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(1,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(3)  # take 1, 2, or 3
        self.pile = starting_pile

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.pile = self.starting_pile
        return self._obs(), {}

    def step(self, action: int):
        take = action + 1  # action 0→take1, 1→take2, 2→take3

        # Clamp to valid range if pile is small
        take = min(take, self.pile)
        self.pile -= take

        # We took the last object → we lose
        if self.pile == 0:
            return self._obs(), -1.0, True, False, {}

        # Misère-optimal opponent (leave us on pile ≡ 1 mod 4), with an
        # occasional uniform blunder so positions are winnable.
        if self.np_random.random() < self.opponent_mistake_rate:
            opp_take = int(self.np_random.integers(1, 4))
        else:
            opp_take = (self.pile - 1) % 4 or 1
        opp_take = min(opp_take, min(3, self.pile))
        self.pile -= opp_take

        # Opponent took the last object → we win
        if self.pile == 0:
            return self._obs(), 1.0, True, False, {}

        return self._obs(), 0.0, False, False, {}

    def _obs(self) -> np.ndarray:
        return np.array(
            [self.pile / self.starting_pile], dtype=np.float32
        )


class NimAdapter(GameNiteAdapter):

    def __init__(self, user_id: str) -> None:
        super().__init__(game="nim", user_id=user_id)

    def get_state_representation(self, board) -> np.ndarray:
        # board arrives as {"pile": int, "starting_pile": int}
        return np.array(
            [board["pile"] / board["starting_pile"]], dtype=np.float32
        )

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self):
        return make_vec_env(NimEnv, n_envs=4)


if __name__ == "__main__":
    adapter = NimAdapter(user_id="demo_user")
    print("Training Nim for 50 000 steps…")
    adapter.train(total_episodes=50_000)
    adapter.save("nim_demo.pth")
    print("Done — nim_demo.pth ready to upload.")
    print("Tip: a well-trained model should converge to the mod-4 strategy.")
