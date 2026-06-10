"""
GameNite Arena — Local Training Session Reporter
=================================================
The thin HTTP client a LOCAL training loop uses to talk to the platform.
Training happens on YOUR machine (see base_adapter.py); GameNite Arena only
records the run and shows it live on the trainer dashboard.

Typical loop:

    from session_reporter import GameNiteSession

    session = GameNiteSession("http://localhost:8000", "user0", "pwd0000")
    session.start("nim", episodes=50_000, learning_rate=3e-4,
                  model_display_name="my-nim-bot")

    for batch in range(50):
        ...train one batch...
        keep_going = session.report(
            episodes=batch * 1000,
            metrics={"winRate": win_rate, "meanReward": mean_reward},
        )
        if not keep_going:        # canceled from the web UI
            break
    else:
        session.complete(final_metrics={"winRate": win_rate})
        session.upload_artifact("my-nim-bot.pth")

Stdlib only — no requests/httpx dependency, so it runs anywhere the adapter
SDK runs.

Endpoint contract: shared/src/trainingSession.types.ts. Every mutating call
sends {"auth": {username, password}, "payload": {...}}; the artifact upload
is multipart with `auth` as a single JSON-string field.
"""

from __future__ import annotations

import json
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


class GameNiteSessionError(RuntimeError):
    """Raised when the platform answers with a non-2xx status."""


class GameNiteSession:
    """One local training session, registered with the GameNite Arena server."""

    def __init__(self, base_url: str, username: str, password: str,
                 timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.job_id: str | None = None
        self._auth = {"username": username, "password": password}

    # -- lifecycle ----------------------------------------------------------

    def start(self, game_key: str, *, episodes: int, learning_rate: float,
              model_display_name: str | None = None,
              model_id: str | None = None,
              extra: dict[str, Any] | None = None) -> str:
        """Register the session. Returns (and remembers) the job id."""
        config: dict[str, Any] = {"episodes": episodes, "learningRate": learning_rate}
        if extra:
            config["extra"] = extra

        payload: dict[str, Any] = {"gameKey": game_key, "config": config}
        if model_id is not None:
            payload["modelId"] = model_id
        elif model_display_name is not None:
            payload["modelDisplayName"] = model_display_name

        info = self._post_json("/api/training/submit", payload)
        self.job_id = info["jobId"]
        return self.job_id

    def report(self, episodes: int, metrics: dict[str, float] | None = None,
               message: str | None = None) -> bool:
        """
        Post one progress report.

        Returns True while the platform wants more; False once the session
        was canceled from the web UI — the caller should stop its loop.
        (The progress response IS the cancel control channel: the platform
        has no way to push into a loop running on your machine.)
        """
        payload: dict[str, Any] = {"episodes": episodes}
        if metrics is not None:
            payload["metrics"] = metrics
        if message is not None:
            payload["message"] = message

        info = self._post_json(self._job_path("progress"), payload)
        return info.get("status") != "canceled"

    def complete(self, final_metrics: dict[str, float] | None = None,
                 message: str | None = None) -> dict[str, Any]:
        """Mark the session completed."""
        payload: dict[str, Any] = {}
        if final_metrics is not None:
            payload["finalMetrics"] = final_metrics
        if message is not None:
            payload["message"] = message
        return self._post_json(self._job_path("complete"), payload)

    def fail(self, error: str) -> dict[str, Any]:
        """Mark the session failed with the given reason."""
        return self._post_json(self._job_path("fail"), {"error": error})

    def upload_artifact(self, pth_path: str) -> dict[str, Any]:
        """Upload the trained .pth and bind it to the session's model."""
        path = Path(pth_path)
        file_bytes = path.read_bytes()
        boundary = uuid.uuid4().hex

        def part(headers: str, content: bytes) -> bytes:
            return f"--{boundary}\r\n{headers}\r\n\r\n".encode() + content + b"\r\n"

        body = (
            part('Content-Disposition: form-data; name="auth"',
                 json.dumps(self._auth).encode())
            + part(
                f'Content-Disposition: form-data; name="file"; '
                f'filename="{path.name}"\r\nContent-Type: application/octet-stream',
                file_bytes,
            )
            + f"--{boundary}--\r\n".encode()
        )
        return self._request(
            self._job_path("artifact"),
            body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )

    # -- plumbing -----------------------------------------------------------

    def _job_path(self, action: str) -> str:
        if self.job_id is None:
            raise RuntimeError("start() must be called before reporting progress")
        return f"/api/training/{self.job_id}/{action}"

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps({"auth": self._auth, "payload": payload}).encode()
        return self._request(path, body=body, content_type="application/json")

    def _request(self, path: str, *, body: bytes, content_type: str) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            method="POST",
            headers={"Content-Type": content_type},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            try:
                detail = json.loads(detail).get("error", detail)
            except (ValueError, AttributeError):
                pass
            raise GameNiteSessionError(
                f"{path} -> HTTP {exc.code}: {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise GameNiteSessionError(
                f"{path} -> could not reach GameNite server: {exc.reason}"
            ) from exc
