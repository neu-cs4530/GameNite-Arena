"""
GameNite Arena — Example Adapter: Nim
======================================
Single pile. Players take turns removing 1, 2, or 3 objects.
Player who takes the last object LOSES.

Observation : (5,) float32 — [pile / starting_pile, onehot4(pile % 4)]
Action      : Discrete(3)  — 0=take1, 1=take2, 2=take3

Why the mod-4 one-hot (the "v2" contract): with only the normalized scalar,
on-policy PPO cannot carve out the mod-4 structure and collapses to a
best-constant policy (~0.30 win rate). With the one-hot it reaches the
theoretical optimum against a misère-optimal opponent that blunders 25%
of its moves. The trusted inference encoders (ai/inference-service/
encoders.py) mirror this layout exactly; legacy (1,) artifacts stay
servable there via the artifact's recorded obs_size.

Optimal misère strategy: always leave your opponent on pile ≡ 1 (mod 4)
(1, 5, 9, ...). The scripted opponent plays that line but blunders a
fraction of its moves, so games are winnable and the win rate measures
real skill instead of pinning at 0 or 1.

Heuristic knobs (mirroring shared/src/trainingHeuristics.ts — the web
form's choices map onto these constructor params):
  opponent_style        : "misere" (optimal line + blunders) or
                          "uniform-random" (takes 1-3 at random)
  opponent_mistake_rate : blunder probability for the misère opponent
                          (0.25 / 0.15 on the form)
  random_start          : start each game at a random pile in
                          [start_low, starting_pile] for denser signal
  reward_shaping        : potential-based mod-4 shaping (OFF by default)

Edge cases handled by the inference service:
  If pile == 1: only action 0 (take1) is valid → model must take it
  If pile == 2: actions 0 or 1 valid (take1 or take2)
  If pile >= 3: all three actions valid
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3.common.env_util import make_vec_env

from base_adapter import GameNiteAdapter

STARTING_PILE = 21   # matches GameNite default

OPPONENT_STYLES = ("misere", "uniform-random")


def encode_pile(pile: int, starting_pile: int = STARTING_PILE) -> np.ndarray:
    """The v2 nim observation: [pile / starting_pile, onehot4(pile % 4)]."""
    obs = np.zeros(5, dtype=np.float32)
    obs[0] = pile / starting_pile
    obs[1 + pile % 4] = 1.0
    return obs


class NimEnv(gym.Env):
    def __init__(
        self,
        starting_pile: int = STARTING_PILE,
        opponent_mistake_rate: float = 0.25,
        opponent_style: str = "misere",
        random_start: bool = False,
        start_low: int = 8,
        reward_shaping: bool = False,
        shaping_gamma: float = 0.99,
    ) -> None:
        super().__init__()
        if opponent_style not in OPPONENT_STYLES:
            raise ValueError(
                f"opponent_style must be one of {OPPONENT_STYLES}, "
                f"got {opponent_style!r}"
            )
        self.starting_pile = starting_pile
        self.opponent_mistake_rate = opponent_mistake_rate
        self.opponent_style = opponent_style
        self.random_start = random_start
        self.start_low = start_low
        self.reward_shaping = reward_shaping
        self.shaping_gamma = shaping_gamma
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(5,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(3)  # take 1, 2, or 3
        self.pile = starting_pile

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if self.random_start:
            self.pile = int(
                self.np_random.integers(self.start_low, self.starting_pile + 1)
            )
        else:
            self.pile = self.starting_pile
        return self._obs(), {}

    def step(self, action: int):
        pile_before = self.pile
        take = action + 1  # action 0→take1, 1→take2, 2→take3

        # Clamp to valid range if pile is small
        take = min(take, self.pile)
        self.pile -= take

        if self.pile == 0:
            # We took the last object → we lose
            reward, done = -1.0, True
        else:
            self._opponent_move()
            if self.pile == 0:
                # Opponent took the last object → we win
                reward, done = 1.0, True
            else:
                reward, done = 0.0, False

        if self.reward_shaping:
            # Potential-based shaping (Ng et al.): r' = r + γφ(s') - φ(s).
            # Provably policy-invariant because φ(terminal) == 0.
            reward += self.shaping_gamma * self._phi(self.pile) - self._phi(
                pile_before
            )

        return self._obs(), reward, done, False, {}

    def _opponent_move(self) -> None:
        """Remove the opponent's take from the pile (pile stays >= 0)."""
        if (
            self.opponent_style == "uniform-random"
            or self.np_random.random() < self.opponent_mistake_rate
        ):
            # Uniform mover, or the misère opponent blundering.
            opp_take = int(self.np_random.integers(1, 4))
        else:
            # Misère-optimal: leave us on pile ≡ 1 (mod 4).
            opp_take = (self.pile - 1) % 4 or 1
        self.pile -= min(opp_take, min(3, self.pile))

    def _phi(self, pile: int) -> float:
        """
        Position potential: +0.5 off the losing residues, -0.5 when WE are
        stuck on pile ≡ 1 (mod 4). Terminal (pile 0) is 0 so the shaping
        never changes the optimal policy.
        """
        if pile == 0:
            return 0.0
        return 0.5 if pile % 4 != 1 else -0.5

    def _obs(self) -> np.ndarray:
        return encode_pile(self.pile, self.starting_pile)


class NimAdapter(GameNiteAdapter):

    def __init__(self, user_id: str, env_kwargs: dict | None = None) -> None:
        super().__init__(game="nim", user_id=user_id)
        self.env_kwargs = dict(env_kwargs or {})

    def get_state_representation(self, board) -> np.ndarray:
        # board arrives as {"pile": int, "starting_pile": int}
        return encode_pile(board["pile"], board["starting_pile"])

    def get_action(self, state: np.ndarray) -> int:
        if self._model is None:
            raise RuntimeError("Model not loaded.")
        action, _ = self._model.predict(state, deterministic=True)
        return int(action)

    def build_env(self):
        return make_vec_env(NimEnv, n_envs=4, env_kwargs=self.env_kwargs)


if __name__ == "__main__":
    adapter = NimAdapter(user_id="demo_user")
    print("Training Nim for 50 000 steps…")
    adapter.train(total_episodes=50_000)
    adapter.save("nim_demo.pth")
    print("Done — nim_demo.pth ready to upload.")
    print("Tip: a well-trained model should converge to the mod-4 strategy.")
