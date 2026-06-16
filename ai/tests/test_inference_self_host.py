"""
GameNite Arena — Inference Service Self-Host Tests
==================================================
The inference service now runs on a self-hosted box that pulls model artifacts
from the Render Node API on demand and caches them locally. This suite covers
the self-host contract:

  * Shared-token auth on /load, /move, /unload (Authorization: Bearer <token>).
    Missing/wrong => 401. /health stays open but leaks nothing.
  * Lazy pull-and-cache in /load:
      - no local file  -> fetch from NODE_API_URL/api/inference/artifact/<id>,
                          write it to MODEL_STORE/<id>.pth, then load.
      - local file     -> load from disk, NEVER fetch.
      - traversal id   -> rejected before any fetch or disk access.

torch / _load_policy are stubbed so no real .pth is required.

Run:
    pytest ai/tests/test_inference_self_host.py -v
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

import inference_service as svc


TOKEN = "self-host-shared-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(autouse=True)
def clean_registry():
    svc._REGISTRY.clear()
    yield
    svc._REGISTRY.clear()


@pytest.fixture
def model_store(tmp_path, monkeypatch):
    """Point MODEL_STORE at a temp directory and return it."""
    monkeypatch.setattr(svc, "MODEL_STORE", str(tmp_path))
    return tmp_path


@pytest.fixture(autouse=True)
def shared_token(monkeypatch):
    """Configure the shared token and Node base URL for every test."""
    monkeypatch.setattr(svc, "INFERENCE_SHARED_TOKEN", TOKEN)
    monkeypatch.setattr(svc, "NODE_API_URL", "https://render.example.com")


@pytest.fixture
def client():
    return TestClient(svc.app)


def _stub_policy(monkeypatch, action=0, obs_size=None, game="nim"):
    if obs_size is None:
        obs_size = max(svc.encoders.OBS_SIZES[game])

    class StubModel:
        def predict(self, obs, deterministic=True):
            return np.array(action), None

    monkeypatch.setattr(svc, "_load_policy", lambda path: (StubModel(), obs_size))


# ── auth ────────────────────────────────────────────────────────────────────

def test_load_requires_token(client, model_store):
    r = client.post("/inference/load", json={
        "deployment_id": "d1", "game": "nim", "model_id": "m1",
    })
    assert r.status_code == 401


def test_move_requires_token(client):
    r = client.post("/inference/move", json={
        "deployment_id": "d1", "state": {"remaining": 3},
    })
    assert r.status_code == 401


def test_unload_requires_token(client):
    r = client.post("/inference/unload", json={"deployment_id": "d1"})
    assert r.status_code == 401


def test_wrong_token_is_401(client, model_store):
    r = client.post(
        "/inference/load",
        headers={"Authorization": "Bearer not-the-token"},
        json={"deployment_id": "d1", "game": "nim", "model_id": "m1"},
    )
    assert r.status_code == 401


def test_health_stays_open_and_minimal(client, monkeypatch, model_store):
    """/health needs no token AND must not leak the loaded deployment list."""
    # Load a deployment so there is something that COULD leak.
    _stub_policy(monkeypatch)
    (model_store / "m1.pth").write_bytes(b"stub")
    assert client.post(
        "/inference/load", headers=AUTH,
        json={"deployment_id": "secret-dep", "game": "nim", "model_id": "m1"},
    ).status_code == 200

    r = client.get("/inference/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    # No token => the loaded deployment ids must not be exposed.
    assert "secret-dep" not in str(body)
    assert body.get("loaded") in (None, [], 1) or "loaded" not in body


# ── lazy pull-and-cache ───────────────────────────────────────────────────────

def test_load_pulls_from_node_when_no_local_file(client, monkeypatch, model_store):
    """No local artifact => fetch from Node, cache it, then load."""
    _stub_policy(monkeypatch)
    fetched = b"pulled-torch-bytes"

    calls = {}

    class FakeResponse:
        status_code = 200
        content = fetched
        # A real httpx 200 from res.download() carries Content-Length; the box
        # uses it to reject truncated pulls, so a clean pull must declare the
        # matching length.
        headers = {"Content-Length": str(len(fetched))}

    def fake_get(url, headers=None, timeout=None):
        calls["url"] = url
        calls["headers"] = headers
        return FakeResponse()

    monkeypatch.setattr(svc.httpx, "get", fake_get)

    target = model_store / "pull-me.pth"
    assert not target.exists()

    r = client.post(
        "/inference/load", headers=AUTH,
        json={"deployment_id": "d1", "game": "nim", "model_id": "pull-me"},
    )
    assert r.status_code == 200, r.text
    # Pulled from the right URL with the bearer token...
    assert calls["url"] == "https://render.example.com/api/inference/artifact/pull-me"
    assert calls["headers"]["Authorization"] == f"Bearer {TOKEN}"
    # ...and cached on the box.
    assert target.exists()
    assert target.read_bytes() == fetched


def test_load_does_not_fetch_when_local_file_exists(client, monkeypatch, model_store):
    """A cached artifact loads from disk WITHOUT any network call."""
    _stub_policy(monkeypatch)
    (model_store / "cached.pth").write_bytes(b"already-here")

    def boom(*args, **kwargs):
        raise AssertionError("httpx.get must not be called when the file is cached")

    monkeypatch.setattr(svc.httpx, "get", boom)

    r = client.post(
        "/inference/load", headers=AUTH,
        json={"deployment_id": "d1", "game": "nim", "model_id": "cached"},
    )
    assert r.status_code == 200, r.text


def test_load_non_200_pull_is_502(client, monkeypatch, model_store):
    """A failed pull from Node surfaces as a 502 (bad upstream)."""
    _stub_policy(monkeypatch)

    class FakeResponse:
        status_code = 404
        content = b""
        text = "not found"

    monkeypatch.setattr(svc.httpx, "get", lambda url, headers=None, timeout=None: FakeResponse())

    r = client.post(
        "/inference/load", headers=AUTH,
        json={"deployment_id": "d1", "game": "nim", "model_id": "ghost"},
    )
    assert r.status_code == 502, r.text


def test_traversal_model_id_rejected_before_any_io(client, monkeypatch, model_store):
    """A model_id containing path separators / .. is refused, no fetch, no read."""
    monkeypatch.setattr(
        svc.httpx, "get",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not fetch")),
    )
    for bad in ["../escape", "sub/dir", "..", "a/../../b"]:
        r = client.post(
            "/inference/load", headers=AUTH,
            json={"deployment_id": "d1", "game": "nim", "model_id": bad},
        )
        assert r.status_code != 200, f"traversal id {bad!r} must be rejected"
