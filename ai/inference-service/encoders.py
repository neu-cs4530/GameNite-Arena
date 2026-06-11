"""
GameNite Arena — Trusted State Encoders
=======================================
WHY THIS FILE EXISTS (security):
At inference time we must NOT run the user's uploaded adapter code. We only run
the trained policy network (a forward pass). To do that we still need to turn a
game state into the observation vector the model expects, and turn the model's
output into a move. Those encode/decode functions live HERE, server-side and
trusted, instead of being pulled from the user's file.

INVARIANT: these encoders must produce EXACTLY the same observation layout that
`base_adapter.py` used during training. If you change an encoding in the adapter,
change it here too, and bump ADAPTER_VERSION in both places. The obs sizes below
mirror the Sprint 0 contract:
    tictactoe   = 9
    connect4    = 42   (6 x 7, flattened)
    checkers    = 160  (32 dark squares x 5 one-hot: empty/R/B/RK/BK)
    nim         = 1
    numguesser  = 2

Action spaces:
    tictactoe   = 9    (cell index 0..8)
    connect4    = 7    (column 0..6)
    checkers    = dynamic — model outputs an index into the request's legal_moves
    nim         = 3    (take 1/2/3 -> action 0/1/2)
    numguesser  = 100  (guess 1..100 -> action 0..99)
"""

import numpy as np

OBS_SIZES = {
    "tictactoe": 9,
    "connect4": 42,
    "checkers": 160,
    "nim": 1,
    "numguesser": 2,
}

# Fixed-size action spaces. "checkers" is intentionally absent: it is dynamic.
ACTION_SPACES = {
    "tictactoe": 9,
    "connect4": 7,
    "nim": 3,
    "numguesser": 100,
}

# Checkers board encoding: 32 dark squares, one-hot over 5 piece states.
CHECKERS_PIECES = {"empty": 0, "R": 1, "B": 2, "RK": 3, "BK": 4}


class EncodingError(ValueError):
    """Raised when a state payload does not match the expected shape."""


# tic-tac-toe

def encode_tictactoe(state: dict) -> np.ndarray:
    """state = {"board": [9 ints]} where 0 empty, 1 me, -1 opponent."""
    board = state.get("board")
    if not isinstance(board, list) or len(board) != 9:
        raise EncodingError("tictactoe board must be a list of 9 ints")
    return np.asarray(board, dtype=np.float32)


# connect4

def encode_connect4(state: dict) -> np.ndarray:
    """state = {"board": [[7] x 6]} row-major, 0 empty / 1 me / -1 opponent."""
    board = state.get("board")
    if not isinstance(board, list) or len(board) != 6 or any(len(r) != 7 for r in board):
        raise EncodingError("connect4 board must be 6 rows x 7 cols")
    flat = [cell for row in board for cell in row]
    return np.asarray(flat, dtype=np.float32)


# nim

def encode_nim(state: dict) -> np.ndarray:
    """state = {"remaining": int}. Single scalar observation."""
    remaining = state.get("remaining")
    if not isinstance(remaining, int):
        raise EncodingError("nim state must include integer 'remaining'")
    return np.asarray([remaining], dtype=np.float32)


# number guesser

def encode_numguesser(state: dict) -> np.ndarray:
    """
    state = {"low": int, "high": int} — the current feasible range.
    2-dim observation lets the policy bisect.
    """
    low = state.get("low")
    high = state.get("high")
    if not isinstance(low, int) or not isinstance(high, int):
        raise EncodingError("numguesser state must include integer 'low' and 'high'")
    return np.asarray([low, high], dtype=np.float32)


# checkers

def encode_checkers(state: dict) -> np.ndarray:
    """
    state = {"squares": [32 strings]} each one of empty/R/B/RK/BK,
    ordered over the 32 dark squares. Encoded as 32 x 5 one-hot = 160.
    """
    squares = state.get("squares")
    if not isinstance(squares, list) or len(squares) != 32:
        raise EncodingError("checkers state must include 32 'squares'")
    obs = np.zeros((32, 5), dtype=np.float32)
    for i, sq in enumerate(squares):
        idx = CHECKERS_PIECES.get(sq)
        if idx is None:
            raise EncodingError(f"checkers square {i} has invalid value {sq!r}")
        obs[i, idx] = 1.0
    return obs.flatten()


_ENCODERS = {
    "tictactoe": encode_tictactoe,
    "connect4": encode_connect4,
    "nim": encode_nim,
    "numguesser": encode_numguesser,
    "checkers": encode_checkers,
}


def encode_state(game: str, state: dict) -> np.ndarray:
    """Dispatch to the right encoder and verify the resulting size."""
    enc = _ENCODERS.get(game)
    if enc is None:
        raise EncodingError(f"Unknown game: {game}")
    obs = enc(state)
    expected = OBS_SIZES[game]
    if obs.shape[0] != expected:
        raise EncodingError(
            f"{game} encoder produced {obs.shape[0]} features, expected {expected}"
        )
    return obs


def decode_action(game: str, raw_action: int, legal_moves: list | None) -> object:
    """
    Turn the model's integer output into a concrete move.

    For fixed-action games we map the index back to the game's move space.
    For checkers (dynamic), raw_action indexes into legal_moves supplied by the
    caller; we clamp to the legal range so an out-of-range head still returns a
    legal move (the rule engine remains the final authority — see CoS 2.8).
    """
    if game == "checkers":
        if not legal_moves:
            raise EncodingError("checkers /move requires non-empty legal_moves")
        idx = int(raw_action) % len(legal_moves)
        return legal_moves[idx]
    if game == "tictactoe" or game == "connect4":
        return int(raw_action)          # cell / column index
    if game == "nim":
        return int(raw_action) + 1       # action 0/1/2 -> take 1/2/3
    if game == "numguesser":
        return int(raw_action) + 1       # action 0..99 -> guess 1..100
    raise EncodingError(f"Unknown game: {game}")
