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

Training modes:
  - random_start=False: always start from empty board
  - random_start=True: start from a random valid mid-game position
    (2-8 pieces already placed) for denser endgame signal

Self-play: pass opponent_policy to Connect4Env for frozen-opponent
self-play instead of random opponent.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter

ROWS, COLS = 6, 7


def _check_win(board: np.ndarray, player: float) -> bool:
    b = board
    for r in range(ROWS):
        for c in range(COLS):
            if b[r, c] != player:
                continue
            if c + 3 < COLS and all(b[r, c+i] == player for i in range(4)):
                return True
            if r + 3 < ROWS and all(b[r+i, c] == player for i in range(4)):
                return True
            if r + 3 < ROWS and c + 3 < COLS and all(
                b[r+i, c+i] == player for i in range(4)
            ):
                return True
            if r + 3 < ROWS and c - 3 >= 0 and all(
                b[r+i, c-i] == player for i in range(4)
            ):
                return True
    return False


def _drop_piece(board: np.ndarray, col: int, player: float) -> bool:
    """Drop a piece into col. Returns False if column is full."""
    if board[0, col] != 0:
        return False
    row = max(r for r in range(ROWS) if board[r, col] == 0)
    board[row, col] = player
    return True


def _random_start_board(rng: np.random.Generator) -> np.ndarray:
    """
    Build a random valid mid-game position by simulating 2-8 alternating
    random drops (no winner yet). Returns (6,7) float32 from player 1's
    perspective (player1=1, player2=-1).
    """
    for _ in range(200):
        board = np.zeros((ROWS, COLS), dtype=np.float32)
        n_moves = int(rng.integers(2, 9))
        for i in range(n_moves):
            valid = [c for c in range(COLS) if board[0, c] == 0]
            if not valid:
                break
            col = int(rng.choice(valid))
            player = 1.0 if i % 2 == 0 else -1.0
            _drop_piece(board, col, player)
            if _check_win(board, player):
                board = np.zeros((ROWS, COLS), dtype=np.float32)
                break
        else:
            return board
    return np.zeros((ROWS, COLS), dtype=np.float32)


class Connect4Env(gym.Env):
    """
    Connect 4 environment with optional random start and self-play support.

    opponent_policy=None  → random opponent (default)
    opponent_policy=model → frozen self-play opponent
    """

    def __init__(self, random_start: bool = False,
                 opponent_policy=None) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(ROWS * COLS,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(COLS)
        self.board = np.zeros((ROWS, COLS), dtype=np.float32)
        self.random_start = random_start
        self.opponent_policy = opponent_policy

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if self.random_start:
            self.board = _random_start_board(self.np_random)
        else:
            self.board = np.zeros((ROWS, COLS), dtype=np.float32)
        return self.board.flatten(), {}

    def _opponent_move(self) -> None:
        valid = [c for c in range(COLS) if self.board[0, c] == 0]
        if not valid:
            return
        if self.opponent_policy is not None:
            # Opponent sees the board from its own perspective (flipped)
            opp_obs = (-self.board).flatten()
            action, _ = self.opponent_policy.predict(opp_obs, deterministic=False)
            col = int(action)
            if col not in valid:
                col = int(self.np_random.choice(valid))
        else:
            col = int(self.np_random.choice(valid))
        _drop_piece(self.board, col, -1.0)

    def step(self, action: int):
        if self.board[0, action] != 0:  # full column
            return self.board.flatten(), -1.0, True, False, {}

        _drop_piece(self.board, action, 1.0)
        if _check_win(self.board, 1.0):
            return self.board.flatten(), 1.0, True, False, {}
        if (self.board != 0).all():
            return self.board.flatten(), 0.0, True, False, {}

        self._opponent_move()
        if _check_win(self.board, -1.0):
            return self.board.flatten(), -1.0, True, False, {}
        if (self.board != 0).all():
            return self.board.flatten(), 0.0, True, False, {}

        return self.board.flatten(), 0.0, False, False, {}


class Connect4Adapter(GameNiteAdapter):

    def __init__(self, user_id: str, random_start: bool = True) -> None:
        super().__init__(game="connect4", user_id=user_id)
        self.random_start = random_start

    def get_state_representation(self, board) -> np.ndarray:
        return np.array(board, dtype=np.float32)

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self, opponent_policy=None):
        return make_vec_env(
            lambda: Connect4Env(
                random_start=self.random_start,
                opponent_policy=opponent_policy,
            ),
            n_envs=4,
        )


if __name__ == "__main__":
    adapter = Connect4Adapter(user_id="demo_user", random_start=True)
    print("Training Connect 4 for 200 000 steps with random starts…")
    adapter.train(total_episodes=200_000)
    adapter.save("connect4_demo.pth")
    print("Done — connect4_demo.pth ready to upload.")
