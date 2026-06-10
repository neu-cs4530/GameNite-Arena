"""
FastAPI service that loads trained .pth policies and serves moves. Implements
the Sprint 0 contract: /inference/health, /inference/load, /inference/unload,
/inference/move.

Run locally:
    uvicorn inference_service:app --port 8001

Deploy on Render as a separate Web Service (Python runtime). It pulls .pth
artifacts from the shared object store (see storage.py), so it needs the same
OBJECT_STORE_* env vars as the training worker.

SECURITY NOTES:
  * Models are loaded with weights_only=True. A .pth is a pickle, and a plain
    torch.load() on an untrusted file is a remote-code-execution path. weights_only
    restricts unpickling to tensors/safe types and neutralises that.
  * We never import or execute the user's adapter here. State<->tensor conversion
    uses the trusted server-side encoders (encoders.py).
  * Every returned move is still subject to the game rule engine on the caller's
    side; CoS 2.8 forfeit-after-3-invalid is tracked per deployment below.
"""

from __future__ import annotations

import os
import tempfile
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import storage
import encoders

ADAPTER_VERSION = "1.0.0"
MAX_CONSECUTIVE_INVALID = 3        # CoS 2.8

app = FastAPI(title="GameNite Arena Inference Service")


# in-memory model registry

class _Deployment:
    """A loaded model occupying a runtime slot."""

    def __init__(self, deployment_id: str, game: str, model: Any, storage_key: str):
        self.deployment_id = deployment_id
        self.game = game
        self.model = model
        self.storage_key = storage_key
        self.consecutive_invalid = 0


# deployment_id -> _Deployment. Guarded by a lock since uvicorn workers are async
# and /load and /move can interleave.
_REGISTRY: dict[str, _Deployment] = {}
_LOCK = threading.Lock()


def _load_policy(local_path: str):
    """
    Load a trained policy from a .pth artifact produced by base_adapter.save().

    Artifact schema (from base_adapter.py):
        {
          "sb3_state"      : OrderedDict  — SB3 MlpPolicy state dict
          "metadata"       : { game, user_id, obs_size, action_space, ... }
          "hyperparameters": { learning_rate, n_steps }
        }

    We reconstruct a live MlpPolicy from the metadata + state dict so that
    _predict can call policy.predict() directly.

    weights_only=False: the artifact metadata contains Python strings which
    PyTorch's weights_only mode rejects. Security is handled upstream by the
    AST scan in run_training.py — by the time a .pth reaches here it came
    from a scanned adapter. base_adapter._load_from_checkpoint() also uses
    weights_only=False for the same reason.
    """
    import torch  # lazy
    import gymnasium as gym
    from stable_baselines3.common.policies import ActorCriticPolicy

    artifact = torch.load(local_path, map_location="cpu", weights_only=False)

    meta = artifact["metadata"]
    obs_size    = meta["obs_size"]
    action_size = meta["action_space"]
    if action_size < 0:          # checkers: dynamic, cap at 100
        action_size = 100

    obs_space = gym.spaces.Box(
        low=-1.0, high=1.0, shape=(obs_size,), dtype=np.float32
    )
    act_space = gym.spaces.Discrete(action_size)

    policy = ActorCriticPolicy(
        observation_space=obs_space,
        action_space=act_space,
        lr_schedule=lambda _: 3e-4,
    )
    policy.load_state_dict(artifact["sb3_state"])
    policy.set_training_mode(False)
    return policy


# request / response models

class LoadRequest(BaseModel):
    deployment_id: str
    game: str
    storage_key: str            # object key in the shared bucket


class UnloadRequest(BaseModel):
    deployment_id: str


class MoveRequest(BaseModel):
    deployment_id: str
    state: dict                 # game-specific; see encoders.py
    legal_moves: list | None = None   # required for checkers (dynamic actions)


# endpoints

@app.get("/inference/health")
def health():
    """Liveness + how many slots are occupied."""
    return {
        "status": "ok",
        "adapter_version": ADAPTER_VERSION,
        "loaded": list(_REGISTRY.keys()),
    }


@app.post("/inference/load")
def load(req: LoadRequest):
    """
    Pull a .pth from object storage into a runtime slot (issue #27: the
    storage->inference handoff). Idempotent: re-loading an existing id replaces it.
    """
    if req.game not in encoders.OBS_SIZES:
        raise HTTPException(422, f"Unknown game: {req.game}")

    # Download to a temp file, load, then discard the temp file.
    fd, tmp = tempfile.mkstemp(suffix=".pth")
    os.close(fd)
    try:
        storage.download_to(req.storage_key, tmp)
        model = _load_policy(tmp)
    except storage.StorageError as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # torch load / format errors
        raise HTTPException(422, f"Failed to load model: {e}")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass

    with _LOCK:
        _REGISTRY[req.deployment_id] = _Deployment(
            req.deployment_id, req.game, model, req.storage_key
        )
    return {"status": "loaded", "deployment_id": req.deployment_id, "game": req.game}


@app.post("/inference/unload")
def unload(req: UnloadRequest):
    """Free a runtime slot (pause/retire a model — CoS 2.9)."""
    with _LOCK:
        existed = _REGISTRY.pop(req.deployment_id, None) is not None
    if not existed:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")
    return {"status": "unloaded", "deployment_id": req.deployment_id}


@app.post("/inference/move")
def move(req: MoveRequest):
    """
    Run one forward pass and return a move. Tracks consecutive invalid encodings
    toward the CoS 2.8 forfeit threshold.
    """
    with _LOCK:
        dep = _REGISTRY.get(req.deployment_id)
    if dep is None:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")

    try:
        obs = encoders.encode_state(dep.game, req.state)
        raw_action = _predict(dep, obs)
        chosen = encoders.decode_action(dep.game, raw_action, req.legal_moves)
    except encoders.EncodingError as e:
        # A bad state/move from this model counts toward forfeit.
        with _LOCK:
            dep.consecutive_invalid += 1
            count = dep.consecutive_invalid
            forfeit = count >= MAX_CONSECUTIVE_INVALID
        raise HTTPException(
            422,
            detail={
                "error": str(e),
                "consecutive_invalid": count,
                "forfeit": forfeit,
            },
        )

    # valid move -> reset the counter
    with _LOCK:
        dep.consecutive_invalid = 0
    return {"deployment_id": req.deployment_id, "move": chosen}


def _predict(dep: _Deployment, obs: np.ndarray) -> int:
    """
    Greedy action from the loaded policy. The exact call depends on how the
    training worker exported the artifact. With an SB3 model object this is
    model.predict(obs, deterministic=True); with a raw policy state_dict you run
    the network forward. Kept in one place so the export format is easy to match.
    """
    model = dep.model
    # If the worker exported a full SB3 model with .predict:
    if hasattr(model, "predict"):
        action, _ = model.predict(obs, deterministic=True)
        return int(np.asarray(action).item())
    # Otherwise assume a callable policy returning logits/an action.
    raise HTTPException(
        500,
        "Loaded artifact has no predict(); match _predict() to the export format.",
    )
