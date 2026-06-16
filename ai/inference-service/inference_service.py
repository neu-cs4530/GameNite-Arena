"""
GameNite Arena — Inference Service (issue #26)
==============================================
FastAPI service that loads trained .pth policies and serves moves. Implements
the Sprint 0 contract: /inference/health, /inference/load, /inference/unload,
/inference/move.

Run locally:
    uvicorn inference_service:app --port 8001

Storage (self-hosted box): artifacts live in a local directory
(MODEL_STORE_PATH env var, default "models/"). Render stays the CANONICAL
artifact store; this box keeps a LOCAL CACHE filled lazily on demand:

  /inference/load builds MODEL_STORE/<model_id>.pth. If that file is missing
  it is pulled once from the Node API
  (NODE_API_URL/api/inference/artifact/<model_id>, authenticated with the
  shared token) and written to disk, so subsequent loads hit the local copy
  with no network call. If the file already exists, it is loaded straight from
  disk.

AUTH: the box and the Node backend share a single secret
(INFERENCE_SHARED_TOKEN). /load, /move and /unload require
`Authorization: Bearer <INFERENCE_SHARED_TOKEN>` (missing/wrong => 401).
/health stays open but returns status only — it never leaks the loaded
deployment list without the token.

SECURITY NOTES:
  * We never import or execute the user's adapter here. State<->tensor
    conversion uses the trusted server-side encoders (encoders.py).
  * model_id is sanitized before it touches the filesystem or a URL: any value
    containing a path separator or ".." is rejected, so the cache path and the
    pull URL can never be steered outside MODEL_STORE.
  * Every returned move is subject to the game rule engine on the caller's
    side; CoS 2.8 forfeit-after-3-invalid is tracked per deployment below.
"""

from __future__ import annotations

import hmac
import os
import re
import threading
from typing import Any
from urllib.parse import quote

import httpx
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

import encoders

ADAPTER_VERSION = "1.0.0"
MAX_CONSECUTIVE_INVALID = 3        # CoS 2.8

# Matches Zach's ARTIFACT_ROOT in artifactStore.service.ts (server/models/).
# This box keeps its own lazily-filled cache here.
MODEL_STORE = os.environ.get("MODEL_STORE_PATH", "models")

# Shared secret for the Node<->box link, and the Render base URL we pull
# canonical artifacts from. Read from the module so tests can monkeypatch them.
INFERENCE_SHARED_TOKEN = os.environ.get("INFERENCE_SHARED_TOKEN", "")
NODE_API_URL = os.environ.get("NODE_API_URL", "")

app = FastAPI(title="GameNite Arena Inference Service")


def require_shared_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency enforcing `Authorization: Bearer <shared token>`.

    Fails closed: with no token configured every gated request is 503 (never
    allow-all). A missing/malformed/wrong header is 401. The token is never
    echoed back.
    """
    expected = INFERENCE_SHARED_TOKEN
    if not expected:
        raise HTTPException(503, "Inference shared token is not configured")
    presented = None
    if authorization is not None and authorization.startswith("Bearer "):
        presented = authorization[len("Bearer "):]
    if presented is None or not hmac.compare_digest(presented, expected):
        raise HTTPException(401, "Invalid inference token")


_MODEL_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _safe_model_id(model_id: str) -> str:
    """Reject any model_id that isn't a plain artifact name (positive allowlist).

    Only [A-Za-z0-9._-] is permitted, and ".." is rejected outright, so the id
    can neither escape MODEL_STORE on disk nor inject query/fragment/host
    characters (?, #, @, whitespace, NUL, %-encodings) into the upstream pull
    URL. Real model ids are UUIDs, which satisfy this.
    """
    if ".." in model_id or _MODEL_ID_RE.match(model_id) is None:
        raise HTTPException(400, f"Invalid model_id: {model_id!r}")
    return model_id


def _ensure_artifact_cached(model_id: str) -> str:
    """Return the local path for model_id, pulling+caching it from Node if absent.

    Lazy pull-and-cache: when MODEL_STORE/<model_id>.pth is missing, fetch it
    from NODE_API_URL/api/inference/artifact/<model_id> with the shared token,
    write the bytes to disk, then return the path. When the file already exists
    it is returned WITHOUT any network call.

    Failure handling (a bad pull must surface clearly and never poison the
    cache, since `os.path.exists()` short-circuits future loads with no
    re-fetch):

      * Network failure / non-200 pull  -> 502.
      * Integrity: an empty (0-byte) body, or a body shorter than the
        Content-Length the Node endpoint advertises (a connection dropped
        mid-stream after a 200), is a truncated/corrupt artifact -> 502, with
        nothing written. The Node endpoint serves via res.download(), which
        sets Content-Length but exposes no sha256, so this size check is the
        strongest integrity signal available without a server-side hash.
      * Disk-write failure (full disk, read-only fs, permissions) -> 507,
        instead of a raw OSError surfacing as a 500 stack trace.

    The bytes are written to a temp file in MODEL_STORE and os.replace()'d into
    the canonical name atomically, so a partial write or a crash mid-write can
    never become the cached file; the temp is unlinked on any failure.
    """
    _safe_model_id(model_id)
    artifact_path = os.path.join(MODEL_STORE, f"{model_id}.pth")
    if os.path.exists(artifact_path):
        return artifact_path

    if not NODE_API_URL:
        raise HTTPException(502, "NODE_API_URL is not configured; cannot pull artifact")

    url = f"{NODE_API_URL}/api/inference/artifact/{quote(model_id, safe='')}"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {INFERENCE_SHARED_TOKEN}"},
            timeout=60.0,
        )
    except Exception as e:  # network failure reaching Render
        raise HTTPException(502, f"Failed to reach artifact store: {e}")

    if resp.status_code != 200:
        raise HTTPException(
            502,
            f"Artifact pull failed for {model_id} ({resp.status_code})",
        )

    content = resp.content
    # Integrity: reject empty or truncated bodies before they can be cached.
    if len(content) == 0:
        raise HTTPException(502, f"Artifact pull for {model_id} returned an empty body")
    declared = resp.headers.get("Content-Length")
    if declared is not None:
        try:
            expected_len = int(declared)
        except ValueError:
            expected_len = None
        if expected_len is not None and len(content) != expected_len:
            raise HTTPException(
                502,
                f"Artifact pull for {model_id} was truncated "
                f"({len(content)} of {expected_len} bytes)",
            )

    # Atomic write: temp file + os.replace, so a partial write never becomes
    # the canonical cache file. A disk-write OSError surfaces as 507, not 500.
    tmp_path = f"{artifact_path}.{os.getpid()}.tmp"
    try:
        os.makedirs(MODEL_STORE, exist_ok=True)
        with open(tmp_path, "wb") as f:
            f.write(content)
        os.replace(tmp_path, artifact_path)
    except OSError as e:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise HTTPException(507, f"Failed to cache artifact for {model_id}: {e}")
    return artifact_path


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
    """Liveness only. Open (no token) but minimal — it must NOT leak the loaded
    deployment list, which would expose what is running to an unauthenticated
    caller. Only a coarse occupancy count is returned."""
    return {
        "status": "ok",
        "adapter_version": ADAPTER_VERSION,
        "loaded": len(_REGISTRY),
    }


@app.post("/inference/load", dependencies=[Depends(require_shared_token)])
def load(req: LoadRequest):
    """
    Load a .pth into a runtime slot, pulling+caching it from Node on a miss.
    Idempotent: re-loading an existing id replaces it.
    """
    if req.game not in encoders.OBS_SIZES:
        raise HTTPException(422, f"Unknown game: {req.game}")

    # Sanitize first, then lazy pull-and-cache (returns the local path).
    artifact_path = _ensure_artifact_cached(req.model_id)

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


@app.post("/inference/unload", dependencies=[Depends(require_shared_token)])
def unload(req: UnloadRequest):
    """Free a runtime slot."""
    with _LOCK:
        existed = _REGISTRY.pop(req.deployment_id, None) is not None
    if not existed:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")
    return {"status": "unloaded", "deployment_id": req.deployment_id}


@app.post("/inference/move", dependencies=[Depends(require_shared_token)])
def move(req: MoveRequest):
    """Run one forward pass and return a move."""
    with _LOCK:
        dep = _REGISTRY.get(req.deployment_id)
    if dep is None:
        raise HTTPException(404, f"No such deployment: {req.deployment_id}")

    try:
        obs = encoders.encode_state(dep.game, req.state, obs_size=dep.obs_size)
        action_n = encoders.ACTION_SPACES.get(dep.game)
        mask = (
            encoders.legal_action_mask(dep.game, req.state, action_n)
            if isinstance(action_n, int)
            else None
        )
        raw_action = _predict(dep, obs, mask)
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


def _predict(dep: _Deployment, obs: np.ndarray, mask: "list[bool] | None" = None) -> int:
    model = dep.model
    if not hasattr(model, "predict"):
        raise HTTPException(500, "Loaded artifact has no predict().")

    # No mask (or every action legal) → the model's deterministic argmax.
    if mask is None or all(mask):
        action, _ = model.predict(obs, deterministic=True)
        return int(np.asarray(action).item())

    # Masked: rank the policy's action probabilities and take the best LEGAL
    # one, so a full column / occupied cell can never be returned. Falls back
    # to plain predict if probabilities can't be extracted.
    try:
        import torch

        obs_t, _ = model.policy.obs_to_tensor(obs)
        with torch.no_grad():
            dist = model.policy.get_distribution(obs_t)
        probs = np.asarray(dist.distribution.probs.cpu().numpy()).reshape(-1)
    except Exception:
        action, _ = model.predict(obs, deterministic=True)
        idx = int(np.asarray(action).item())
        return idx if (idx < len(mask) and mask[idx]) else next(
            (i for i, ok in enumerate(mask) if ok), idx
        )

    legal = [p if (i < len(mask) and mask[i]) else -1.0 for i, p in enumerate(probs)]
    if max(legal) < 0:  # nothing legal (shouldn't happen mid-game) — let predict decide
        action, _ = model.predict(obs, deterministic=True)
        return int(np.asarray(action).item())
    return int(np.argmax(legal))
