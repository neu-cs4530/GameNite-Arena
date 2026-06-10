"""
GameNite Arena — Integration Tests: Inference Service (issue #28)
=================================================================
Covers the training-to-deployment flow at the inference boundary: load a model
from (stubbed) object storage, request moves for each game, hit the CoS 2.8
forfeit threshold, and unload. Storage and the heavy torch load are stubbed so
the suite is fast and deterministic in CI; the real service code paths
(encode -> predict -> decode, validation, forfeit counting) run unchanged.

Run:
    pip install fastapi pytest httpx numpy
    pytest ai/tests/test_inference_integration.py -v
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

import inference_service as svc


# stubs

class StubModel:
    """Stands in for an SB3 model: predict() returns a fixed action."""

    def __init__(self, action: int):
        self._action = action

    def predict(self, obs, deterministic=True):
        return np.array(self._action), None


@pytest.fixture(autouse=True)
def clean_registry():
    """Each test starts with an empty model registry."""
    svc._REGISTRY.clear()
    yield
    svc._REGISTRY.clear()


@pytest.fixture
def client(monkeypatch):
    # storage.download_to: pretend the artifact exists, write nothing useful.
    monkeypatch.setattr(svc.storage, "download_to", lambda key, dest: dest)
    return TestClient(svc.app)


def _load(client, monkeypatch, *, dep_id, game, action):
    """Helper: stub the policy load to inject a StubModel, then call /load."""
    monkeypatch.setattr(svc, "_load_policy", lambda path: StubModel(action))
    return client.post("/inference/load", json={
        "deployment_id": dep_id, "game": game, "storage_key": "k.pth",
    })


# tests

def test_health_empty(client):
    r = client.get("/inference/health")
    assert r.status_code == 200
    assert r.json()["loaded"] == []


def test_load_unknown_game_rejected(client):
    r = client.post("/inference/load", json={
        "deployment_id": "d1", "game": "chess", "storage_key": "k.pth",
    })
    assert r.status_code == 422


def test_load_missing_artifact_is_404(client, monkeypatch):
    def boom(key, dest):
        raise svc.storage.StorageError("not found")
    monkeypatch.setattr(svc.storage, "download_to", boom)
    monkeypatch.setattr(svc, "_load_policy", lambda p: StubModel(0))
    r = client.post("/inference/load", json={
        "deployment_id": "d1", "game": "nim", "storage_key": "missing.pth",
    })
    assert r.status_code == 404


def test_move_nim_decodes_action(client, monkeypatch):
    # action index 2 -> nim "take 3"
    assert _load(client, monkeypatch, dep_id="d1", game="nim", action=2).status_code == 200
    r = client.post("/inference/move", json={
        "deployment_id": "d1", "state": {"remaining": 7},
    })
    assert r.status_code == 200
    assert r.json()["move"] == 3


def test_move_checkers_uses_legal_moves(client, monkeypatch):
    # action 5 % 3 == 2 -> third legal move
    assert _load(client, monkeypatch, dep_id="d2", game="checkers", action=5).status_code == 200
    r = client.post("/inference/move", json={
        "deployment_id": "d2",
        "state": {"squares": ["empty"] * 32},
        "legal_moves": ["mA", "mB", "mC"],
    })
    assert r.status_code == 200
    assert r.json()["move"] == "mC"


def test_move_on_missing_deployment_is_404(client):
    r = client.post("/inference/move", json={
        "deployment_id": "nope", "state": {"remaining": 3},
    })
    assert r.status_code == 404


def test_forfeit_after_three_invalid(client, monkeypatch):
    """CoS 2.8: a bad state three times in a row triggers forfeit."""
    assert _load(client, monkeypatch, dep_id="d3", game="nim", action=0).status_code == 200
    bad = {"deployment_id": "d3", "state": {"remaining": "not-an-int"}}

    r1 = client.post("/inference/move", json=bad)
    assert r1.status_code == 422 and r1.json()["detail"]["consecutive_invalid"] == 1
    assert r1.json()["detail"]["forfeit"] is False

    client.post("/inference/move", json=bad)
    r3 = client.post("/inference/move", json=bad)
    assert r3.json()["detail"]["consecutive_invalid"] == 3
    assert r3.json()["detail"]["forfeit"] is True


def test_valid_move_resets_invalid_counter(client, monkeypatch):
    assert _load(client, monkeypatch, dep_id="d4", game="nim", action=1).status_code == 200
    # one invalid...
    client.post("/inference/move", json={"deployment_id": "d4", "state": {"remaining": "x"}})
    # ...then a valid move resets the counter
    ok = client.post("/inference/move", json={"deployment_id": "d4", "state": {"remaining": 5}})
    assert ok.status_code == 200
    assert svc._REGISTRY["d4"].consecutive_invalid == 0


def test_unload_frees_slot(client, monkeypatch):
    _load(client, monkeypatch, dep_id="d5", game="nim", action=0)
    assert "d5" in svc._REGISTRY
    r = client.post("/inference/unload", json={"deployment_id": "d5"})
    assert r.status_code == 200
    assert "d5" not in svc._REGISTRY


def test_unload_missing_is_404(client):
    r = client.post("/inference/unload", json={"deployment_id": "ghost"})
    assert r.status_code == 404
