"""
GameNite Arena — Unit Tests: Local Training Session Reporter
=============================================================
Covers the stdlib HTTP client the local training loop uses to talk to the
platform (ai/session_reporter.py):

  - start()  registers the session and stores the job id
  - report() posts progress and returns False once the server says canceled
  - complete()/fail() hit the terminal endpoints
  - upload_artifact() sends multipart with a JSON-string auth field
  - non-2xx responses raise with the server's error message

The fake server is a recording stdlib ThreadingHTTPServer — no torch, no
network beyond loopback, no GameNite server needed.

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
    """Records every request; answers from the server's scripted queue."""

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

        if self.server.script:
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
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    yield server, base_url
    server.shutdown()
    thread.join(timeout=2)


def make_session(base_url):
    return GameNiteSession(base_url, AUTH["username"], AUTH["password"])


def test_start_posts_auth_and_payload_and_stores_job_id(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))

    session = make_session(base_url)
    job_id = session.start("nim", episodes=100, learning_rate=0.001,
                           model_display_name="my-nim-bot")

    assert job_id == "job-1"
    assert session.job_id == "job-1"

    [request] = server.records
    assert request["method"] == "POST"
    assert request["path"] == "/api/training/submit"
    assert request["json"]["auth"] == AUTH
    payload = request["json"]["payload"]
    assert payload["gameKey"] == "nim"
    assert payload["modelDisplayName"] == "my-nim-bot"
    assert payload["config"] == {"episodes": 100, "learningRate": 0.001}


def test_start_with_existing_model_id(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-2", "status": "queued"}))

    session = make_session(base_url)
    session.start("connect4", episodes=10, learning_rate=0.1, model_id="model-7")

    payload = server.records[0]["json"]["payload"]
    assert payload["modelId"] == "model-7"
    assert "modelDisplayName" not in payload


def test_report_returns_true_while_running(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "running"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    keep_going = session.report(50, metrics={"winRate": 0.5, "meanReward": 0.2},
                                message="ep 50")

    assert keep_going is True
    request = server.records[1]
    assert request["path"] == "/api/training/job-1/progress"
    assert request["json"]["payload"]["episodes"] == 50
    assert request["json"]["payload"]["metrics"] == {"winRate": 0.5, "meanReward": 0.2}
    assert request["json"]["payload"]["message"] == "ep 50"


def test_report_returns_false_when_server_says_canceled(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "canceled"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)

    assert session.report(60) is False


def test_complete_and_fail_post_their_payloads(fake_server):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "status": "completed"}))
    server.script.append((201, {"jobId": "job-9", "status": "queued"}))
    server.script.append((200, {"jobId": "job-9", "status": "failed"}))

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    session.complete(final_metrics={"winRate": 0.9}, message="done")

    complete_request = server.records[1]
    assert complete_request["path"] == "/api/training/job-1/complete"
    assert complete_request["json"]["payload"]["finalMetrics"] == {"winRate": 0.9}

    other = make_session(base_url)
    other.start("nim", episodes=10, learning_rate=0.01)
    other.fail("loss diverged")

    fail_request = server.records[3]
    assert fail_request["path"] == "/api/training/job-9/fail"
    assert fail_request["json"]["payload"]["error"] == "loss diverged"


def test_http_errors_raise_with_server_message(fake_server):
    server, base_url = fake_server
    server.script.append((404, {"error": "Training session nope not found"}))

    session = make_session(base_url)
    session.job_id = "nope"

    with pytest.raises(GameNiteSessionError, match="not found"):
        session.report(1)


def test_report_before_start_raises(fake_server):
    _, base_url = fake_server
    session = make_session(base_url)
    with pytest.raises(RuntimeError, match="start"):
        session.report(1)


def test_upload_artifact_sends_multipart_with_json_auth_field(fake_server, tmp_path):
    server, base_url = fake_server
    server.script.append((201, {"jobId": "job-1", "status": "queued"}))
    server.script.append((200, {"jobId": "job-1", "hasArtifact": True}))

    pth = tmp_path / "trained.pth"
    pth.write_bytes(b"fake torch weights")

    session = make_session(base_url)
    session.start("nim", episodes=100, learning_rate=0.001)
    info = session.upload_artifact(str(pth))

    assert info["hasArtifact"] is True
    request = server.records[1]
    assert request["path"] == "/api/training/job-1/artifact"
    assert request["content_type"].startswith("multipart/form-data")
    assert b'name="auth"' in request["raw"]
    assert json.dumps(AUTH).encode() in request["raw"] or \
        json.dumps(AUTH, separators=(",", ":")).encode() in request["raw"]
    assert b'filename="trained.pth"' in request["raw"]
    assert b"fake torch weights" in request["raw"]
