"""
GameNite Arena — Unit Tests: CheckersEnv and Checkers Game Logic
================================================================
Covers:
  - Board encoding (obs shape, one-hot correctness, starting position)
  - Game logic helpers (_legal_moves, _apply_move, _starting_board)
  - CheckersEnv gym contract (reset, step, rewards, step cap)
  - Observation ↔ inference-service encoder parity
  - CheckersAdapter constructor

Run:
    pytest ai/tests/test_checkers_env.py -v
"""

import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "adapter"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "inference-service"))

from example_checkers_adapter import (
    CheckersEnv,
    CheckersAdapter,
    encode_board,
    DARK_SQUARES,
    SQUARE_INDEX,
    MAX_LEGAL_MOVES,
    MAX_STEPS,
    _empty_board,
    _starting_board,
    _legal_moves,
    _apply_move,
    _owner,
    _is_king,
    _board_to_obs,
)
import encoders


# ── Starting board ────────────────────────────────────────────────────────────

class TestStartingBoard:

    def test_r_pieces_in_rows_5_6_7(self):
        board = _starting_board()
        for r, c in DARK_SQUARES:
            if r >= 5:
                assert board[r][c] == "R", f"Expected R at ({r},{c})"

    def test_b_pieces_in_rows_0_1_2(self):
        board = _starting_board()
        for r, c in DARK_SQUARES:
            if r <= 2:
                assert board[r][c] == "B", f"Expected B at ({r},{c})"

    def test_empty_in_rows_3_4(self):
        board = _starting_board()
        for r, c in DARK_SQUARES:
            if r in (3, 4):
                assert board[r][c] == ".", f"Expected empty at ({r},{c})"

    def test_12_red_pieces(self):
        board = _starting_board()
        count = sum(1 for r, c in DARK_SQUARES if board[r][c] == "R")
        assert count == 12

    def test_12_black_pieces(self):
        board = _starting_board()
        count = sum(1 for r, c in DARK_SQUARES if board[r][c] == "B")
        assert count == 12


# ── Observation encoding ──────────────────────────────────────────────────────

class TestEncoding:

    def test_obs_shape_is_160(self):
        board = _starting_board()
        obs = _board_to_obs(board)
        assert obs.shape == (160,)
        assert obs.dtype == np.float32

    def test_each_square_is_valid_one_hot(self):
        board = _starting_board()
        obs = _board_to_obs(board)
        for i in range(32):
            slot = obs[i * 5: i * 5 + 5]
            assert slot.sum() == pytest.approx(1.0), f"Square {i} not one-hot"

    def test_r_piece_encoded_at_index_1(self):
        board = _empty_board()
        r, c = DARK_SQUARES[28]   # a square in rows 5-7
        board[r][c] = "R"
        obs = _board_to_obs(board)
        idx = SQUARE_INDEX[(r, c)]
        assert obs[idx * 5 + 1] == 1.0   # R → slot 1
        assert obs[idx * 5 + 0] == 0.0   # not empty

    def test_b_piece_encoded_at_index_2(self):
        board = _empty_board()
        r, c = DARK_SQUARES[3]
        board[r][c] = "B"
        obs = _board_to_obs(board)
        idx = SQUARE_INDEX[(r, c)]
        assert obs[idx * 5 + 2] == 1.0   # B → slot 2

    def test_rk_piece_encoded_at_index_3(self):
        board = _empty_board()
        r, c = DARK_SQUARES[10]
        board[r][c] = "RK"
        obs = _board_to_obs(board)
        idx = SQUARE_INDEX[(r, c)]
        assert obs[idx * 5 + 3] == 1.0

    def test_bk_piece_encoded_at_index_4(self):
        board = _empty_board()
        r, c = DARK_SQUARES[15]
        board[r][c] = "BK"
        obs = _board_to_obs(board)
        idx = SQUARE_INDEX[(r, c)]
        assert obs[idx * 5 + 4] == 1.0

    def test_training_obs_matches_inference_encoder(self):
        """Training encode_board must produce the same result as the trusted
        inference encoder when fed the server's wire format ("."/R/B/RK/BK)."""
        board = _starting_board()
        training_obs = _board_to_obs(board)

        # Build the squares list in the same row-major dark-square order the
        # server's encodeStateForInference sends to the inference service.
        squares = [board[r][c] for r, c in DARK_SQUARES]
        inference_obs = encoders.encode_state("checkers", {"squares": squares})

        np.testing.assert_array_equal(training_obs, inference_obs)

    def test_dot_and_empty_produce_same_inference_obs(self):
        """encoders.py must accept '.' (server wire format) and 'empty' equally."""
        obs_dot = encoders.encode_state("checkers", {"squares": ["."] * 32})
        obs_word = encoders.encode_state("checkers", {"squares": ["empty"] * 32})
        np.testing.assert_array_equal(obs_dot, obs_word)


# ── Legal moves ───────────────────────────────────────────────────────────────

class TestLegalMoves:

    def test_starting_position_r_has_7_moves(self):
        board = _starting_board()
        moves = _legal_moves(board, 0)   # R = player 0
        assert len(moves) == 7

    def test_starting_position_b_has_7_moves(self):
        board = _starting_board()
        moves = _legal_moves(board, 1)   # B = player 1
        assert len(moves) == 7

    def test_empty_board_has_no_moves(self):
        board = _empty_board()
        assert _legal_moves(board, 0) == []
        assert _legal_moves(board, 1) == []

    def test_captures_are_mandatory(self):
        """When a capture is available, only captures are returned.
        Dark squares have (r+c) % 2 == 1.
        R at (4,1), B at (3,2), empty landing (2,3) — all dark squares."""
        board = _empty_board()
        board[4][1] = "R"   # 4+1=5 odd ✓
        board[3][2] = "B"   # 3+2=5 odd ✓
        # (2,3) 2+3=5 odd ✓ — already empty
        moves = _legal_moves(board, 0)
        assert len(moves) > 0
        # A capture moves 2 rows; a simple move moves 1 row.
        # When any capture is available only captures are returned.
        assert all(abs(m[-1][0] - m[0][0]) == 2 for m in moves), \
            "Non-capture returned when capture available"
        # The capture lands at (2,3)
        assert any(m[-1] == (2, 3) for m in moves)

    def test_simple_move_when_no_captures(self):
        board = _empty_board()
        board[5][2] = "R"   # 5+2=7 odd ✓; can move to (4,1) and (4,3)
        moves = _legal_moves(board, 0)
        assert len(moves) == 2   # can move to (4,1) or (4,3)

    def test_move_each_has_at_least_two_squares(self):
        board = _starting_board()
        for move in _legal_moves(board, 0):
            assert len(move) >= 2


# ── Apply move ────────────────────────────────────────────────────────────────

class TestApplyMove:

    def test_simple_move_relocates_piece(self):
        board = _empty_board()
        board[5][1] = "R"
        new_board = _apply_move(board, [(5, 1), (4, 2)], 0)
        assert new_board[5][1] == "."
        assert new_board[4][2] == "R"

    def test_capture_removes_opponent(self):
        board = _empty_board()
        board[4][2] = "R"
        board[3][3] = "B"
        new_board = _apply_move(board, [(4, 2), (2, 4)], 0)
        assert new_board[4][2] == "."
        assert new_board[3][3] == "."   # captured
        assert new_board[2][4] == "R"

    def test_r_promotes_to_rk_at_row_0(self):
        board = _empty_board()
        board[1][1] = "R"
        new_board = _apply_move(board, [(1, 1), (0, 2)], 0)
        assert new_board[0][2] == "RK"

    def test_b_promotes_to_bk_at_row_7(self):
        board = _empty_board()
        board[6][2] = "B"
        new_board = _apply_move(board, [(6, 2), (7, 3)], 1)
        assert new_board[7][3] == "BK"

    def test_rk_does_not_re_promote(self):
        board = _empty_board()
        board[1][1] = "RK"
        new_board = _apply_move(board, [(1, 1), (0, 2)], 0)
        assert new_board[0][2] == "RK"   # stays RK, not double-promoted


# ── CheckersEnv gym contract ──────────────────────────────────────────────────

class TestCheckersEnv:

    def setup_method(self):
        self.env = CheckersEnv()
        self.env.reset(seed=42)

    def test_reset_returns_160_obs(self):
        obs, info = self.env.reset()
        assert obs.shape == (160,)
        assert isinstance(info, dict)

    def test_step_returns_valid_types(self):
        obs, _ = self.env.reset()
        obs2, reward, terminated, truncated, info = self.env.step(0)
        assert obs2.shape == (160,)
        assert isinstance(reward, float)
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)

    def test_observation_space_matches(self):
        obs, _ = self.env.reset()
        assert self.env.observation_space.contains(obs)

    def test_step_does_not_terminate_immediately(self):
        self.env.reset(seed=0)
        _, reward, done, _, _ = self.env.step(0)
        # From starting position a single step should not end the game
        assert not done

    def test_reward_is_1_when_r_wins(self):
        """Force a board where B has no legal moves after R's first move.
        R at (2,1) captures B at (1,2), landing at (0,3) — all dark squares.
        After the capture B has no pieces → B cannot move → R wins (+1)."""
        board = _empty_board()
        board[2][1] = "R"   # 2+1=3 odd ✓
        board[1][2] = "B"   # 1+2=3 odd ✓
        # landing (0,3): 0+3=3 odd ✓, already empty
        self.env.board = board
        self.env._steps = 0
        obs, reward, done, _, _ = self.env.step(0)
        assert done
        assert reward == pytest.approx(1.0)

    def test_episode_cap_terminates(self):
        self.env.reset(seed=0)
        self.env._steps = MAX_STEPS - 1
        # Force a non-terminal board so the cap is what triggers termination
        _, reward, done, _, _ = self.env.step(0)
        assert done
        assert reward == pytest.approx(0.0)

    def test_game_runs_to_completion(self):
        """Run a full episode; it must terminate within MAX_STEPS * 2 steps."""
        obs, _ = self.env.reset(seed=7)
        for _ in range(MAX_STEPS * 2):
            action = self.env.action_space.sample()
            obs, reward, done, trunc, _ = self.env.step(action)
            assert obs.shape == (160,)
            if done or trunc:
                assert reward in (-1.0, 0.0, 1.0)
                break
        else:
            pytest.fail("Episode did not terminate within MAX_STEPS * 2")

    def test_multiple_resets_are_independent(self):
        obs1, _ = self.env.reset(seed=1)
        obs2, _ = self.env.reset(seed=2)
        # Both start at the same fixed starting position
        np.testing.assert_array_equal(obs1, obs2)

    def test_action_space_is_discrete_100(self):
        assert self.env.action_space.n == MAX_LEGAL_MOVES


# ── CheckersAdapter constructor ───────────────────────────────────────────────

class TestCheckersAdapter:

    def test_game_is_checkers(self):
        adapter = CheckersAdapter(user_id="test")
        assert adapter.game == "checkers"

    def test_obs_size_is_160(self):
        adapter = CheckersAdapter(user_id="test")
        assert adapter.get_obs_size() == 160

    def test_action_space_is_minus_one(self):
        adapter = CheckersAdapter(user_id="test")
        assert adapter.get_action_space() == -1   # dynamic

    def test_save_without_train_raises(self):
        adapter = CheckersAdapter(user_id="test")
        with pytest.raises(RuntimeError, match="train"):
            adapter.save("dummy.pth")
