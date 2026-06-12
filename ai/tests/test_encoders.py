"""
GameNite Arena — Unit Tests: trusted nim encoders vs the training contract
==========================================================================
The deployed-model bug this guards against: training normalizes the pile
(and, in v2, appends onehot4(pile % 4)) while the serving encoder used to
send the RAW integer — every deployed nim model saw out-of-distribution
inputs. The encoder now (a) normalizes by the arena constant 21 and
(b) dispatches on the LOADED artifact's obs_size:

    obs_size 1 (legacy artifacts) -> [pile / 21]
    obs_size 5 (v2 contract)      -> [pile / 21, onehot4(pile % 4)]

These tests pin both layouts and cross-check the v2 encoder against the
adapter's own observation so the two files cannot drift silently.

Run:
    pytest ai/tests/test_encoders.py -v
"""

import numpy as np
import pytest

import encoders
from adapter.example_nim_adapter import NimEnv


# OBS_SIZES structure: per-game ALLOWED sizes


class TestObsSizesStructure:

    def test_nim_allows_legacy_and_v2(self):
        assert tuple(encoders.OBS_SIZES["nim"]) == (1, 5)

    @pytest.mark.parametrize("game,size", [
        ("tictactoe", 9), ("connect4", 42), ("checkers", 160), ("numguesser", 2),
    ])
    def test_single_size_games(self, game, size):
        assert tuple(encoders.OBS_SIZES[game]) == (size,)


# nim encoding — v2 (default) layout


class TestEncodeNimV2:

    def test_full_pile(self):
        obs = encoders.encode_nim({"remaining": 21})
        np.testing.assert_allclose(obs, [1.0, 0.0, 1.0, 0.0, 0.0])
        assert obs.dtype == np.float32

    def test_mod4_zero(self):
        obs = encoders.encode_nim({"remaining": 8})
        np.testing.assert_allclose(obs, [8 / 21, 1.0, 0.0, 0.0, 0.0])

    @pytest.mark.parametrize("remaining", range(1, 22))
    def test_matches_training_env_exactly(self, remaining):
        """The serving encoder must equal the adapter's training observation."""
        env = NimEnv()
        env.pile = remaining
        np.testing.assert_allclose(
            encoders.encode_nim({"remaining": remaining}), env._obs()
        )

    def test_encode_state_defaults_to_v2(self):
        obs = encoders.encode_state("nim", {"remaining": 13})
        assert obs.shape == (5,)


# nim encoding — legacy (1,) layout, normalized


class TestEncodeNimLegacy:

    def test_legacy_is_normalized_not_raw(self):
        obs = encoders.encode_nim({"remaining": 7}, obs_size=1)
        assert obs.shape == (1,)
        assert obs[0] == pytest.approx(7 / 21)   # NOT the raw 7

    def test_legacy_full_pile(self):
        obs = encoders.encode_state("nim", {"remaining": 21}, obs_size=1)
        np.testing.assert_allclose(obs, [1.0])


# validation


class TestNimEncodingValidation:

    def test_non_int_remaining_rejected(self):
        with pytest.raises(encoders.EncodingError):
            encoders.encode_nim({"remaining": "seven"})

    def test_missing_remaining_rejected(self):
        with pytest.raises(encoders.EncodingError):
            encoders.encode_nim({})

    def test_unsupported_obs_size_rejected(self):
        with pytest.raises(encoders.EncodingError):
            encoders.encode_state("nim", {"remaining": 5}, obs_size=3)

    def test_unsupported_obs_size_for_fixed_game_rejected(self):
        with pytest.raises(encoders.EncodingError):
            encoders.encode_state("tictactoe", {"board": [0] * 9}, obs_size=5)

    def test_unknown_game_rejected(self):
        with pytest.raises(encoders.EncodingError):
            encoders.encode_state("chess", {})


# other games keep their single layout


class TestOtherGamesUnchanged:

    def test_tictactoe(self):
        obs = encoders.encode_state("tictactoe", {"board": [0, 1, -1] + [0] * 6})
        assert obs.shape == (9,)

    def test_connect4(self):
        obs = encoders.encode_state("connect4", {"board": [[0] * 7 for _ in range(6)]})
        assert obs.shape == (42,)

    def test_checkers(self):
        obs = encoders.encode_state("checkers", {"squares": ["empty"] * 32})
        assert obs.shape == (160,)

    def test_decode_nim_action_unchanged(self):
        assert encoders.decode_action("nim", 2, None) == 3

    def test_nim_decode_clamps_to_remaining(self):
        # The forced endgame: at pile 1 the only legal take is 1 — the model
        # head may prefer 3, but the service must return a legal move
        # (live bug: take-3 at pile 1 was rejected by the rule engine and
        # the model's game stalled forever).
        assert encoders.decode_action("nim", 2, None, state={"remaining": 1}) == 1
        assert encoders.decode_action("nim", 2, None, state={"remaining": 2}) == 2
        assert encoders.decode_action("nim", 1, None, state={"remaining": 1}) == 1
        # No state context -> behave as before.
        assert encoders.decode_action("nim", 2, None, state=None) == 3
        # Garbled state never breaks decoding.
        assert encoders.decode_action("nim", 2, None, state={"remaining": "x"}) == 3
