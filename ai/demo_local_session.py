"""
GameNite Arena — Local Training Session DEMO Harness
=====================================================
Fakes a local training run with synthetic metrics so the platform's session
pipeline (register -> live progress -> complete -> artifact) can be shown
end-to-end WITHOUT waiting on a real SB3 run. This is a demo/dev harness, not
a trainer — for actual training, wire GameNiteSession.report() into your
adapter loop the same way (see session_reporter.py docstring).

Demo runbook:
    1. Server up (REDIS_URL + npm run dev), client in real-training mode.
    2. python3 ai/demo_local_session.py --username user0 --password pwd0000 \
           --game nim --episodes 40 --step-delay 1.5
    3. Open the printed /trainer/jobs/<id> URL and watch the run live.
    4. Optional: cancel from the web UI — the next report sees "canceled"
       and this script stops, which is the cancel control channel working.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import tempfile
import time
from pathlib import Path

from session_reporter import GameNiteSession, GameNiteSessionError


def synthetic_metrics(step: int, total: int) -> dict[str, float]:
    """A plausible-looking learning curve: rising winRate, falling loss."""
    t = step / max(total, 1)
    ramp = 1 - math.exp(-3 * t)
    noise = random.uniform(-0.03, 0.03)
    return {
        "winRate": round(min(0.95, max(0.0, 0.30 + 0.60 * ramp + noise)), 4),
        "meanReward": round(-0.5 + 1.2 * ramp + noise, 4),
        "loss": round(max(0.02, 1.0 * math.exp(-2.5 * t) + noise / 3), 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--game", default="nim",
                        choices=["nim", "guess", "checkers", "connect4", "tictactoe"])
    parser.add_argument("--name", default=None, help="Model display name")
    parser.add_argument("--episodes", type=int, default=40,
                        help="Total episodes to simulate")
    parser.add_argument("--steps", type=int, default=20,
                        help="Number of progress reports to send")
    parser.add_argument("--step-delay", type=float, default=1.5,
                        help="Seconds between reports (1.5-2.0 demos well)")
    parser.add_argument("--upload-artifact", action="store_true",
                        help="Upload a placeholder .pth on completion")
    args = parser.parse_args()

    session = GameNiteSession(args.base_url, args.username, args.password)
    name = args.name or f"{args.game}-local-demo"

    job_id = session.start(args.game, episodes=args.episodes,
                           learning_rate=3e-4, model_display_name=name)
    print(f"[demo] session registered: {job_id}")
    print(f"[demo] watch it live at {args.base_url.replace(':8000', ':4530')}"
          f"/trainer/jobs/{job_id}")

    metrics: dict[str, float] = {}
    for step in range(1, args.steps + 1):
        episodes_done = round(args.episodes * step / args.steps)
        metrics = synthetic_metrics(step, args.steps)
        keep_going = session.report(
            episodes_done, metrics=metrics,
            message=f"episode {episodes_done}/{args.episodes}",
        )
        print(f"[demo] {episodes_done}/{args.episodes} {metrics}")
        if not keep_going:
            print("[demo] server says canceled — stopping the local loop")
            return 0
        time.sleep(args.step_delay)

    session.complete(final_metrics=metrics, message="Local training finished")
    print("[demo] completed")

    if args.upload_artifact:
        with tempfile.NamedTemporaryFile(suffix=".pth", delete=False) as handle:
            handle.write(b"GameNite demo artifact (not a real torch model)")
            placeholder = Path(handle.name)
        info = session.upload_artifact(str(placeholder))
        placeholder.unlink()
        print(f"[demo] artifact uploaded, hasArtifact={info.get('hasArtifact')}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GameNiteSessionError as exc:
        print(f"[demo] platform error: {exc}", file=sys.stderr)
        sys.exit(1)
