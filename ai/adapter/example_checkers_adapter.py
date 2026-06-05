"""
GameNite Arena — Example Adapter: Checkers
===========================================
Board: 8×8, only 32 dark squares (row+col odd) are playable.
Pieces: "." | "R" | "B" | "RK" | "BK"

Observation encoding (160 floats):
  32 squares × 5 one-hot values = 160
  One-hot order per square: [empty, R, B, RK, BK]
  Squares ordered row-major over dark squares only.

Action space: DYNAMIC.
  The model outputs an index into the legal_moves list provided
  by the inference service at move time. During training we approximate
  with a fixed upper bound (MAX_LEGAL_MOVES = 100).

Move format (sent to game server):
  { squares: [[r0,c0], [r1,c1], ...] }
  Simple move = 2 squares, multi-capture chain = 3+.
  The inference service resolves the action index → full squares sequence.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from ai.base_adapter import GameNiteAdapter, CHECKERS_ENCODING

# Upper bound on legal moves per position (used during training only)
MAX_LEGAL_MOVES = 100

# Precompute the 32 dark squares in row-major order
DARK_SQUARES = [
    (r, c)
    for r in range(8)
    for c in range(8)
    if (r + c) % 2 == 1
]
SQUARE_INDEX = {sq: i for i, sq in enumerate(DARK_SQUARES)}


def encode_board(board_dict: dict) -> np.ndarray:
    """
    board_dict maps (row, col) → piece string for all 32 dark squares.
    Returns (160,) float32 one-hot vector.
    """
    obs = np.zeros(160, dtype=np.float32)
    for i, sq in enumerate(DARK_SQUARES):
        piece = board_dict.get(sq, ".")
        enc   = CHECKERS_ENCODING.get(piece, 0)
        obs[i * 5 + enc] = 1.0
    return obs


class CheckersEnv(gym.Env):
    """
    Placeholder self-play environment.
    In a full implementation, wire this to the GameNite game logic
    (import from your shared checkers module or replicate the rules here).
    The observation and action spaces are what matter for the adapter contract.
    """

    def __init__(self) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(160,), dtype=np.float32
        )
        # Fixed upper bound for training; resolved dynamically at inference
        self.action_space = spaces.Discrete(MAX_LEGAL_MOVES)
        self._obs = np.zeros(160, dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self._obs = self._starting_position()
        return self._obs.copy(), {}

    def step(self, action: int):
        # TODO: integrate with the shared checkers game logic
        # For Sprint 0 this is a stub that always returns a draw after 1 step
        return self._obs.copy(), 0.0, True, False, {}

    def _starting_position(self) -> np.ndarray:
        """Encode the standard checkers starting position."""
        board = {}
        for r, c in DARK_SQUARES:
            if r in (0, 1, 2):
                board[(r, c)] = "B"
            elif r in (5, 6, 7):
                board[(r, c)] = "R"
            else:
                board[(r, c)] = "."
        return encode_board(board)


class CheckersAdapter(GameNiteAdapter):

    def __init__(self, user_id: str) -> None:
        super().__init__(game="checkers", user_id=user_id)

    def get_state_representation(self, board) -> np.ndarray:
        """
        board arrives from the inference service as a dict
        mapping "[r,c]" strings → piece strings.
        Convert to {(r,c): piece} then encode.
        """
        board_dict = {
            tuple(int(x) for x in k.strip("[]").split(",")): v
            for k, v in board.items()
        }
        return encode_board(board_dict)

    def get_action(self, state: np.ndarray) -> int:
        """
        Returns index into legal_moves list.
        The inference service maps this to the full squares sequence.
        """
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self):
        return make_vec_env(CheckersEnv, n_envs=4)


if __name__ == "__main__":
    adapter = CheckersAdapter(user_id="demo_user")
    print("Training Checkers for 200 000 steps…")
    adapter.train(total_episodes=200_000)
    adapter.save("checkers_demo.pth")
    print("Done — checkers_demo.pth ready to upload.")
