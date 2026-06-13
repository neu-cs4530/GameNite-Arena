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
`base_adapter.py` (and the example adapters) used during training. If you change
an encoding in the adapter, change it here too, and bump ADAPTER_VERSION in both
places. OBS_SIZES maps each game to its ALLOWED sizes — a game grows a new entry
when its observation contract evolves, and the artifact's recorded
metadata.obs_size picks the layout at serve time:
    tictactoe   = 9
    connect4    = 42   (6 x 7, flattened)
    checkers    = 160  (32 dark squares x 5 one-hot: empty/R/B/RK/BK)
    nim         = 5    v2 contract: [pile/21, onehot4(pile % 4)]
                  1    legacy artifacts: [pile/21] — normalized, NEVER raw
    numguesser  = 2

Action spaces:
    tictactoe   = 9    (cell index 0..8)
    connect4    = 7    (column 0..6)
    checkers    = dynamic — model outputs an index into the request's legal_moves
    nim         = 3    (take 1/2/3 -> action 0/1/2)
    numguesser  = 100  (guess 1..100 -> action 0..99)
"""

import numpy as np

# Allowed observation sizes per game (tuple). The LAST entry is the current
# training contract; earlier entries are legacy layouts still servable for
# already-uploaded artifacts.
OBS_SIZES = {
    "tictactoe": (9,),
    "connect4": (42,),
    "checkers": (160,),
    "nim": (1, 5),
    "numguesser": (2,),
}

# The arena's nim game always starts at 21 — the constant every nim model
# normalized by during training (NimEnv starting_pile).
NIM_STARTING_PILE = 21

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

def encode_nim(state: dict, obs_size: int = 5) -> np.ndarray:
    """
    state = {"remaining": int} (the Node side sends the raw pile count;
    normalization is THIS encoder's job — training always normalized).

    obs_size 5 (v2, default): [remaining/21, onehot4(remaining % 4)]
    obs_size 1 (legacy)     : [remaining/21]
    """
    remaining = state.get("remaining")
    if not isinstance(remaining, int):
        raise EncodingError("nim state must include integer 'remaining'")
    normalized = remaining / NIM_STARTING_PILE
    if obs_size == 1:
        return np.asarray([normalized], dtype=np.float32)
    if obs_size == 5:
        obs = np.zeros(5, dtype=np.float32)
        obs[0] = normalized
        obs[1 + remaining % 4] = 1.0
        return obs
    raise EncodingError(f"nim has no obs_size={obs_size} layout (allowed: 1, 5)")


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


def encode_state(game: str, state: dict, obs_size: int | None = None) -> np.ndarray:
    """
    Dispatch to the right encoder and verify the resulting size.

    obs_size is the LOADED artifact's metadata.obs_size; it selects the
    layout for games with more than one (nim). None means the game's
    current training contract (the last allowed size).
    """
    enc = _ENCODERS.get(game)
    if enc is None:
        raise EncodingError(f"Unknown game: {game}")
    allowed = OBS_SIZES[game]
    if obs_size is None:
        obs_size = allowed[-1]
    if obs_size not in allowed:
        raise EncodingError(
            f"{game} has no obs_size={obs_size} layout (allowed: {allowed})"
        )
    obs = enc(state, obs_size) if game == "nim" else enc(state)
    if obs.shape[0] != obs_size:
        raise EncodingError(
            f"{game} encoder produced {obs.shape[0]} features, expected {obs_size}"
        )
    return obs


def decode_action(
    game: str, raw_action: int, legal_moves: list | None, state: dict | None = None
) -> object:
    """
    Turn the model's integer output into a concrete move.

    For fixed-action games we map the index back to the game's move space.
    For checkers (dynamic), raw_action indexes into legal_moves supplied by the
    caller; we clamp to the legal range so an out-of-range head still returns a
    legal move (the rule engine remains the final authority — see CoS 2.8).
    For nim, when the request carries the position we clamp the take to what
    is actually on the pile — at remaining=1 the only legal move is take 1,
    whatever the policy head prefers.
    """
    if game == "checkers":
        if not legal_moves:
            raise EncodingError("checkers /move requires non-empty legal_moves")
        idx = int(raw_action) % len(legal_moves)
        return legal_moves[idx]
    if game == "tictactoe" or game == "connect4":
        return int(raw_action)          # cell / column index
    if game == "nim":
        take = int(raw_action) + 1
        remaining = state.get("remaining") if isinstance(state, dict) else None
        if isinstance(remaining, int) and remaining >= 1:
            take = min(take, min(3, remaining))
        return take
    if game == "numguesser":
        return int(raw_action) + 1       # action 0..99 -> guess 1..100
    raise EncodingError(f"Unknown game: {game}")
