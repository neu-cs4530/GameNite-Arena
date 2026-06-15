"""
GameNite Arena — Example Adapter: Tic-Tac-Toe
Hello-world adapter shipped with the platform (CoS 2.12).

Training modes:
  - random_start=False (default): always start from empty board
  - random_start=True: start from a random valid mid-game position
    (2-4 pieces already placed) for denser signal near endgame

Self-play: when opponent_policy is provided the frozen policy plays as
opponent instead of random — use SelfPlayConnect4Env in train.py.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter


def _check_win(board: np.ndarray, player: float) -> bool:
    b = board.reshape(3, 3)
    lines = (
        [b[r] for r in range(3)]
        + [b[:, c] for c in range(3)]
        + [np.diag(b), np.diag(np.fliplr(b))]
    )
    return any((line == player).all() for line in lines)


def _random_start_board(rng: np.random.Generator) -> np.ndarray:
    """
    Place 2-4 pieces randomly on the board (equal number of X and O,
    no winner yet) so the model trains on mid-game positions.
    Returns a (9,) float32 board from X's perspective (X=1, O=-1).
    """
    for _ in range(200):  # retry until no winner
        board = np.zeros(9, dtype=np.float32)
        n_pairs = int(rng.integers(1, 3))  # 1 or 2 pairs = 2 or 4 pieces
        cells = rng.choice(9, size=n_pairs * 2, replace=False)
        for i, cell in enumerate(cells):
            board[cell] = 1.0 if i < n_pairs else -1.0
        if not _check_win(board, 1.0) and not _check_win(board, -1.0):
            return board
    return np.zeros(9, dtype=np.float32)  # fallback: empty board


class TicTacToeEnv(gym.Env):
    """
    Self-play Tic-Tac-Toe. Opponent plays randomly by default.
    Set opponent_policy to a trained SB3 model for self-play.

    Observation : (9,) float32  — {-1=opponent, 0=empty, 1=us}
    Action      : Discrete(9)   — cell index (row-major)
    """

    def __init__(self, random_start: bool = False,
                 opponent_policy=None) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(9,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(9)
        self.board = np.zeros(9, dtype=np.float32)
        self.random_start = random_start
        self.opponent_policy = opponent_policy  # None = random opponent

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if self.random_start:
            self.board = _random_start_board(self.np_random)
        else:
            self.board = np.zeros(9, dtype=np.float32)
        return self.board.copy(), {}

    def _opponent_move(self) -> None:
        empties = np.where(self.board == 0)[0]
        if len(empties) == 0:
            return
        if self.opponent_policy is not None:
            # Self-play: opponent sees the board from its own perspective
            opp_obs = -self.board.copy()
            action, _ = self.opponent_policy.predict(opp_obs, deterministic=False)
            action = int(action)
            if self.board[action] != 0:  # illegal — fall back to random
                action = int(self.np_random.choice(empties))
        else:
            action = int(self.np_random.choice(empties))
        self.board[action] = -1.0

    def step(self, action: int):
        if self.board[action] != 0:  # illegal move
            return self.board.copy(), -1.0, True, False, {}

        self.board[action] = 1.0
        if _check_win(self.board, 1.0):
            return self.board.copy(), 1.0, True, False, {}
        if not (self.board == 0).any():
            return self.board.copy(), 0.0, True, False, {}

        self._opponent_move()
        if _check_win(self.board, -1.0):
            return self.board.copy(), -1.0, True, False, {}
        if not (self.board == 0).any():
            return self.board.copy(), 0.0, True, False, {}

        return self.board.copy(), 0.0, False, False, {}


class TicTacToeAdapter(GameNiteAdapter):

    def __init__(self, user_id: str, random_start: bool = True) -> None:
        super().__init__(game="tictactoe", user_id=user_id)
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
            lambda: TicTacToeEnv(
                random_start=self.random_start,
                opponent_policy=opponent_policy,
            ),
            n_envs=4,
        )


if __name__ == "__main__":
    adapter = TicTacToeAdapter(user_id="demo_user", random_start=True)
    print("Training for 100 000 steps with random start positions…")
    adapter.train(total_episodes=100_000)
    adapter.save("tictactoe_demo.pth")
    print("Done — tictactoe_demo.pth ready to upload.")
