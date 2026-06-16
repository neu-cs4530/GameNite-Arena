"""
GameNite Arena — Example Adapter: Checkers
===========================================
Board: 8×8, only the 32 dark squares (row+col odd) are playable.
Pieces: "." | "R" | "B" | "RK" | "BK"

Observation encoding (160 floats):
  32 squares × 5 one-hot values = 160
  One-hot order per square: [empty/".", R, B, RK, BK]
  Squares ordered row-major over dark squares only.

Action space: DYNAMIC.
  The model outputs an index into the legal_moves list provided
  by the inference service at move time. During training we approximate
  with a fixed upper bound (MAX_LEGAL_MOVES = 100).

Move format (sent to game server):
  { "squares": [[r0,c0], [r1,c1], ...] }
  Simple move = 2 squares, multi-capture chain = 3+.

Training setup:
  Our agent always plays as R (player 0, moves up, dr=-1).
  The opponent (B, player 1) plays randomly by default, or with a frozen
  policy for self-play (pass opponent_policy to CheckersAdapter.build_env).
  Max 200 half-moves per episode to prevent infinite cycles.
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter, CHECKERS_ENCODING

# Upper bound on legal moves per position (used during training only)
MAX_LEGAL_MOVES = 100
MAX_STEPS = 200   # episode cap to prevent infinite loops

# Precompute the 32 dark squares in row-major order
DARK_SQUARES = [
    (r, c)
    for r in range(8)
    for c in range(8)
    if (r + c) % 2 == 1
]
SQUARE_INDEX = {sq: i for i, sq in enumerate(DARK_SQUARES)}


# ── Game logic (mirrors server/src/games/checkers.ts exactly) ────────────────

def _empty_board():
    return [["." for _ in range(8)] for _ in range(8)]


def _starting_board():
    board = _empty_board()
    for r, c in DARK_SQUARES:
        if r <= 2:
            board[r][c] = "B"
        elif r >= 5:
            board[r][c] = "R"
    return board


def _in_bounds(r, c):
    return 0 <= r < 8 and 0 <= c < 8


def _is_king(piece):
    return piece in ("RK", "BK")


def _owner(piece):
    if piece in ("R", "RK"):
        return 0
    if piece in ("B", "BK"):
        return 1
    return None


def _directions(player, king):
    if king:
        return [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    dr = -1 if player == 0 else 1
    return [(dr, -1), (dr, 1)]


def _simple_moves(board, r, c):
    piece = board[r][c]
    owner = _owner(piece)
    if owner is None:
        return []
    moves = []
    for dr, dc in _directions(owner, _is_king(piece)):
        nr, nc = r + dr, c + dc
        if _in_bounds(nr, nc) and board[nr][nc] == ".":
            moves.append(((r, c), (nr, nc)))
    return moves


def _capture_chains(board, sr, sc):
    piece = board[sr][sc]
    owner = _owner(piece)
    if owner is None:
        return []
    king = _is_king(piece)
    chains = []
    path = [(sr, sc)]
    captured = set()

    def dfs(r, c):
        extended = False
        for dr, dc in _directions(owner, king):
            mr, mc = r + dr, c + dc
            lr, lc = r + 2 * dr, c + 2 * dc
            if not _in_bounds(lr, lc):
                continue
            if (mr, mc) in captured:
                continue
            if _owner(board[mr][mc]) != (1 - owner):
                continue
            is_start = (lr == sr and lc == sc)
            if board[lr][lc] != "." and not is_start:
                continue
            captured.add((mr, mc))
            path.append((lr, lc))
            if king:
                dfs(lr, lc)
            else:
                chains.append(list(path))
            path.pop()
            captured.discard((mr, mc))
            extended = True
        if king and not extended and len(path) > 1:
            chains.append(list(path))

    dfs(sr, sc)
    return chains


def _legal_moves(board, player):
    """Returns list of move-square-sequences (each a list of (r,c) tuples)."""
    captures = []
    simples = []
    for r, c in DARK_SQUARES:
        if _owner(board[r][c]) != player:
            continue
        captures.extend(_capture_chains(board, r, c))
        simples.extend(_simple_moves(board, r, c))
    return captures if captures else simples


def _apply_move(board, squares, player):
    new_board = [row[:] for row in board]
    sr, sc = squares[0]
    piece = new_board[sr][sc]
    new_board[sr][sc] = "."
    for i in range(1, len(squares)):
        pr, pc = squares[i - 1]
        r, c = squares[i]
        if abs(r - pr) == 2:
            new_board[(pr + r) // 2][(pc + c) // 2] = "."
    er, ec = squares[-1]
    if not _is_king(piece):
        if player == 0 and er == 0:
            piece = "RK"
        elif player == 1 and er == 7:
            piece = "BK"
    new_board[er][ec] = piece
    return new_board


# ── Observation encoding ──────────────────────────────────────────────────────

def encode_board(board_dict: dict) -> np.ndarray:
    """
    board_dict maps (row, col) → piece string for all 32 dark squares.
    Returns (160,) float32 one-hot vector.
    """
    obs = np.zeros(160, dtype=np.float32)
    for i, sq in enumerate(DARK_SQUARES):
        piece = board_dict.get(sq, ".")
        enc = CHECKERS_ENCODING.get(piece, 0)
        obs[i * 5 + enc] = 1.0
    return obs


def _board_to_obs(board) -> np.ndarray:
    """Convert a 2D board list to a 160-float observation vector."""
    board_dict = {(r, c): board[r][c] for r, c in DARK_SQUARES}
    return encode_board(board_dict)


# ── Gymnasium environment ─────────────────────────────────────────────────────

class CheckersEnv(gym.Env):
    """
    Self-play Checkers. Our agent always plays as R (player 0, moves upward).
    The opponent (B, player 1) plays randomly by default; pass opponent_policy
    for a frozen-policy self-play opponent.

    Observation : (160,) float32 — one-hot over 32 dark squares × 5 piece types
    Action      : Discrete(MAX_LEGAL_MOVES) — index into legal_moves (clamped)

    Rewards:
      +1   our R player wins (B has no legal moves)
      -1   B wins (R has no legal moves), or we submit an illegal action index
           when there are no legal moves (shouldn't occur but handled safely)
       0   draw-by-length (MAX_STEPS exceeded) or ongoing move
    """

    def __init__(self, opponent_policy=None) -> None:
        super().__init__()
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(160,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(MAX_LEGAL_MOVES)
        self.opponent_policy = opponent_policy
        self.board = _starting_board()
        self._steps = 0

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.board = _starting_board()
        self._steps = 0
        return _board_to_obs(self.board), {}

    def step(self, action: int):
        self._steps += 1

        # Our turn: R (player 0)
        legal = _legal_moves(self.board, 0)
        if not legal:
            return _board_to_obs(self.board), -1.0, True, False, {}

        chosen = legal[int(action) % len(legal)]
        self.board = _apply_move(self.board, chosen, 0)

        # Check if B now has no moves → R wins
        if not _legal_moves(self.board, 1):
            return _board_to_obs(self.board), 1.0, True, False, {}

        # Step cap → draw
        if self._steps >= MAX_STEPS:
            return _board_to_obs(self.board), 0.0, True, False, {}

        # Opponent's turn: B (player 1)
        self._opponent_move()

        # Check if R now has no moves → B wins
        if not _legal_moves(self.board, 0):
            return _board_to_obs(self.board), -1.0, True, False, {}

        # Step cap after opponent move
        if self._steps >= MAX_STEPS:
            return _board_to_obs(self.board), 0.0, True, False, {}

        return _board_to_obs(self.board), 0.0, False, False, {}

    def _opponent_move(self):
        legal = _legal_moves(self.board, 1)
        if not legal:
            return
        if self.opponent_policy is not None:
            # Frozen policy sees the board from B's POV. We flip R↔B in the
            # encoding so the opponent's policy network sees its own pieces as
            # "R" and ours as "B" (same training perspective it was trained with).
            flipped = self._flip_board()
            obs = _board_to_obs(flipped)
            action, _ = self.opponent_policy.predict(obs, deterministic=False)
            idx = int(action) % len(legal)
        else:
            idx = int(self.np_random.integers(len(legal)))
        self.board = _apply_move(self.board, legal[idx], 1)

    def _flip_board(self):
        """Return a board where R↔B and RK↔BK are swapped (perspective flip)."""
        flip = {".": ".", "R": "B", "B": "R", "RK": "BK", "BK": "RK"}
        return [[flip.get(cell, ".") for cell in row] for row in self.board]


# ── Adapter ───────────────────────────────────────────────────────────────────

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
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self, opponent_policy=None):
        return make_vec_env(
            lambda: CheckersEnv(opponent_policy=opponent_policy),
            n_envs=4,
        )


if __name__ == "__main__":
    adapter = CheckersAdapter(user_id="demo_user")
    print("Training Checkers for 500 000 steps (random opponent)…")
    adapter.train(total_episodes=500_000)
    adapter.save("checkers_demo.pth")
    print("Done — checkers_demo.pth ready to upload.")
