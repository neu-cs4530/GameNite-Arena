"""Regression guard for the training-kit ModuleNotFoundError.

The distributed kit (GET /api/training/kit/install.sh) is FLAT — every adapter
lands at the top level next to train.py, with no `adapter/` package (see
server/src/services/trainingKit.service.ts, where each adapter's kit `name`
has no directory). So train.py must import adapters as
`from example_<game>_adapter import ...`, NEVER `from adapter.example_...`,
which only resolves against the repo's `ai/adapter/` package and raises
`ModuleNotFoundError: No module named 'adapter'` in the kit.

Bug history: commit a9e35e3 ("add multi-game trainers") introduced the
package-style imports for connect4/tictactoe/checkers, breaking those games in
the kit while nim (flat import) kept working.
"""

import ast
import pathlib

TRAIN_PY = pathlib.Path(__file__).resolve().parents[1] / "train.py"


def test_train_uses_flat_adapter_imports_only() -> None:
    tree = ast.parse(TRAIN_PY.read_text())
    package_imports = [
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
        and node.module is not None
        and node.module.startswith("adapter.")
    ]
    assert package_imports == [], (
        "train.py must import adapters flat (the kit has no `adapter/` package); "
        f"found package-style imports: {package_imports}"
    )
