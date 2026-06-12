"""
GameNite Arena — Unit Tests: Local Training Session Reporter
=============================================================
Covers the stdlib HTTP client the local training loop uses to talk to the
platform (ai/session_reporter.py):

  - start() exchanges the password ONCE for an expiring token
    (POST /api/training/token), then registers the session with token auth
  - report() posts progress with token auth and returns False once the
    server says canceled; an expired token is re-exchanged transparently
  - complete()/fail() hit the terminal endpoints
  - upload_artifact() sends multipart with a JSON-string token auth field
  - a session can be constructed from an existing token (no password at all)
  - non-2xx responses raise with the server's error message

The fake server is a recording stdlib ThreadingHTTPServer — no torch, no
network beyond loopback, no GameNite server needed. Token requests are
answered automatically (token-1, token-2, ...); other responses come from
the scripted queue.

Run:
    pytest ai/tests/test_session_reporter.py -v
"""

import json
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from session_reporter import GameNiteSession, GameNiteSessionError

AUTH = {"username": "user0", "password": "pwd0000"}


class _RecordingHandler(BaseHTTPRequestHandler):
    """Records every request; answers /token automatically, rest from script."""

    def _handle(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        content_type = self.headers.get("Content-Type", "")

        record = {
            "method": self.command,
            "path": self.path,
            "content_type": content_type,
            "raw": raw,
            "json": None,
        }
        if content_type.startswith("application/json") and raw:
            record["json"] = json.loads(raw)
        self.server.records.append(record)

        if self.path == "/api/training/token":
            self.server.tokens_issued += 1
            status, body = 201, {
                "token": f"token-{self.server.tokens_issued}",
                "username": "user0",
                "expiresAt": "2099-01-01T00:00:00.000Z",
            }
        elif self.server.script:
            status, body = self.server.script.popleft()
        else:
            status, body = 200, {"jobId": "default-job", "status": "running"}

        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_POST = _handle
    do_GET = _handle

    def log_message(self, *args):  # silence per-request stderr noise
        pass


@pytest.fixture()
def fake_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RecordingHandler)
    server.records = []
    server.script = deque()
    server.tokens_issued = 0
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    yield server, base_url
    server.shutdown()
    thread.join(timeout=2)


def make_session(base_url):
    return GameNiteSession(base_url, AUTH["username"], AUTH["password"])


def requests_to(server, suffix):
    return [r for r in server.records if r["path"].endswith(suffix)]


def test_start_exchanges_password_for_token_then_submits_with_it(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))

    session = make_session(base_url)
    job_id = session.start("nim", episodes=100, learning_rate=0.001,
                           model_display_name="my-nim-bot")

    assert job_id == "job-1"
    assert session.job_id == "job-1"

    [token_request] = requests_to(server, "/api/training/token")
    assert token_request["json"]["auth"] == AUTH

    [submit] = requests_to(server, "/api/training/submit")
    assert submit["json"]["auth"] == {"token": "token-1"}
    payload = submit["json"]["payload"]
    assert payload["gameKey"] == "nim"
    assert payload["modelDisplayName"] == "my-nim-bot"
    assert payload["config"] == {"episodes": 100, "learningRate": 0.001}


def test_password_is_sent_exactly_once_across_the_whole_session(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "running"}))
    server.script.append((200, {"jobId": "job-1", "status": "completed"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    session.report(50, metrics={"winRate": 0.5})
    session.complete(final_metrics={"winRate": 0.6})

    password_bearing = [
        r for r in server.records
        if r["json"] and r["json"].get("auth", {}).get("password") is not None
    ]
    assert len(password_bearing) == 1
    assert password_bearing[0]["path"] == "/api/training/token"


def test_start_with_existing_model_id(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-2", "status": "queued"}))

    session = make_session(base_url)
    session.start("connect4", episodes=10, learning_rate=0.1, model_id="model-7")

    [submit] = requests_to(server, "/api/training/submit")
    assert submit["json"]["payload"]["modelId"] == "model-7"
    assert "modelDisplayName" not in submit["json"]["payload"]


def test_report_returns_true_while_running_and_false_when_canceled(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "running"}))
    server.script.append((200, {"jobId": "job-1", "status": "canceled"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)

    assert session.report(50, metrics={"winRate": 0.5}, message="ep 50") is True
    assert session.report(60) is False

    progress_requests = requests_to(server, "/progress")
    assert progress_requests[0]["json"]["payload"]["episodes"] == 50
    assert progress_requests[0]["json"]["auth"] == {"token": "token-1"}


def test_expired_token_is_re_exchanged_transparently(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((403, {"error": "Invalid credentials"}))  # token expired
    server.script.append((200, {"jobId": "job-1", "status": "running"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)

    assert session.report(10) is True
    assert server.tokens_issued == 2

    progress_requests = requests_to(server, "/progress")
    assert progress_requests[0]["json"]["auth"] == {"token": "token-1"}
    assert progress_requests[1]["json"]["auth"] == {"token": "token-2"}


def test_session_from_existing_token_never_touches_the_password_endpoint(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-3", "status": "queued"}))

    session = GameNiteSession(base_url, token="pre-issued-token-abcdef123456")
    session.start("nim", episodes=5, learning_rate=0.1)

    assert requests_to(server, "/api/training/token") == []
    [submit] = requests_to(server, "/api/training/submit")
    assert submit["json"]["auth"] == {"token": "pre-issued-token-abcdef123456"}


def test_complete_and_fail_post_their_payloads(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "completed"}))
    server.script.append((201, {"jobId": "job-9", "status": "queued"}))
    server.script.append((200, {"jobId": "job-9", "status": "failed"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    session.complete(final_metrics={"winRate": 0.9}, message="done")

    [complete_request] = requests_to(server, "/api/training/job-1/complete")
    assert complete_request["json"]["payload"]["finalMetrics"] == {"winRate": 0.9}

    other = make_session(base_url)
    other.start("nim", episodes=10, learning_rate=0.01)
    other.fail("loss diverged")

    [fail_request] = requests_to(server, "/api/training/job-9/fail")
    assert fail_request["json"]["payload"]["error"] == "loss diverged"


def test_http_errors_raise_with_server_message(fake_server):
    server, base_url = fake_server
    server.script.append((404, {"error": "Training session nope not found"}))

    session = GameNiteSession(base_url, token="t" * 32)
    session.job_id = "nope"

    with pytest.raises(GameNiteSessionError, match="not found"):
        session.report(1)


def test_report_before_start_raises(fake_server):
    _, base_url = fake_server
    session = make_session(base_url)
    with pytest.raises(RuntimeError, match="start"):
        session.report(1)


def test_constructor_requires_credentials_or_token(fake_server):
    _, base_url = fake_server
    with pytest.raises(ValueError, match="username/password or a token"):
        GameNiteSession(base_url)


def test_upload_artifact_sends_multipart_with_json_token_auth_field(fake_server, tmp_path):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "hasArtifact": True}))

    pth = tmp_path / "trained.pth"
    pth.write_bytes(b"fake torch weights")

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    info = session.upload_artifact(str(pth))

    assert info["hasArtifact"] is True
    [request] = requests_to(server, "/api/training/job-1/artifact")
    assert request["content_type"].startswith("multipart/form-data")
    assert b'name="auth"' in request["raw"]
    assert b'"token": "token-1"' in request["raw"] or b'"token":"token-1"' in request["raw"]
    assert b'filename="trained.pth"' in request["raw"]
    assert b"fake torch weights" in request["raw"]


def test_get_job_is_a_plain_unauthenticated_get(fake_server):
    server, base_url = fake_server
    server.script.append((200, {
        "jobId": "web-job-7", "gameKey": "nim", "status": "queued",
        "config": {"episodes": 30720, "learningRate": 0.0003,
                   "extra": {"heuristics": {"opponentStyle": "uniform-random"}}},
    }))

    session = GameNiteSession(base_url, token="t" * 32)
    info = session.get_job("web-job-7")

    assert info["gameKey"] == "nim"
    assert info["config"]["episodes"] == 30720
    assert info["config"]["extra"]["heuristics"]["opponentStyle"] == "uniform-random"

    [request] = server.records
    assert request["method"] == "GET"
    assert request["path"] == "/api/training/web-job-7"
    assert request["raw"] == b""               # no body at all
    # Public endpoint: no token exchange, no auth payload anywhere.
    assert server.tokens_issued == 0


def test_get_job_defaults_to_attached_job(fake_server):
    server, base_url = fake_server
    server.script.append((200, {"jobId": "j9", "gameKey": "nim", "status": "queued"}))

    session = GameNiteSession(base_url, token="t" * 32)
    session.attach("j9")
    assert session.get_job()["jobId"] == "j9"
    assert server.records[0]["path"] == "/api/training/j9"


def test_get_job_without_id_raises(fake_server):
    _, base_url = fake_server
    session = GameNiteSession(base_url, token="t" * 32)
    with pytest.raises(RuntimeError, match="job"):
        session.get_job()


def test_get_job_404_raises_with_server_message(fake_server):
    server, base_url = fake_server
    server.script.append((404, {"error": "Training session nope not found"}))

    session = GameNiteSession(base_url, token="t" * 32)
    with pytest.raises(GameNiteSessionError, match="not found"):
        session.get_job("nope")


def test_attach_adopts_a_web_registered_session(fake_server):
    server, base_url = fake_server
    server.script.append((200, {"jobId": "web-job-7", "status": "running"}))

    session = make_session(base_url)
    assert session.attach("web-job-7") == "web-job-7"
    assert session.job_id == "web-job-7"

    assert session.report(5, metrics={"winRate": 0.4}) is True
    [progress] = requests_to(server, "/api/training/web-job-7/progress")
    assert progress["json"]["auth"] == {"token": "token-1"}
    # attach itself makes no requests; the token exchange happens lazily.
    assert len(requests_to(server, "/api/training/token")) == 1
