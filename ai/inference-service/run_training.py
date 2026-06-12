"""
GameNite Arena — Guarded Training Entrypoint
============================================
Invoked by trainingWorker.ts as:
    python3 run_training.py <adapter.py> --output <path.pth> --epochs N \
        [--hyperparameters '{...}']

This is the actual sandbox guardrail layer for the Render subprocess approach
(we cannot use per-job Docker on Render). Order matters:
    1. AST-scan the adapter and REJECT dangerous code before importing it.
    2. Apply OS resource limits to THIS process (inherited by anything it runs).
    3. Only then import the adapter and run SB3 training.

These guardrails are defence-in-depth, not perfect isolation. The AST scan is
bypassable in principle (it is a denylist); combined with resource limits, a
wall-clock timeout (enforced by the Node worker), and running as a low-priv user
in a separate Render service, it is the proportionate control for a course MVP.
The residual network-egress gap is documented in the final report.
"""

import argparse
import ast
import json
import os
import resource
import sys

# 1. AST validation

# Modules a training adapter has no legitimate reason to import.
BLOCKED_MODULES = {
    "os", "sys", "subprocess", "socket", "shutil", "ctypes", "signal",
    "multiprocessing", "threading", "importlib", "pickle", "marshal",
    "urllib", "http", "ftplib", "smtplib", "requests", "pty", "fcntl",
}
# Builtins that enable arbitrary execution / filesystem escape.
BLOCKED_CALLS = {"eval", "exec", "compile", "__import__", "open", "input"}


def scan_adapter(path: str) -> None:
    """Raise ValueError if the adapter uses a blocked import or call."""
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()
    tree = ast.parse(source, filename=path)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in BLOCKED_MODULES:
                    raise ValueError(f"Adapter imports blocked module: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in BLOCKED_MODULES:
                raise ValueError(f"Adapter imports blocked module: {node.module}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_CALLS:
                raise ValueError(f"Adapter uses blocked call: {node.func.id}()")
        elif isinstance(node, ast.Attribute):
            # Block introspection escapes (obj.__globals__, cls.__bases__, ...)
            # but allow ordinary dunder *methods* like super().__init__().
            if node.attr in {"__globals__", "__bases__", "__subclasses__",
                             "__mro__", "__dict__", "__class__", "__builtins__"}:
                raise ValueError(f"Adapter accesses introspection attribute: {node.attr}")


# 2. Resource limits

def apply_limits() -> None:
    """Cap CPU time, address space, file size, and process count."""
    def _set(res, soft, hard):
        try:
            resource.setrlimit(res, (soft, hard))
        except (ValueError, OSError):
            pass  # some limits can't be set in every environment; best-effort

    cpu = int(os.environ.get("TRAIN_RLIMIT_CPU_SEC", "540"))      # ~9 min CPU
    mem = int(os.environ.get("TRAIN_RLIMIT_MEM_MB", "2048")) * 1024 * 1024
    fsz = int(os.environ.get("TRAIN_RLIMIT_FSIZE_MB", "256")) * 1024 * 1024
    nproc = int(os.environ.get("TRAIN_RLIMIT_NPROC", "64"))

    _set(resource.RLIMIT_CPU, cpu, cpu)
    _set(resource.RLIMIT_AS, mem, mem)
    _set(resource.RLIMIT_FSIZE, fsz, fsz)
    _set(resource.RLIMIT_NPROC, nproc, nproc)


# 3. Training

def emit(epoch: int, loss: float, win_rate: float, mean_reward: float) -> None:
    """Print one JSON progress line the Node worker parses from stdout."""
    print(json.dumps({
        "epoch": epoch, "loss": loss, "winRate": win_rate, "meanReward": mean_reward,
    }), flush=True)


def run(adapter_path: str, output_path: str, epochs: int, hyperparams: dict) -> None:
    """
    Import the validated adapter and run SB3 training via the TRUSTED base class.

    Per the Sprint 0 contract, the user's file defines a subclass of
    GameNiteAdapter (from base_adapter.py) that only describes the env, reward,
    and obs/action encoding. The SB3 training loop and the .pth save live in the
    trusted base class — so user code never opens files or imports torch itself,
    which is why the AST scan can safely block `open`, `pickle`, etc.

    base_adapter.py is platform code (NOT scanned) and must be importable on
    PYTHONPATH alongside this script.
    """
    import importlib.util as _ilu
    import inspect
    from base_adapter import GameNiteAdapter  # trusted platform base

    spec = _ilu.spec_from_file_location("user_adapter", adapter_path)
    if spec is None or spec.loader is None:
        raise ImportError("Could not load adapter module")
    module = _ilu.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Find the user's GameNiteAdapter subclass.
    subclasses = [
        obj for _, obj in inspect.getmembers(module, inspect.isclass)
        if issubclass(obj, GameNiteAdapter) and obj is not GameNiteAdapter
    ]
    if not subclasses:
        raise AttributeError("Adapter must define a subclass of GameNiteAdapter")

    adapter = subclasses[0]()
    # train() and save() are inherited from the trusted base class.
    model = adapter.train(
        epochs=epochs,
        hyperparams=hyperparams,
        on_epoch=lambda e, m: emit(
            e, m.get("loss", 0.0), m.get("winRate", 0.0), m.get("meanReward", 0.0)
        ),
    )
    adapter.save(model, output_path)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("adapter")
    p.add_argument("--output", required=True)
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--hyperparameters", default="{}")
    args = p.parse_args()

    try:
        scan_adapter(args.adapter)          # reject before importing
        apply_limits()                       # cap resources
        hyperparams = json.loads(args.hyperparameters)
        run(args.adapter, args.output, args.epochs, hyperparams)
    except Exception as e:
        print(f"TRAINING_ERROR: {e}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
