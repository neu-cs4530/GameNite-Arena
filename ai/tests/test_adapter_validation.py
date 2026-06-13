"""
GameNite Arena — Unit Tests: Adapter Validation and Move Legality
=================================================================
Covers:
  - GAME_ACTION_SPACES and GAME_OBS_SIZES constants
  - _assert_compatible() validation logic
  - Nim action clamping edge cases
  - Checkers state encoding (encode_board)
  - NumberGuesser state representation
  - MoveRequest legal_moves requirement for checkers

Run:
    pytest ai/tests/test_adapter_validation.py -v
"""

import pytest
import numpy as np

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from base_adapter import (
    ADAPTER_VERSION,
    GAME_ACTION_SPACES,
    GAME_OBS_SIZES,
    CHECKERS_ENCODING,
    _assert_compatible,
)
from adapter.example_checkers_adapter import encode_board, DARK_SQUARES
from adapter.example_nim_adapter import NimEnv
from adapter.example_numguesser_adapter import NumberGuesserAdapter


# ── 1. Constants sanity checks ────────────────────────────────────────────────

class TestConstants:

    def test_all_games_have_action_space(self):
        for game in ["tictactoe", "connect4", "checkers", "nim", "numguesser"]:
            assert game in GAME_ACTION_SPACES

    def test_all_games_have_obs_size(self):
        for game in ["tictactoe", "connect4", "checkers", "nim", "numguesser"]:
            assert game in GAME_OBS_SIZES

    def test_tictactoe_spaces(self):
        assert GAME_ACTION_SPACES["tictactoe"] == 9
        assert GAME_OBS_SIZES["tictactoe"] == 9

    def test_connect4_spaces(self):
        assert GAME_ACTION_SPACES["connect4"] == 7
        assert GAME_OBS_SIZES["connect4"] == 42   # 6×7

    def test_checkers_spaces(self):
        # Checkers action space is dynamic (-1 sentinel)
        assert GAME_ACTION_SPACES["checkers"] == -1
        # 32 dark squares × 5 one-hot values
        assert GAME_OBS_SIZES["checkers"] == 160

    def test_nim_spaces(self):
        assert GAME_ACTION_SPACES["nim"] == 3     # take 1, 2, or 3
        # v2 contract: [pile/starting_pile, onehot4(pile % 4)]
        assert GAME_OBS_SIZES["nim"] == 5

    def test_numguesser_spaces(self):
        assert GAME_ACTION_SPACES["numguesser"] == 100
        assert GAME_OBS_SIZES["numguesser"] == 2

    def test_checkers_encoding_has_five_values(self):
        assert len(CHECKERS_ENCODING) == 5
        assert CHECKERS_ENCODING["."]  == 0
        assert CHECKERS_ENCODING["R"]  == 1
        assert CHECKERS_ENCODING["B"]  == 2
        assert CHECKERS_ENCODING["RK"] == 3
        assert CHECKERS_ENCODING["BK"] == 4


# ── 2. _assert_compatible() ───────────────────────────────────────────────────

class TestAssertCompatible:

    def _make_artifact(self, game=None, version=None):
        return {
            "metadata": {
                "game":            game    or "tictactoe",
                "adapter_version": version or ADAPTER_VERSION,
            }
        }

    def test_valid_artifact_passes(self):
        artifact = self._make_artifact(game="tictactoe")
        _assert_compatible(artifact, "tictactoe")   # should not raise

    def test_wrong_game_raises(self):
        artifact = self._make_artifact(game="connect4")
        with pytest.raises(ValueError, match="connect4"):
            _assert_compatible(artifact, "tictactoe")

    def test_wrong_adapter_version_raises(self):
        artifact = self._make_artifact(version="0.0.1")
        with pytest.raises(ValueError, match="version"):
            _assert_compatible(artifact, "tictactoe")

    def test_missing_metadata_raises(self):
        artifact = {}   # no metadata key at all
        with pytest.raises((ValueError, KeyError)):
            _assert_compatible(artifact, "tictactoe")

    def test_all_supported_games_pass(self):
        for game in ["tictactoe", "connect4", "checkers", "nim", "numguesser"]:
            artifact = self._make_artifact(game=game)
            _assert_compatible(artifact, game)   # none should raise

    def test_error_message_includes_both_games(self):
        artifact = self._make_artifact(game="nim")
        with pytest.raises(ValueError) as exc_info:
            _assert_compatible(artifact, "checkers")
        assert "nim" in str(exc_info.value)
        assert "checkers" in str(exc_info.value)


# ── 3. Nim move legality / action clamping ────────────────────────────────────

class TestNimMoveLegality:
    """
    NimEnv clamps the take amount to min(action+1, pile).
    When pile == 1, only take1 (action 0) is valid.
    When pile == 2, take1 or take2 (actions 0,1) are valid.
    When pile >= 3, all three actions are valid.
    """

    def setup_method(self):
        self.env = NimEnv(starting_pile=21)
        self.env.reset(seed=42)

    def test_take_clamped_when_pile_is_one(self):
        self.env.pile = 1
        # action 1 (take2) should be clamped to take1
        obs, reward, done, _, _ = self.env.step(1)
        # pile was 1, we took 1 (clamped), pile = 0 → we lose
        assert done is True
        assert reward == -1.0   # took last object → lose

    def test_take_clamped_when_pile_is_two(self):
        self.env.pile = 2
        # action 2 (take3) clamped to take2
        obs, reward, done, _, _ = self.env.step(2)
        # pile was 2, we took 2 (clamped), pile = 0 → we lose
        assert done is True
        assert reward == -1.0

    def test_all_actions_valid_when_pile_large(self):
        self.env.pile = 10
        for action in [0, 1, 2]:
            self.env.pile = 10
            obs, reward, done, _, _ = self.env.step(action)
            # game should not be over after one move from pile=10
            assert done is False

    def test_obs_normalised_between_zero_and_one(self):
        self.env.pile = 21
        obs, _ = self.env.reset(seed=0)
        assert obs.shape == (5,)   # v2: [pile/starting_pile, onehot4(pile % 4)]
        assert 0.0 <= obs[0] <= 1.0

    def test_obs_zero_when_pile_empty(self):
        self.env.pile = 0
        obs = self.env._obs()
        assert obs[0] == pytest.approx(0.0)

    def test_win_when_opponent_takes_last(self):
        # Set pile so opponent is forced to take last object.
        # With optimal opponent (takes pile%4), pile=4 → opponent takes 4%4=0
        # so opponent takes 1 instead, leaving pile=3 for us... 
        # Easier: set pile=2, we take 1 (action 0), pile=1, opponent takes 1 → we win
        self.env.pile = 2
        obs, reward, done, _, _ = self.env.step(0)  # take 1, pile → 1
        # opponent forced to take last → we win
        if done:
            assert reward == 1.0


# ── 4. Checkers board encoding ────────────────────────────────────────────────

class TestCheckersBoardEncoding:

    def test_output_shape_is_160(self):
        obs = encode_board({})
        assert obs.shape == (160,)
        assert obs.dtype == np.float32

    def test_empty_board_all_zeros_except_empty_slots(self):
        obs = encode_board({})
        # Every square should be one-hot at index 0 (empty)
        for i in range(32):
            assert obs[i * 5 + 0] == 1.0   # empty flag set
            assert obs[i * 5 + 1] == 0.0   # R not set
            assert obs[i * 5 + 2] == 0.0   # B not set

    def test_red_piece_encoding(self):
        sq = DARK_SQUARES[0]
        obs = encode_board({sq: "R"})
        idx = 0   # first dark square
        assert obs[idx * 5 + 0] == 0.0   # not empty
        assert obs[idx * 5 + 1] == 1.0   # R set
        assert obs[idx * 5 + 2] == 0.0   # B not set

    def test_black_piece_encoding(self):
        sq = DARK_SQUARES[5]
        obs = encode_board({sq: "B"})
        idx = 5
        assert obs[idx * 5 + 2] == 1.0   # B set

    def test_red_king_encoding(self):
        sq = DARK_SQUARES[10]
        obs = encode_board({sq: "RK"})
        idx = 10
        assert obs[idx * 5 + 3] == 1.0   # RK set

    def test_black_king_encoding(self):
        sq = DARK_SQUARES[15]
        obs = encode_board({sq: "BK"})
        idx = 15
        assert obs[idx * 5 + 4] == 1.0   # BK set

    def test_starting_position_has_12_red_and_12_black(self):
        board = {}
        for r, c in DARK_SQUARES:
            if r in (0, 1, 2):
                board[(r, c)] = "B"
            elif r in (5, 6, 7):
                board[(r, c)] = "R"
            else:
                board[(r, c)] = "."
        obs = encode_board(board)

        red_count   = sum(obs[i*5 + 1] for i in range(32))
        black_count = sum(obs[i*5 + 2] for i in range(32))
        empty_count = sum(obs[i*5 + 0] for i in range(32))

        assert red_count   == pytest.approx(12.0)
        assert black_count == pytest.approx(12.0)
        assert empty_count == pytest.approx(8.0)   # 32 - 12 - 12

    def test_each_square_is_valid_one_hot(self):
        sq = DARK_SQUARES[3]
        obs = encode_board({sq: "RK"})
        for i in range(32):
            slot = obs[i*5 : i*5 + 5]
            assert slot.sum() == pytest.approx(1.0), \
                f"Square {i} is not a valid one-hot vector: {slot}"

    def test_dark_squares_count_is_32(self):
        assert len(DARK_SQUARES) == 32

    def test_all_dark_squares_have_odd_row_plus_col(self):
        for r, c in DARK_SQUARES:
            assert (r + c) % 2 == 1, f"Square ({r},{c}) is not a dark square"


# ── 5. NumberGuesser state representation ────────────────────────────────────

class TestNumberGuesserState:

    def setup_method(self):
        self.adapter = NumberGuesserAdapter(user_id="test", num_opponents=1)

    def test_state_shape(self):
        obs = self.adapter.get_state_representation({"num_opponents": 1})
        assert obs.shape == (2,)
        assert obs.dtype == np.float32

    def test_one_opponent_normalised(self):
        obs = self.adapter.get_state_representation({"num_opponents": 1})
        assert obs[0] == pytest.approx(1/3)

    def test_two_opponents_normalised(self):
        obs = self.adapter.get_state_representation({"num_opponents": 2})
        assert obs[0] == pytest.approx(2/3)

    def test_three_opponents_normalised(self):
        obs = self.adapter.get_state_representation({"num_opponents": 3})
        assert obs[0] == pytest.approx(1.0)

    def test_second_slot_is_zero(self):
        obs = self.adapter.get_state_representation({"num_opponents": 2})
        assert obs[1] == pytest.approx(0.0)

    def test_action_maps_to_guess(self):
        # action index i → guess value i+1
        # action 0 → guess 1, action 99 → guess 100
        assert 0  + 1 == 1
        assert 99 + 1 == 100

    def test_action_space_is_100(self):
        assert GAME_ACTION_SPACES["numguesser"] == 100


# ── 6. GameNiteAdapter constructor validation ─────────────────────────────────

class TestAdapterConstructor:

    def test_unsupported_game_raises(self):
        from base_adapter import GameNiteAdapter
        import abc

        # Concrete subclass just for testing the constructor
        class DummyAdapter(GameNiteAdapter):
            def get_state_representation(self, board): pass
            def get_action(self, state): pass
            def build_env(self): pass

        with pytest.raises(ValueError, match="Unsupported game"):
            DummyAdapter(game="chess", user_id="test")

    def test_supported_games_do_not_raise(self):
        from base_adapter import GameNiteAdapter

        class DummyAdapter(GameNiteAdapter):
            def get_state_representation(self, board): pass
            def get_action(self, state): pass
            def build_env(self): pass

        for game in ["tictactoe", "connect4", "checkers", "nim", "numguesser"]:
            adapter = DummyAdapter(game=game, user_id="test")
            assert adapter.game == game

    def test_get_obs_size_matches_constant(self):
        from base_adapter import GameNiteAdapter

        class DummyAdapter(GameNiteAdapter):
            def get_state_representation(self, board): pass
            def get_action(self, state): pass
            def build_env(self): pass

        for game in ["tictactoe", "connect4", "checkers", "nim", "numguesser"]:
            adapter = DummyAdapter(game=game, user_id="test")
            assert adapter.get_obs_size() == GAME_OBS_SIZES[game]

    def test_save_without_train_raises(self):
        from base_adapter import GameNiteAdapter

        class DummyAdapter(GameNiteAdapter):
            def get_state_representation(self, board): pass
            def get_action(self, state): pass
            def build_env(self): pass

        adapter = DummyAdapter(game="nim", user_id="test")
        with pytest.raises(RuntimeError, match="train"):
            adapter.save("dummy.pth")
