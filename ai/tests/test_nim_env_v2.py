"""
GameNite Arena — Unit Tests: Nim env v2 (observation + heuristic knobs)
=======================================================================
The v2 nim training contract (proven experimentally — scalar obs cannot be
carved by on-policy PPO; the mod-4 one-hot can):

  observation (5,) float32 = [pile / starting_pile, onehot4(pile % 4)]

plus the heuristic knobs the web form exposes (shared/src/trainingHeuristics.ts):

  opponentStyle  : misere-blunder-25 | misere-blunder-15 | uniform-random
  startingPile   : random-8-21 | fixed-21
  rewardShaping  : none | potential-mod4   (potential-based, OFF by default)

Run:
    pytest ai/tests/test_nim_env_v2.py -v
"""

import numpy as np
import pytest

from base_adapter import GAME_OBS_SIZES
from adapter.example_nim_adapter import NimAdapter, NimEnv


def expected_obs(pile: int, starting_pile: int = 21) -> np.ndarray:
    obs = np.zeros(5, dtype=np.float32)
    obs[0] = pile / starting_pile
    obs[1 + pile % 4] = 1.0
    return obs


# 1. v2 observation layout


class TestObservationV2:

    def setup_method(self):
        self.env = NimEnv(starting_pile=21)
        self.env.reset(seed=0)

    def test_obs_size_constant_is_5(self):
        assert GAME_OBS_SIZES["nim"] == 5

    def test_observation_space_shape(self):
        assert self.env.observation_space.shape == (5,)

    def test_obs_shape_and_dtype(self):
        obs = self.env._obs()
        assert obs.shape == (5,)
        assert obs.dtype == np.float32

    def test_full_pile_layout(self):
        # pile 21: normalized 1.0, 21 % 4 == 1 -> one-hot slot index 2
        self.env.pile = 21
        obs = self.env._obs()
        np.testing.assert_allclose(obs, [1.0, 0.0, 1.0, 0.0, 0.0])

    def test_mod4_zero_layout(self):
        self.env.pile = 8  # 8 % 4 == 0 -> slot index 1
        obs = self.env._obs()
        np.testing.assert_allclose(obs, [8 / 21, 1.0, 0.0, 0.0, 0.0])

    @pytest.mark.parametrize("pile", range(0, 22))
    def test_every_pile_matches_contract(self, pile):
        self.env.pile = pile
        np.testing.assert_allclose(self.env._obs(), expected_obs(pile))

    @pytest.mark.parametrize("pile", range(0, 22))
    def test_onehot_is_valid(self, pile):
        self.env.pile = pile
        obs = self.env._obs()
        assert obs[1:].sum() == pytest.approx(1.0)
        assert set(np.unique(obs[1:])).issubset({0.0, 1.0})

    def test_obs_within_observation_space(self):
        obs, _ = self.env.reset(seed=3)
        assert self.env.observation_space.contains(obs)

    def test_adapter_state_representation_matches_env(self):
        adapter = NimAdapter(user_id="t")
        for pile in range(0, 22):
            got = adapter.get_state_representation(
                {"pile": pile, "starting_pile": 21}
            )
            np.testing.assert_allclose(got, expected_obs(pile))
            assert got.dtype == np.float32


# 2. opponent styles


class TestOpponentStyles:

    def test_misere_optimal_when_mistake_rate_zero(self):
        # We take 1 from 9 -> 8; optimal misère reply takes (8-1) % 4 == 3 -> 5
        env = NimEnv(opponent_mistake_rate=0.0)
        env.reset(seed=0)
        env.pile = 9
        obs, _, done, _, _ = env.step(0)
        assert not done
        assert obs[0] == pytest.approx(5 / 21)

    def test_misere_forced_take_one_on_multiple_of_four_plus_one(self):
        # After our move pile == 4: (4-1) % 4 == 3 -> takes 3, leaving 1
        env = NimEnv(opponent_mistake_rate=0.0)
        env.reset(seed=0)
        env.pile = 5
        obs, _, done, _, _ = env.step(0)
        assert not done
        assert obs[0] == pytest.approx(1 / 21)

    def test_uniform_random_deviates_from_misere_line(self):
        # From pile 8 the misère reply is ALWAYS take 3. A uniform opponent
        # must eventually do something else.
        env = NimEnv(opponent_style="uniform-random", opponent_mistake_rate=0.0)
        env.reset(seed=42)
        takes = set()
        for _ in range(60):
            env.pile = 9
            obs, _, done, _, _ = env.step(0)  # we take 1 -> opponent sees 8
            if not done:
                takes.add(8 - round(obs[0] * 21))
        assert takes - {3}, "uniform-random opponent only ever played the misère line"
        assert takes.issubset({1, 2, 3})

    def test_unknown_style_raises(self):
        with pytest.raises(ValueError, match="opponent_style"):
            NimEnv(opponent_style="psychic")


# 3. start modes


class TestStartModes:

    def test_fixed_start_always_full_pile(self):
        env = NimEnv()
        for seed in range(5):
            obs, _ = env.reset(seed=seed)
            assert obs[0] == pytest.approx(1.0)
            assert env.pile == 21

    def test_random_start_within_8_to_21(self):
        env = NimEnv(random_start=True)
        piles = set()
        env.reset(seed=7)
        for _ in range(50):
            obs, _ = env.reset()
            assert 8 <= env.pile <= 21
            assert obs[0] == pytest.approx(env.pile / 21)
            piles.add(env.pile)
        assert len(piles) > 3, "random_start produced almost no variety"

    def test_random_start_respects_custom_low(self):
        env = NimEnv(random_start=True, start_low=20)
        env.reset(seed=1)
        for _ in range(20):
            env.reset()
            assert env.pile in (20, 21)


# 4. potential-based reward shaping


class TestRewardShaping:

    def test_shaping_off_by_default(self):
        env = NimEnv()
        assert env.reward_shaping is False

    def test_unshaped_rewards_are_pure_outcomes(self):
        env = NimEnv(opponent_mistake_rate=0.0)
        env.reset(seed=0)
        env.pile = 9
        _, reward, _, _, _ = env.step(0)
        assert reward == 0.0

    def test_phi_values(self):
        env = NimEnv(reward_shaping=True)
        assert env._phi(5) == pytest.approx(-0.5)   # 5 % 4 == 1 -> bad for us
        assert env._phi(4) == pytest.approx(+0.5)
        assert env._phi(1) == pytest.approx(-0.5)
        assert env._phi(0) == pytest.approx(0.0)    # terminal potential is 0

    def test_shaped_intermediate_step(self):
        # s: pile 7 (phi +0.5). Take 2 -> 5; optimal reply takes 1 -> s': pile 4
        # (phi +0.5). r' = 0 + 0.99*0.5 - 0.5 = -0.005
        env = NimEnv(opponent_mistake_rate=0.0, reward_shaping=True)
        env.reset(seed=0)
        env.pile = 7
        _, reward, done, _, _ = env.step(1)
        assert not done
        assert env.pile == 4
        assert reward == pytest.approx(0.99 * 0.5 - 0.5)

    def test_shaped_step_out_of_bad_position(self):
        # s: pile 5 (phi -0.5). Take 1 -> 4; reply takes 3 -> s': pile 1
        # (phi -0.5). r' = 0 + 0.99*(-0.5) - (-0.5) = +0.005
        env = NimEnv(opponent_mistake_rate=0.0, reward_shaping=True)
        env.reset(seed=0)
        env.pile = 5
        _, reward, done, _, _ = env.step(0)
        assert not done
        assert env.pile == 1
        assert reward == pytest.approx(0.99 * (-0.5) - (-0.5))

    def test_shaped_win_keeps_positive_sign(self):
        # s: pile 2 (phi +0.5). Take 1 -> 1; opponent forced to take last -> win.
        # r' = 1 + 0.99*phi(terminal=0) - 0.5 = 0.5
        env = NimEnv(opponent_mistake_rate=0.0, reward_shaping=True)
        env.reset(seed=0)
        env.pile = 2
        _, reward, done, _, _ = env.step(0)
        assert done
        assert reward == pytest.approx(1.0 - 0.5)

    def test_shaped_loss_keeps_negative_sign(self):
        # s: pile 1 (phi -0.5). Forced take last -> lose.
        # r' = -1 + 0.99*phi(terminal=0) - (-0.5) = -0.5
        env = NimEnv(reward_shaping=True)
        env.reset(seed=0)
        env.pile = 1
        _, reward, done, _, _ = env.step(0)
        assert done
        assert reward == pytest.approx(-1.0 + 0.5)

    def test_custom_gamma_used(self):
        env = NimEnv(opponent_mistake_rate=0.0, reward_shaping=True,
                     shaping_gamma=0.5)
        env.reset(seed=0)
        env.pile = 7
        _, reward, _, _, _ = env.step(1)   # phi +0.5 -> phi +0.5
        assert reward == pytest.approx(0.5 * 0.5 - 0.5)


# 5. adapter env kwargs plumbing


class TestAdapterEnvKwargs:

    def test_build_env_passes_kwargs_through(self):
        adapter = NimAdapter(
            user_id="t",
            env_kwargs={"opponent_mistake_rate": 0.15, "random_start": True},
        )
        venv = adapter.build_env()
        try:
            assert venv.get_attr("opponent_mistake_rate") == [0.15] * 4
            assert venv.get_attr("random_start") == [True] * 4
        finally:
            venv.close()

    def test_default_env_kwargs_empty(self):
        adapter = NimAdapter(user_id="t")
        venv = adapter.build_env()
        try:
            assert venv.get_attr("opponent_mistake_rate") == [0.25] * 4
            assert venv.get_attr("random_start") == [False] * 4
        finally:
            venv.close()
