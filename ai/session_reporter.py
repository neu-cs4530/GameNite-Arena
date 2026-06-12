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

Security model: the password is exchanged EXACTLY ONCE for an expiring
session token (POST /api/training/token); every other request authenticates
with the token, so your password never sits in the training loop, process
output, or request logs. If the token expires mid-run it is re-exchanged
transparently. You can also skip the password entirely and pass a
pre-issued token:

    session = GameNiteSession("http://localhost:8000", token="...")

Privacy note: session info (including fail() reasons and config extras) is
publicly readable on the platform — send failure summaries, not stack
traces full of local paths.

Stdlib only — no requests/httpx dependency, so it runs anywhere the adapter
SDK runs. Endpoint contract: shared/src/trainingSession.types.ts.
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

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class GameNiteSession:
    """One local training session, registered with the GameNite Arena server."""

    def __init__(self, base_url: str, username: str | None = None,
                 password: str | None = None, timeout: float = 10.0,
                 token: str | None = None) -> None:
        if token is None and (username is None or password is None):
            raise ValueError(
                "GameNiteSession needs either username/password or a token."
            )
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.job_id: str | None = None
        self._password_auth = (
            {"username": username, "password": password}
            if username is not None and password is not None
            else None
        )
        self._token = token

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

    def attach(self, job_id: str) -> str:
        """
        Adopt a session registered elsewhere — typically the web UI's
        "New training run" page, which registers a queued session and shows
        the command to run locally. Subsequent report()/complete()/fail()/
        upload_artifact() calls post to that job. Makes no requests itself;
        use get_job() to discover the job's game and config.
        """
        self.job_id = job_id
        return job_id

    def get_job(self, job_id: str | None = None) -> dict[str, Any]:
        """
        Fetch a session's public info — plain GET /api/training/:jobId, no
        auth needed. This is how an attached trainer discovers gameKey and
        config (episodes, learningRate, extra.heuristics) for a run that
        was registered on the web form. Defaults to the attached job.
        """
        target = job_id if job_id is not None else self.job_id
        if target is None:
            raise RuntimeError("get_job() needs a job id (pass one or attach() first)")
        return self._request(f"/api/training/{target}", method="GET")

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
        """Mark the session failed. The reason is PUBLICLY visible — summarize."""
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
                 json.dumps(self._auth()).encode())
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

    # -- auth ----------------------------------------------------------------

    def _auth(self) -> dict[str, Any]:
        """Current auth payload — the token once issued, never the password."""
        if self._token is None:
            self._exchange_token()
        return {"token": self._token}

    def _exchange_token(self) -> None:
        """Trade the password for an expiring session token (one round-trip)."""
        if self._password_auth is None:
            raise GameNiteSessionError(
                "Token rejected and no password available to re-authenticate."
            )
        body = json.dumps({"auth": self._password_auth, "payload": {}}).encode()
        info = self._request("/api/training/token", body=body,
                             content_type="application/json")
        self._token = info["token"]

    # -- plumbing -----------------------------------------------------------

    def _job_path(self, action: str) -> str:
        if self.job_id is None:
            raise RuntimeError("start() must be called before reporting progress")
        return f"/api/training/{self.job_id}/{action}"

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps({"auth": self._auth(), "payload": payload}).encode()
        try:
            return self._request(path, body=body, content_type="application/json")
        except GameNiteSessionError as exc:
            # A 403 with a password on hand usually means the token expired —
            # re-exchange once and retry, then let any second failure surface.
            if exc.status == 403 and self._password_auth is not None:
                self._token = None
                body = json.dumps({"auth": self._auth(), "payload": payload}).encode()
                return self._request(path, body=body, content_type="application/json")
            raise

    def _request(self, path: str, *, body: bytes | None = None,
                 content_type: str | None = None,
                 method: str | None = None) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            method=method or "POST",
            headers={"Content-Type": content_type} if content_type else {},
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
                f"{path} -> HTTP {exc.code}: {detail}", status=exc.code
            ) from exc
        except urllib.error.URLError as exc:
            raise GameNiteSessionError(
                f"{path} -> could not reach GameNite server: {exc.reason}"
            ) from exc
