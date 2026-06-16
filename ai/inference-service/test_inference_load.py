"""
GameNite Arena — Inference Service Load Test (issue #39)
=========================================================
Simulates concurrent AI matches hitting the inference service and validates
latency targets. Run after the service is up with a model loaded.

Usage:
    # Start inference service first:
    #   uvicorn inference_service:app --port 8001
    #
    # Then run this script:
    cd ai/inference-service
    python3 test_inference_load.py

    # Against a deployed Render service:
    python3 test_inference_load.py --base-url https://your-service.onrender.com

Targets (based on measured baseline on local CPU):
    Sequential p95 < 50ms
    Concurrent p95 < 200ms  (10 simultaneous requests)
    Error rate  = 0%
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

BASE_URL = "http://localhost:8001"
DEPLOYMENT_ID = "load-test-nim"
GAME = "nim"
MODEL_ID = "nim_demo"
MOVE_STATE = {"remaining": 7}

# Latency targets (seconds)
SEQ_P95_TARGET = 0.050   # 50ms  — warm sequential
CONC_P95_TARGET = 0.200  # 200ms — 10 concurrent
ERROR_RATE_TARGET = 0.0  # no errors


# ── helpers ───────────────────────────────────────────────────────────────────

def post(url: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def timed_move(base_url: str) -> tuple[float, bool]:
    """Fire one /inference/move and return (latency_s, success)."""
    url = f"{base_url}/inference/move"
    body = {
        "deployment_id": DEPLOYMENT_ID,
        "state": MOVE_STATE,
    }
    t0 = time.perf_counter()
    try:
        post(url, body)
        return time.perf_counter() - t0, True
    except Exception:
        return time.perf_counter() - t0, False


def percentile(data: list[float], p: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * p / 100)
    return sorted_data[min(idx, len(sorted_data) - 1)]


@dataclass
class Result:
    label: str
    latencies: list[float] = field(default_factory=list)
    errors: int = 0

    @property
    def n(self) -> int:
        return len(self.latencies) + self.errors

    @property
    def p50(self) -> float:
        return percentile(self.latencies, 50)

    @property
    def p95(self) -> float:
        return percentile(self.latencies, 95)

    @property
    def p99(self) -> float:
        return percentile(self.latencies, 99)

    @property
    def mean(self) -> float:
        return statistics.mean(self.latencies) if self.latencies else 0.0

    @property
    def error_rate(self) -> float:
        return self.errors / self.n if self.n else 0.0

    def report(self) -> str:
        return (
            f"  n={self.n}  errors={self.errors} ({self.error_rate:.1%})\n"
            f"  mean={self.mean*1000:.1f}ms  "
            f"p50={self.p50*1000:.1f}ms  "
            f"p95={self.p95*1000:.1f}ms  "
            f"p99={self.p99*1000:.1f}ms"
        )


# ── test suites ───────────────────────────────────────────────────────────────

def setup(base_url: str) -> None:
    """Load the model and warm it up with one request."""
    print(f"Setting up against {base_url} ...")
    try:
        post(f"{base_url}/inference/load", {
            "deployment_id": DEPLOYMENT_ID,
            "game": GAME,
            "model_id": MODEL_ID,
        })
    except urllib.error.HTTPError as e:
        if e.code == 422:
            pass  # already loaded or model not found — continue anyway
        else:
            raise
    # warm-up
    timed_move(base_url)
    print("  warm-up done\n")


def test_sequential(base_url: str, n: int = 50) -> Result:
    """n sequential /move requests — validates single-request latency."""
    print(f"Sequential test ({n} requests) ...")
    result = Result("sequential")
    for _ in range(n):
        latency, ok = timed_move(base_url)
        if ok:
            result.latencies.append(latency)
        else:
            result.errors += 1
    print(result.report())
    return result


def test_concurrent(base_url: str, workers: int = 10, n: int = 50) -> Result:
    """n requests fired with `workers` simultaneous threads."""
    print(f"Concurrent test ({n} requests, {workers} workers) ...")
    result = Result("concurrent")
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(timed_move, base_url) for _ in range(n)]
        for f in concurrent.futures.as_completed(futures):
            latency, ok = f.result()
            if ok:
                result.latencies.append(latency)
            else:
                result.errors += 1
    print(result.report())
    return result


def test_sustained(base_url: str, duration_s: float = 10.0,
                   workers: int = 5) -> Result:
    """Sustained load for `duration_s` seconds with `workers` threads."""
    print(f"Sustained test ({duration_s}s, {workers} workers) ...")
    result = Result("sustained")
    deadline = time.perf_counter() + duration_s

    def worker() -> None:
        while time.perf_counter() < deadline:
            latency, ok = timed_move(base_url)
            if ok:
                result.latencies.append(latency)
            else:
                result.errors += 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(worker) for _ in range(workers)]
        concurrent.futures.wait(futures)

    print(result.report())
    return result


# ── assertions ────────────────────────────────────────────────────────────────

def assert_targets(seq: Result, conc: Result) -> None:
    print("\n── Target validation ──")
    passed = True

    checks = [
        (f"Sequential p95 < {SEQ_P95_TARGET*1000:.0f}ms",
         seq.p95 < SEQ_P95_TARGET),
        (f"Concurrent p95 < {CONC_P95_TARGET*1000:.0f}ms",
         conc.p95 < CONC_P95_TARGET),
        (f"Sequential error rate = 0%",
         seq.error_rate == ERROR_RATE_TARGET),
        (f"Concurrent error rate = 0%",
         conc.error_rate == ERROR_RATE_TARGET),
    ]

    for label, ok in checks:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {label}")
        if not ok:
            passed = False

    print()
    if passed:
        print("All targets met.")
    else:
        print("Some targets missed — see report above.")
        raise SystemExit(1)


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    global MODEL_ID
    parser = argparse.ArgumentParser(description="Inference service load test")
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--model-id", default=MODEL_ID)
    parser.add_argument("--sequential-n", type=int, default=50)
    parser.add_argument("--concurrent-workers", type=int, default=10)
    parser.add_argument("--concurrent-n", type=int, default=50)
    parser.add_argument("--sustained-seconds", type=float, default=10.0)
    args = parser.parse_args()

    MODEL_ID = args.model_id

    setup(args.base_url)

    seq = test_sequential(args.base_url, n=args.sequential_n)
    print()
    conc = test_concurrent(args.base_url,
                           workers=args.concurrent_workers,
                           n=args.concurrent_n)
    print()
    test_sustained(args.base_url, duration_s=args.sustained_seconds)

    assert_targets(seq, conc)


if __name__ == "__main__":
    main()
