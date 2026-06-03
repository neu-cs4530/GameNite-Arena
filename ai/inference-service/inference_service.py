"""
GameNite Arena — Inference Service
====================================
Separate FastAPI process. The Express backend calls this whenever
it's an AI's turn. Never exposed directly to users.

Start:
    uvicorn inference_service:app --host 0.0.0.0 --port 8001

Environment variables:
    MODEL_STORE_PATH   Path where uploaded .pth files live (default: ./models)
    MOVE_TIMEOUT_SEC   Max seconds per move before forfeit (default: 5)
    MAX_SLOTS_PER_USER Max concurrently loaded models per user (default: 3)
"""

from __future__ import annotations

import os
import signal
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from stable_baselines3.common.policies import ActorCriticPolicy
from gymnasium import spaces

from base_adapter import (
    ADAPTER_VERSION,
    GAME_ACTION_SPACES,
    GAME_OBS_SIZES,
    _assert_compatible,
)

# Config 
MODEL_STORE  = Path(os.getenv("MODEL_STORE_PATH", "./models"))
MOVE_TIMEOUT = int(os.getenv("MOVE_TIMEOUT_SEC",  "5"))
MAX_SLOTS    = int(os.getenv("MAX_SLOTS_PER_USER", "3"))

# Runtime slot registry
# { model_id: { policy, metadata, user_id, display_name, loaded_at } }
_loaded: dict[str, dict] = {}

app = FastAPI(
    title="GameNite Arena — Inference Service",
    version="1.0.0",
    description=(
        "Hosts trained .pth artifacts and returns AI moves on demand. "
        "Called by the main GameNite backend."
    ),
)


# Schemas
class LoadRequest(BaseModel):
    model_id:     str = Field(..., description="Unique model ID from object storage")
    user_id:      str = Field(..., description="Owner account ID")
    game:         str = Field(..., description="Game the model was trained on")
    display_name: str = Field("", description="Human-readable name for leaderboard")


class LoadResponse(BaseModel):
    model_id:        str
    game:            str
    adapter_version: str
    obs_size:        int
    action_space:    int   # -1 for checkers (dynamic)
    loaded_at:       float
    status:          str = "loaded"


class UnloadRequest(BaseModel):
    model_id: str
    user_id:  str


class MoveRequest(BaseModel):
    model_id: str = Field(..., description="Which loaded model to query")
    game:     str = Field(..., description="Must match the model's trained game")
    state:    list[float] = Field(
        ...,
        description=(
            "Flat float32 observation vector from the adapter's "
            "get_state_representation(). Length must match the model's obs_size."
        ),
    )
    # Required only for checkers — the full legal move list from viewAs().
    # Each entry is a complete squares sequence: [[r0,c0],[r1,c1],...]
    # The model picks an index; the service returns the full sequence.
    legal_moves: list[list[list[int]]] | None = Field(
        None,
        description=(
            "Checkers only. Full legal move sequences from the game server's "
            "viewAs(). Model output is treated as an index into this list."
        ),
    )


class MoveResponse(BaseModel):
    # For all games except checkers:
    action:     int | None = Field(None, description="Action index (fixed-space games)")
    # For checkers only:
    squares:    list[list[int]] | None = Field(
        None,
        description="Full squares sequence for checkers multi-capture moves"
    )
    latency_ms: float
    model_id:   str


class HealthResponse(BaseModel):
    status:          str = "ok"
    loaded_count:    int
    adapter_version: str = ADAPTER_VERSION


# Endpoints

@app.get("/inference/health", response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    """Liveness check. Main backend polls this before routing AI turns."""
    return HealthResponse(loaded_count=len(_loaded))


@app.post("/inference/load", response_model=LoadResponse, tags=["lifecycle"])
def load_model(req: LoadRequest) -> LoadResponse:
    """
    Deserialise a .pth artifact into a live runtime slot.

    Enforces:
    - Per-user slot cap (MAX_SLOTS_PER_USER = 3, CoS 2.7)
    - Game + adapter version compatibility check
    - Artifact must exist in MODEL_STORE
    """
    user_slots = [m for m in _loaded.values() if m["user_id"] == req.user_id]
    if len(user_slots) >= MAX_SLOTS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"User '{req.user_id}' already has {MAX_SLOTS} models loaded. "
                "Unload one before deploying another (CoS 2.7)."
            ),
        )

    if req.model_id in _loaded:
        raise HTTPException(status_code=409, detail="Model already loaded.")

    pth_path = MODEL_STORE / f"{req.model_id}.pth"
    if not pth_path.exists():
        raise HTTPException(status_code=404, detail=f"Artifact not found: {pth_path}")

    artifact = torch.load(pth_path, weights_only=False)

    try:
        _assert_compatible(artifact, req.game)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    policy = _rebuild_policy(artifact)

    _loaded[req.model_id] = {
        "policy":       policy,
        "metadata":     artifact["metadata"],
        "user_id":      req.user_id,
        "display_name": req.display_name,
        "loaded_at":    time.time(),
    }

    meta = artifact["metadata"]
    return LoadResponse(
        model_id=req.model_id,
        game=meta["game"],
        adapter_version=meta["adapter_version"],
        obs_size=meta["obs_size"],
        action_space=meta["action_space"],
        loaded_at=_loaded[req.model_id]["loaded_at"],
    )


@app.post("/inference/unload", tags=["lifecycle"])
def unload_model(req: UnloadRequest) -> dict:
    """
    Free a runtime slot.
    Called when a user pauses, retires, or hits the cap (CoS 2.9).
    """
    slot = _loaded.get(req.model_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Model not loaded.")
    if slot["user_id"] != req.user_id:
        raise HTTPException(status_code=403, detail="Not your model.")

    del _loaded[req.model_id]
    return {"status": "unloaded", "model_id": req.model_id}


@app.post("/inference/move", response_model=MoveResponse, tags=["inference"])
def get_move(req: MoveRequest) -> MoveResponse:
    """
    Core inference endpoint. Called by the main backend on an AI's turn.

    For fixed-space games (tictactoe, connect4, nim, numguesser):
      - Returns action index. Main backend validates against game rules.

    For checkers:
      - Requires legal_moves list from the game server's viewAs().
      - Model outputs an index; service returns the full squares sequence.
      - Action space is clamped to len(legal_moves) so out-of-range
        outputs are wrapped with modulo.

    Main backend responsibilities (CoS 2.8):
      - Validate returned action/squares against the game rule engine.
      - Forfeit match after 3 consecutive invalid moves.

    Timeout: MOVE_TIMEOUT seconds (default 5). Returns 504 on breach.
    """
    slot = _loaded.get(req.model_id)
    if slot is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{req.model_id}' not loaded. Call /inference/load first.",
        )

    meta = slot["metadata"]
    if meta["game"] != req.game:
        raise HTTPException(
            status_code=422,
            detail=f"Model trained for '{meta['game']}' but request is for '{req.game}'.",
        )

    # Checkers requires legal_moves
    if req.game == "checkers" and not req.legal_moves:
        raise HTTPException(
            status_code=422,
            detail="Checkers inference requires legal_moves list from viewAs().",
        )

    obs = np.array(req.state, dtype=np.float32)

    t0 = time.perf_counter()
    try:
        raw_action = _infer_with_timeout(slot["policy"], obs)
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"Model exceeded {MOVE_TIMEOUT}s move timeout (CoS 2.8).",
        )
    latency_ms = (time.perf_counter() - t0) * 1000

    # Resolve checkers action index → full squares sequence
    if req.game == "checkers":
        n = len(req.legal_moves)
        idx = int(raw_action) % n   # wrap out-of-range outputs
        squares = req.legal_moves[idx]
        return MoveResponse(
            action=None,
            squares=squares,
            latency_ms=round(latency_ms, 2),
            model_id=req.model_id,
        )

    # Fixed-space games: return action index directly
    # Nim: clamp to valid range based on pile size if provided in state
    action = int(raw_action)
    if req.game == "nim":
        pile = round(obs[0] * 21)   # de-normalise (approx)
        max_take = min(3, pile)
        action = min(action, max_take - 1)

    return MoveResponse(
        action=action,
        squares=None,
        latency_ms=round(latency_ms, 2),
        model_id=req.model_id,
    )


# Helpers

def _rebuild_policy(artifact: dict) -> ActorCriticPolicy:
    """
    Reconstruct an SB3 MlpPolicy from a saved state dict.
    No live env needed for inference-only use.
    """
    meta     = artifact["metadata"]
    obs_size = meta["obs_size"]

    # Checkers uses MAX_LEGAL_MOVES=100 as training upper bound
    n_acts = meta["action_space"] if meta["action_space"] != -1 else 100

    obs_space = spaces.Box(low=-1.0, high=1.0, shape=(obs_size,), dtype=np.float32)
    act_space = spaces.Discrete(n_acts)

    policy = ActorCriticPolicy(
        observation_space=obs_space,
        action_space=act_space,
        lr_schedule=lambda _: 3e-4,
    )
    policy.load_state_dict(artifact["sb3_state"])
    policy.eval()
    return policy


def _infer_with_timeout(policy: ActorCriticPolicy, obs: np.ndarray) -> int:
    """Run policy inference with a SIGALRM-based timeout."""
    def _handler(signum, frame):
        raise TimeoutError()

    signal.signal(signal.SIGALRM, _handler)
    signal.alarm(MOVE_TIMEOUT)
    try:
        obs_tensor = torch.tensor(obs).unsqueeze(0)
        with torch.no_grad():
            actions, _, _ = policy.forward(obs_tensor, deterministic=True)
        return int(actions.item())
    finally:
        signal.alarm(0)
