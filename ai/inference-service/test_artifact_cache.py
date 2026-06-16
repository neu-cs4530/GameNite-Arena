"""
GameNite Arena — Inference Service artifact-cache tests
=======================================================
Covers the lazy pull-and-cache path in inference_service._ensure_artifact_cached:

  * disk-write failure surfaces as a clean error code, never a raw 500;
  * a partial/truncated 200 (Content-Length header > received bytes) is
    rejected and NEVER poisons the cache;
  * an empty (0-byte) 200 is rejected and never poisons the cache;
  * a partial pull leaves no temp file behind;
  * a successful pull writes the canonical file atomically and is cached
    (no second network call on the next load).

These exercise the lens requirement that pull/disk-write failures surface
clearly instead of caching corrupt bytes or 500-ing with a stack trace.
"""

from __future__ import annotations

import os

import httpx
import pytest
from fastapi import HTTPException

import inference_service as svc


@pytest.fixture()
def store(tmp_path, monkeypatch):
    """Point the cache at an empty temp dir and configure a Node URL."""
    model_store = tmp_path / "models"
    model_store.mkdir()
    monkeypatch.setattr(svc, "MODEL_STORE", str(model_store))
    monkeypatch.setattr(svc, "NODE_API_URL", "http://node.example")
    monkeypatch.setattr(svc, "INFERENCE_SHARED_TOKEN", "secret")
    return model_store


def _fake_get(body: bytes, *, content_length: str | None, status: int = 200):
    """Build a stand-in for httpx.get returning a controlled response.

    content_length lets a test declare a Content-Length header that disagrees
    with the body length (truncated stream) or matches it (clean pull).
    """

    def _get(url, headers=None, timeout=None):  # noqa: ANN001 - mirrors httpx.get
        resp = httpx.Response(status, content=body)
        if content_length is None:
            resp.headers.pop("Content-Length", None)
        else:
            resp.headers["Content-Length"] = content_length
        return resp

    return _get


def _cache_path(store, model_id: str) -> str:
    return os.path.join(str(store), f"{model_id}.pth")


# ── disk-write failure ─────────────────────────────────────────────────────────

def test_disk_write_failure_is_clean_error_not_500(store, monkeypatch):
    """A write that raises OSError must surface as a clean HTTPException (507),
    not bubble out as a raw OSError that FastAPI turns into a 500 stack trace."""
    body = b"valid-artifact-bytes"
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(body, content_length=str(len(body)))
    )

    real_open = open

    def boom(path, *args, **kwargs):  # noqa: ANN001
        # Fail only for our cache writes; leave everything else alone.
        if str(path).endswith(".pth") or ".pth." in str(path):
            raise OSError(28, "No space left on device")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", boom)

    with pytest.raises(HTTPException) as exc:
        svc._ensure_artifact_cached("nim_demo")
    assert exc.value.status_code == 507
    assert "cache" in exc.value.detail.lower()


def test_disk_write_failure_leaves_no_partial_cache(store, monkeypatch):
    """After a write failure the canonical file must not exist (no poisoned
    cache for a later load to trust)."""
    body = b"valid-artifact-bytes"
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(body, content_length=str(len(body)))
    )

    real_open = open

    def boom(path, *args, **kwargs):  # noqa: ANN001
        if str(path).endswith(".pth") or ".pth." in str(path):
            raise OSError(13, "Permission denied")
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr("builtins.open", boom)

    with pytest.raises(HTTPException):
        svc._ensure_artifact_cached("nim_demo")
    assert not os.path.exists(_cache_path(store, "nim_demo"))


# ── truncated / empty 200 (integrity) ──────────────────────────────────────────

def test_truncated_200_is_rejected(store, monkeypatch):
    """A 200 whose Content-Length exceeds the received body is a truncated
    stream — reject it instead of caching corrupt bytes."""
    body = b"short"
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(body, content_length="9999")
    )
    with pytest.raises(HTTPException) as exc:
        svc._ensure_artifact_cached("nim_demo")
    assert exc.value.status_code == 502
    assert not os.path.exists(_cache_path(store, "nim_demo"))


def test_truncated_200_leaves_no_temp_file(store, monkeypatch):
    """A rejected truncated pull must not leave a stray temp file behind."""
    body = b"short"
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(body, content_length="9999")
    )
    with pytest.raises(HTTPException):
        svc._ensure_artifact_cached("nim_demo")
    leftovers = os.listdir(str(store))
    assert leftovers == [], f"temp/cache leftovers after truncated pull: {leftovers}"


def test_empty_200_is_rejected(store, monkeypatch):
    """An empty (0-byte) 200 must be rejected, never written as a 0-byte
    .pth that loads forever-broken with no re-fetch."""
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(b"", content_length="0")
    )
    with pytest.raises(HTTPException) as exc:
        svc._ensure_artifact_cached("nim_demo")
    assert exc.value.status_code == 502
    assert not os.path.exists(_cache_path(store, "nim_demo"))
    assert os.listdir(str(store)) == []


def test_empty_200_no_content_length_header_is_rejected(store, monkeypatch):
    """Some responses omit Content-Length; an empty body must still be
    rejected on the 0-byte check alone."""
    monkeypatch.setattr(
        svc.httpx, "get", _fake_get(b"", content_length=None)
    )
    with pytest.raises(HTTPException) as exc:
        svc._ensure_artifact_cached("nim_demo")
    assert exc.value.status_code == 502
    assert not os.path.exists(_cache_path(store, "nim_demo"))


# ── happy path: clean pull is cached atomically ─────────────────────────────────

def test_clean_pull_writes_and_caches(store, monkeypatch):
    """A clean 200 (Content-Length matches body) writes the canonical file and
    is then served from disk with no second network call."""
    body = b"genuine-artifact-bytes"
    calls = {"n": 0}

    def counting_get(url, headers=None, timeout=None):  # noqa: ANN001
        calls["n"] += 1
        resp = httpx.Response(200, content=body)
        resp.headers["Content-Length"] = str(len(body))
        return resp

    monkeypatch.setattr(svc.httpx, "get", counting_get)

    path1 = svc._ensure_artifact_cached("nim_demo")
    assert os.path.exists(path1)
    with open(path1, "rb") as f:
        assert f.read() == body
    # No temp file left in the store directory.
    assert os.listdir(str(store)) == ["nim_demo.pth"]

    # Second call is served from disk — no extra network call.
    path2 = svc._ensure_artifact_cached("nim_demo")
    assert path2 == path1
    assert calls["n"] == 1


def test_clean_pull_no_content_length_header_is_accepted(store, monkeypatch):
    """When Content-Length is absent (chunked transfer), a non-empty body is
    still accepted — we only reject when a present header disagrees."""
    body = b"genuine-artifact-bytes"

    def get(url, headers=None, timeout=None):  # noqa: ANN001
        resp = httpx.Response(200, content=body)
        resp.headers.pop("Content-Length", None)
        return resp

    monkeypatch.setattr(svc.httpx, "get", get)
    path = svc._ensure_artifact_cached("nim_demo")
    with open(path, "rb") as f:
        assert f.read() == body
