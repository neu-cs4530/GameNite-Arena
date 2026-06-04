"""
GameNite Arena — Example Adapter: Tic-Tac-Toe
Hello-world adapter shipped with the platform (CoS 2.12).
Copy, rename the class, swap the game name, implement your env.

Run:
    python example_tictactoe_adapter.py
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from ai.base_adapter import GameNiteAdapter


# Gym environment

class TicTacToeEnv(gym.Env):
    """
    Self-play Tic-Tac-Toe. Opponent plays randomly.
    Observation : (9,) float32  — {-1=opponent, 0=empty, 1=us}
    Action      : Discrete(9)   — cell index (row-major)
    """

    def __init__(self) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(9,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(9)
        self.board = np.zeros(9, dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.board = np.zeros(9, dtype=np.float32)
        return self.board.copy(), {}

    def step(self, action: int):
        if self.board[action] != 0:                        # illegal move
            return self.board.copy(), -1.0, True, False, {}

        self.board[action] = 1.0
        if _check_win(self.board, 1.0):
            return self.board.copy(), 1.0, True, False, {}
        if not (self.board == 0).any():                    # draw
            return self.board.copy(), 0.0, True, False, {}

        empties = np.where(self.board == 0)[0]             # random opponent
        self.board[self.np_random.choice(empties)] = -1.0
        if _check_win(self.board, -1.0):
            return self.board.copy(), -1.0, True, False, {}

        return self.board.copy(), 0.0, False, False, {}


def _check_win(board: np.ndarray, player: float) -> bool:
    b = board.reshape(3, 3)
    lines = (
        [b[r] for r in range(3)]
        + [b[:, c] for c in range(3)]
        + [np.diag(b), np.diag(np.fliplr(b))]
    )
    return any((line == player).all() for line in lines)


# Adapter

class TicTacToeAdapter(GameNiteAdapter):

    def __init__(self, user_id: str) -> None:
        super().__init__(game="tictactoe", user_id=user_id)

    def get_state_representation(self, board) -> np.ndarray:
        # board arrives as flat list of 9 values: -1/0/1
        return np.array(board, dtype=np.float32)

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self):
        return make_vec_env(TicTacToeEnv, n_envs=4)


# Entry point

if __name__ == "__main__":
    adapter = TicTacToeAdapter(user_id="demo_user")
    print("Training for 20 000 steps…")
    adapter.train(total_episodes=20_000)
    adapter.save("tictactoe_demo.pth")
    print("Done — tictactoe_demo.pth ready to upload.")
