"""
GameNite Arena — Example Adapter: Connect 4
============================================
6×7 board. Row 0 = top, row 5 = bottom. Pieces fall downward.
Player 0 = Red ("R"), player 1 = Yellow ("Y").
Action = column index 0-6.

Observation encoding (42 floats, row-major):
  -1 = opponent piece
   0 = empty
   1 = our piece
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter

ROWS, COLS = 6, 7


class Connect4Env(gym.Env):
    def __init__(self) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(ROWS * COLS,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(COLS)
        self.board = np.zeros((ROWS, COLS), dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.board = np.zeros((ROWS, COLS), dtype=np.float32)
        return self.board.flatten(), {}

    def step(self, action: int):
        # Check column not full
        if self.board[0, action] != 0:
            return self.board.flatten(), -1.0, True, False, {}

        # Drop piece — find lowest empty row in column
        row = max(r for r in range(ROWS) if self.board[r, action] == 0)
        self.board[row, action] = 1.0

        if _check_win(self.board, 1.0):
            return self.board.flatten(), 1.0, True, False, {}
        if (self.board != 0).all():
            return self.board.flatten(), 0.0, True, False, {}

        # Random opponent
        valid_cols = [c for c in range(COLS) if self.board[0, c] == 0]
        opp_col = self.np_random.choice(valid_cols)
        opp_row = max(r for r in range(ROWS) if self.board[r, opp_col] == 0)
        self.board[opp_row, opp_col] = -1.0

        if _check_win(self.board, -1.0):
            return self.board.flatten(), -1.0, True, False, {}

        return self.board.flatten(), 0.0, False, False, {}


def _check_win(board: np.ndarray, player: float) -> bool:
    """Check all four directions for 4-in-a-row."""
    b = board
    for r in range(ROWS):
        for c in range(COLS):
            if b[r, c] != player:
                continue
            # horizontal
            if c + 3 < COLS and all(b[r, c+i] == player for i in range(4)):
                return True
            # vertical
            if r + 3 < ROWS and all(b[r+i, c] == player for i in range(4)):
                return True
            # diagonal ↘
            if r + 3 < ROWS and c + 3 < COLS and all(
                b[r+i, c+i] == player for i in range(4)
            ):
                return True
            # diagonal ↙
            if r + 3 < ROWS and c - 3 >= 0 and all(
                b[r+i, c-i] == player for i in range(4)
            ):
                return True
    return False


class Connect4Adapter(GameNiteAdapter):

    def __init__(self, user_id: str) -> None:
        super().__init__(game="connect4", user_id=user_id)

    def get_state_representation(self, board) -> np.ndarray:
        # board arrives as flat list of 42 values from the game server
        return np.array(board, dtype=np.float32)

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self):
        return make_vec_env(Connect4Env, n_envs=4)


if __name__ == "__main__":
    adapter = Connect4Adapter(user_id="demo_user")
    print("Training Connect 4 for 100 000 steps…")
    adapter.train(total_episodes=100_000)
    adapter.save("connect4_demo.pth")
    print("Done — connect4_demo.pth ready to upload.")
