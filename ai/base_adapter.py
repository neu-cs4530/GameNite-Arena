"""
GameNite Arena — AI Adapter Base Class
Users subclass GameNiteAdapter for their chosen game, implement the three
abstract methods, and hand the class to the training runner. The base class
owns the SB3 training loop, checkpoint I/O, and .pth serialisation so users
never touch those details.

Supported games and their specs:
┌───────────────┬────────────┬──────────────┬──────────────────────────────┐
│ Game          │ State size │ Action space │ Notes                        │
├───────────────┼────────────┼──────────────┼──────────────────────────────┤
│ tictactoe     │ 9          │ 9 (fixed)    │ 3×3, cell index              │
│ connect4      │ 42         │ 7 (fixed)    │ 6×7, column index, gravity   │
│ checkers      │ 160        │ dynamic      │ 32 squares × 5 values,       │
│               │            │              │ action = index into          │
│               │            │              │ legal_moves list             │
│ nim           │ 1          │ 3 (fixed)    │ single pile, take 1/2/3      │
│ numguesser    │ 2          │ 100 (fixed)  │ guess 1-100, single turn     │
└───────────────┴────────────┴──────────────┴──────────────────────────────┘
"""

from __future__ import annotations

import abc
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import VecEnv

# Constants

ADAPTER_VERSION = "1.0.0"

# Fixed action spaces. Checkers is -1 because its action space is dynamic
# (the model picks an index into the legal_moves list at inference time).
GAME_ACTION_SPACES: dict[str, int] = {
    "tictactoe":   9,
    "connect4":    7,
    "checkers":   -1,   # dynamic — see MoveRequest.legal_moves
    "nim":         3,   # 0=take1, 1=take2, 2=take3
    "numguesser": 100,  # guess index maps to value: action+1 → guess
}

# Observation vector sizes (flat float32).
GAME_OBS_SIZES: dict[str, int] = {
    "tictactoe":   9,   # 9 cells, each in {-1, 0, 1}
    "connect4":   42,   # 6×7 cells, each in {-1, 0, 1}
    "checkers":  160,   # 32 dark squares × 5 one-hot values
                        # (empty, R, B, RK, BK)
    "nim":         1,   # objects remaining (normalised 0-1)
    "numguesser":  2,   # [num_opponents_normalised, round_normalised]
}

# Checkers piece encoding (one-hot index)
CHECKERS_ENCODING = {"." : 0, "R" : 1, "B" : 2, "RK": 3, "BK": 4}


# Abstract base

class GameNiteAdapter(abc.ABC):
    """
    Subclass this, implement the three abstract methods, and you're done.

    Example
    -------
    adapter = MyConnect4Adapter(user_id="abc123")
    adapter.train(total_episodes=100_000)
    adapter.save("connect4_v1.pth")
    """

    def __init__(self, game: str, user_id: str) -> None:
        if game not in GAME_ACTION_SPACES:
            raise ValueError(
                f"Unsupported game '{game}'. "
                f"Choose from: {list(GAME_ACTION_SPACES)}"
            )
        self.game    = game
        self.user_id = user_id
        self._model: PPO | None = None

    # Abstract methods — implement these

    @abc.abstractmethod
    def get_state_representation(self, board: Any) -> np.ndarray:
        """
        Convert the raw board object into a flat float32 numpy array.

        Expected output shapes (must match GAME_OBS_SIZES):
        - tictactoe  : (9,)   values in {-1=opponent, 0=empty, 1=us}
        - connect4   : (42,)  values in {-1=opponent, 0=empty, 1=us}
                              row-major: row0col0, row0col1 … row5col6
        - checkers   : (160,) 32 dark squares, each one-hot over 5 classes
                              order: square 0 … 31 (row-major, dark only)
                              classes: [empty, R, B, RK, BK]
        - nim        : (1,)   objects_remaining / starting_pile  (0-1)
        - numguesser : (2,)   [num_opponents/3, 0.0]  (second slot reserved)

        Parameters
        ----------
        board : Any
            Raw board value from the game environment's step/reset.

        Returns
        -------
        np.ndarray  dtype=float32
        """

    @abc.abstractmethod
    def get_action(self, state: np.ndarray) -> int:
        """
        Given an observation vector, return an action index.

        For fixed-space games this is straightforward.
        For checkers this returns an index into the legal_moves list —
        the inference service resolves it to the full squares sequence.

        Only used for manual / scripted evaluation outside of SB3 training.
        During a live match the inference service calls the policy directly.

        Parameters
        ----------
        state : np.ndarray   shape=(obs_dim,), dtype=float32

        Returns
        -------
        int
        """

    @abc.abstractmethod
    def build_env(self) -> VecEnv:
        """
        Construct and return the vectorised Gym environment for self-play
        (Checkers, Connect 4, Tic-Tac-Toe, Nim) or the competitive loop
        (Number Guesser).

        The environment's observation space must match GAME_OBS_SIZES[game]
        and its action space must match GAME_ACTION_SPACES[game] (or a
        reasonable upper bound for Checkers, e.g. Discrete(100)).

        Returns
        -------
        VecEnv
        """

    # Provided by base — do not override

    def get_obs_size(self) -> int:
        """Flat observation vector length for this game."""
        return GAME_OBS_SIZES[self.game]

    def get_action_space(self) -> int:
        """
        Fixed action space size, or -1 for Checkers (dynamic).
        Use len(legal_moves) at inference time for Checkers.
        """
        return GAME_ACTION_SPACES[self.game]

    def train(
        self,
        total_episodes: int = 100_000,
        learning_rate: float = 3e-4,
        checkpoint_path: str | None = None,
    ) -> None:
        """
        Run the SB3 PPO training loop.

        Parameters
        ----------
        total_episodes  : Total environment timesteps.
        learning_rate   : PPO learning rate.
        checkpoint_path : Resume from this .pth instead of starting fresh.
        """
        env = self.build_env()

        if checkpoint_path:
            self._model = self._load_from_checkpoint(checkpoint_path, env)
            print(f"[Adapter] Resumed from checkpoint: {checkpoint_path}")
        else:
            self._model = PPO(
                policy="MlpPolicy",
                env=env,
                learning_rate=learning_rate,
                verbose=1,
            )

        self._model.learn(total_timesteps=total_episodes)

    def save(self, path: str) -> None:
        """
        Serialise the trained model to a .pth artifact.

        Artifact schema
        ---------------
        {
          "sb3_state"      : OrderedDict  — SB3 policy state dict
          "metadata"       : {
              game, user_id, adapter_version,
              obs_size, action_space, trained_at
          }
          "hyperparameters": { learning_rate, n_steps }
        }
        """
        if self._model is None:
            raise RuntimeError("No trained model. Call .train() first.")

        artifact = {
            "sb3_state": self._model.policy.state_dict(),
            "metadata": {
                "game":            self.game,
                "user_id":         self.user_id,
                "adapter_version": ADAPTER_VERSION,
                "obs_size":        self.get_obs_size(),
                "action_space":    self.get_action_space(),
                "trained_at":      time.time(),
            },
            "hyperparameters": {
                "learning_rate": self._model.learning_rate,
                "n_steps":       self._model.n_steps,
            },
        }

        out = Path(path)
        torch.save(artifact, out)
        print(f"[Adapter] Saved → {out.resolve()}")

    def _load_from_checkpoint(self, path: str, env: VecEnv) -> PPO:
        artifact = torch.load(path, weights_only=False)
        _assert_compatible(artifact, self.game)
        model = PPO(policy="MlpPolicy", env=env)
        model.policy.load_state_dict(artifact["sb3_state"])
        return model


# Shared validation (also used by inference service)

def _assert_compatible(artifact: dict, game: str) -> None:
    """Raise ValueError if artifact game or adapter version doesn't match."""
    meta = artifact.get("metadata", {})
    if meta.get("game") != game:
        raise ValueError(
            f"Model trained for '{meta.get('game')}', "
            f"but environment is '{game}'."
        )
    if meta.get("adapter_version") != ADAPTER_VERSION:
        raise ValueError(
            f"Adapter version mismatch: "
            f"model={meta.get('adapter_version')}, "
            f"current={ADAPTER_VERSION}."
        )
