"""
GameNite Arena — Unit Tests: training/serving OBSERVATION PARITY
================================================================
THE BUG THIS GUARDS AGAINST (silent out-of-distribution serving):

A model is trained on the gym Env's observation but SERVED on the vector that
ai/inference-service/encoders.py produces from the Node server's state payload
(server/src/services/game.service.ts::encodeStateForInference). If those two
layouts disagree by even a sign or an axis order, the policy plays on garbage
inputs at match time and loses for no visible reason.

So for a handful of board states we assert, per game:

    Env observation (what PPO trains on)  ==  encoders.encode_<game>(payload)

where `payload` is EXACTLY what the Node encoder emits (player-relative
{0 empty, 1 = side-to-move, -1 = opponent}, row-major). We also pin
obs_size / action_space against the base_adapter constants and the serving
encoders' OBS_SIZES / ACTION_SPACES, which is what /inference/load checks.

Run:
    pytest ai/tests/test_obs_parity.py -v
"""

import numpy as np
import pytest

import encoders
from base_adapter import GAME_OBS_SIZES, GAME_ACTION_SPACES
from adapter.example_connect4_adapter import Connect4Env, ROWS, COLS
from adapter.example_tictactoe_adapter import TicTacToeEnv


# Helpers: turn an env's internal player-relative board into the dict payload
# that the trusted server-side encoder consumes. The mapping is the identity on
# the numbers (1=me, -1=opp, 0=empty) — which is the whole point: the Node side
# already encodes player-relative, so the encoder input == the env board.

def c4_payload_from_env(env: Connect4Env) -> dict:
    return {"board": env.board.astype(int).tolist()}


def ttt_payload_from_env(env: TicTacToeEnv) -> dict:
    return {"board": env.board.astype(int).tolist()}


# 1. obs_size / action_space pinned across the three sources of truth

class TestSizeContracts:

    @pytest.mark.parametrize("game,obs,act", [
        ("tictactoe", 9, 9),
        ("connect4", 42, 7),
    ])
    def test_base_adapter_constants(self, game, obs, act):
        assert GAME_OBS_SIZES[game] == obs
        assert GAME_ACTION_SPACES[game] == act

    @pytest.mark.parametrize("game,obs,act", [
        ("tictactoe", 9, 9),
        ("connect4", 42, 7),
    ])
    def test_serving_encoders_agree(self, game, obs, act):
        # /inference/load validates metadata.obs_size against OBS_SIZES[game].
        assert encoders.OBS_SIZES[game][-1] == obs
        assert encoders.ACTION_SPACES[game] == act

    def test_env_spaces_match_constants(self):
        c4 = Connect4Env()
        assert c4.observation_space.shape == (GAME_OBS_SIZES["connect4"],)
        assert c4.action_space.n == GAME_ACTION_SPACES["connect4"]
        ttt = TicTacToeEnv()
        assert ttt.observation_space.shape == (GAME_OBS_SIZES["tictactoe"],)
        assert ttt.action_space.n == GAME_ACTION_SPACES["tictactoe"]


# 2. CONNECT4 observation parity: env obs == encoders.encode_connect4(payload)

class TestConnect4Parity:

    def test_empty_board(self):
        env = Connect4Env()
        obs, _ = env.reset(seed=0)
        enc = encoders.encode_connect4(c4_payload_from_env(env))
        np.testing.assert_array_equal(obs, enc)
        assert enc.shape == (42,)
        assert enc.dtype == np.float32

    def test_mid_game_mixed_pieces(self):
        env = Connect4Env()
        env.reset(seed=0)
        # Hand-place a player-relative position (1=us, -1=opp), row-major 6x7.
        env.board[5, 3] = 1.0     # our piece, bottom row
        env.board[5, 2] = -1.0    # opponent
        env.board[4, 3] = 1.0
        env.board[5, 4] = -1.0
        obs = env.board.flatten()
        enc = encoders.encode_connect4(c4_payload_from_env(env))
        np.testing.assert_array_equal(obs, enc)

    def test_parity_holds_through_real_steps(self):
        # After actual env transitions (our move + random opponent), the
        # returned obs must still equal the trusted encoder on the same board.
        env = Connect4Env()
        env.reset(seed=7)
        rng = np.random.default_rng(7)
        for _ in range(6):
            valid = [c for c in range(COLS) if env.board[0, c] == 0]
            if not valid:
                break
            obs, _, done, _, _ = env.step(int(rng.choice(valid)))
            enc = encoders.encode_connect4(c4_payload_from_env(env))
            np.testing.assert_array_equal(obs, enc)
            if done:
                break

    def test_encode_state_dispatch_matches(self):
        env = Connect4Env()
        env.reset(seed=1)
        env.board[5, 0] = 1.0
        env.board[5, 6] = -1.0
        enc = encoders.encode_state("connect4", c4_payload_from_env(env))
        np.testing.assert_array_equal(env.board.flatten(), enc)


# 3. TICTACTOE observation parity: env obs == encoders.encode_tictactoe(payload)

class TestTicTacToeParity:

    def test_empty_board(self):
        env = TicTacToeEnv()
        obs, _ = env.reset(seed=0)
        enc = encoders.encode_tictactoe(ttt_payload_from_env(env))
        np.testing.assert_array_equal(obs, enc)
        assert enc.shape == (9,)
        assert enc.dtype == np.float32

    def test_mixed_position(self):
        env = TicTacToeEnv()
        env.reset(seed=0)
        # row-major: us at 0 and 4, opponent at 1 and 8
        env.board[0] = 1.0
        env.board[1] = -1.0
        env.board[4] = 1.0
        env.board[8] = -1.0
        enc = encoders.encode_tictactoe(ttt_payload_from_env(env))
        np.testing.assert_array_equal(env.board, enc)

    def test_parity_holds_through_real_steps(self):
        env = TicTacToeEnv()
        env.reset(seed=3)
        rng = np.random.default_rng(3)
        for _ in range(5):
            empties = np.where(env.board == 0)[0]
            if empties.size == 0:
                break
            obs, _, done, _, _ = env.step(int(rng.choice(empties)))
            enc = encoders.encode_tictactoe(ttt_payload_from_env(env))
            np.testing.assert_array_equal(obs, enc)
            if done:
                break

    def test_encode_state_dispatch_matches(self):
        env = TicTacToeEnv()
        env.reset(seed=2)
        env.board[2] = 1.0
        env.board[6] = -1.0
        enc = encoders.encode_state("tictactoe", ttt_payload_from_env(env))
        np.testing.assert_array_equal(env.board, enc)
