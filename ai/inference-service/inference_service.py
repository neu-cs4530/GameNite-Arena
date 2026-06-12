"""
GameNite Arena — Inference Service (issue #26)
==============================================
FastAPI service that loads trained .pth policies and serves moves. Implements
the Sprint 0 contract: /inference/health, /inference/load, /inference/unload,
/inference/move.

Run locally:
    uvicorn inference_service:app --port 8001

Storage: artifacts are read from a local directory (MODEL_STORE_PATH env var,
default "models/"). The Node server and inference service run as a COMBINED
Render service sharing the same disk, so no object storage is needed.
Zach's artifactStore.service.ts writes <modelId>.pth into this directory;
/inference/load reads it by model ID.

SECURITY NOTES:
  * We never import or execute the user's adapter here. State<->tensor
    conversion uses the trusted server-side encoders (encoders.py).
  * Every returned move is subject to the game rule engine on the caller's
    side; CoS 2.8 forfeit-after-3-invalid is tracked per deployment below.
"""

from __future__ import annotations

import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import encoders

ADAPTER_VERSION = "1.0.0"
MAX_CONSECUTIVE_INVALID = 3        # CoS 2.8

# Matches Zach's ARTIFACT_ROOT in artifactStore.service.ts (server/models/).
# On the combined Render service both processes share this directory.
MODEL_STORE = os.environ.get("MODEL_STORE_PATH", "models")

app = FastAPI(title="GameNite Arena Inference Service")


# in-memory model registry

class _Deployment:
    """A loaded model occupying a runtime slot."""

    def __init__(self, deployment_id: str, game: str, model: Any, artifact_ref: str,
                 obs_size: int):
        self.deployment_id = deployment_id
        self.game = game
        self.model = model
        self.artifact_ref = artifact_ref
        # The artifact's recorded observation size — picks the encoder layout
        # for games whose contract evolved (nim: 1 legacy, 5 v2).
        self.obs_size = obs_size
        self.consecutive_invalid = 0


_REGISTRY: dict[str, _Deployment] = {}
_LOCK = threading.Lock()


def _load_policy(local_path: str):
    """
    Load a trained policy from a .pth artifact produced by base_adapter.save().
    Returns (policy, obs_size) — obs_size is the artifact's recorded
    observation size, which drives encoder-layout dispatch per deployment.

    Artifact schema:
        {
          "sb3_state"      : OrderedDict  — SB3 policy state dict
          "metadata"       : { game, user_id, obs_size, action_space, ... }
          "hyperparameters": { learning_rate, n_steps }
        }
    """
    import torch
    import gymnasium as gym
    from stable_baselines3.common.policies import ActorCriticPolicy

    artifact = torch.load(local_path, map_location="cpu", weights_only=False)

    meta = artifact["metadata"]
    obs_size    = meta["obs_size"]
    action_size = meta["action_space"]
    if action_size < 0:
        action_size = 100   # checkers: dynamic, cap at 100

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
    return policy, obs_size


# request / response models

class LoadRequest(BaseModel):
    deployment_id: str
    game: str
    model_id: str       # used to build path: MODEL_STORE/<model_id>.pth


class UnloadRequest(BaseModel):
    deployment_id: str


class MoveRequest(BaseModel):
    deployment_id: str
    state: dict
    legal_moves: list | None = None   # required for checkers


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
    Load a .pth from the local model store into a runtime slot.
    Idempotent: re-loading an existing id replaces it.
    """
    if req.game not in encoders.OBS_SIZES:
        raise HTTPException(422, f"Unknown game: {req.game}")

    artifact_path = os.path.join(MODEL_STORE, f"{req.model_id}.pth")
    if not os.path.exists(artifact_path):
        raise HTTPException(404, f"Artifact not found: {req.model_id}.pth")

    try:
        model, obs_size = _load_policy(artifact_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to load model: {e}")

    allowed = encoders.OBS_SIZES[req.game]
    if obs_size not in allowed:
        raise HTTPException(
            422,
            f"Artifact obs_size={obs_size} is not servable for {req.game} "
            f"(allowed: {allowed})",
        )

    with _LOCK:
        _REGISTRY[req.deployment_id] = _Deployment(
            req.deployment_id, req.game, model, req.model_id, obs_size
        )
    return {"status": "loaded", "deployment_id": req.deployment_id, "game": req.game}


@app.post("/inference/unload")
def unload(req: UnloadRequest):
    """Free a runtime slot."""
    with _LOCK:
        existed = _REGISTRY.pop(req.deployment_id, None) is not None
    if not existed:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")
    return {"status": "unloaded", "deployment_id": req.deployment_id}


@app.post("/inference/move")
def move(req: MoveRequest):
    """Run one forward pass and return a move."""
    with _LOCK:
        dep = _REGISTRY.get(req.deployment_id)
    if dep is None:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")

    try:
        obs = encoders.encode_state(dep.game, req.state, obs_size=dep.obs_size)
        raw_action = _predict(dep, obs)
        chosen = encoders.decode_action(dep.game, raw_action, req.legal_moves, state=req.state)
    except encoders.EncodingError as e:
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

    with _LOCK:
        dep.consecutive_invalid = 0
    return {"deployment_id": req.deployment_id, "move": chosen}


def _predict(dep: _Deployment, obs: np.ndarray) -> int:
    model = dep.model
    if hasattr(model, "predict"):
        action, _ = model.predict(obs, deterministic=True)
        return int(np.asarray(action).item())
    raise HTTPException(500, "Loaded artifact has no predict().")
