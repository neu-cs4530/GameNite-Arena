/**
 * server/src/services/trainingKit.service.ts
 * =============================================
 * The platform distributes its own local-training kit: the files a user
 * needs on their machine to train a model and stream the run back to
 * GameNite Arena. Serving them from the server (instead of "go find the
 * repo") keeps every user and teammate on the same, current contract — one
 * curl gets you a working setup.
 *
 * Only the exact names in KIT_FILES are served; everything else 404s, so
 * the file route cannot be used to read arbitrary paths.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Repo's ai/ directory, resolved from this file so cwd never matters. */
const AI_DIR = path.resolve(import.meta.dirname, "../../../ai");

interface KitFile {
  /** Public download name (flat — the kit lands in one directory). */
  name: string;
  /** Path relative to ai/. */
  relPath: string;
  description: string;
}

const KIT_FILES: KitFile[] = [
  {
    name: "session_reporter.py",
    relPath: "session_reporter.py",
    description: "HTTP client your training loop uses to stream the run to GameNite",
  },
  {
    name: "base_adapter.py",
    relPath: "base_adapter.py",
    description: "GameNiteAdapter base class (SB3 PPO loop, .pth serialization)",
  },
  {
    name: "example_local_training_nim.py",
    relPath: "example_local_training_nim.py",
    description: "REAL end-to-end run: SB3 training + live reporting + artifact upload",
  },
  {
    name: "demo_local_session.py",
    relPath: "demo_local_session.py",
    description: "Fake run with synthetic metrics — verify your setup end to end",
  },
  {
    name: "requirements.txt",
    relPath: "requirements.txt",
    description: "Python dependencies for the adapter SDK",
  },
  {
    name: "example_nim_adapter.py",
    relPath: "adapter/example_nim_adapter.py",
    description: "Reference adapter: Nim",
  },
  {
    name: "example_tictactoe_adapter.py",
    relPath: "adapter/example_tictactoe_adapter.py",
    description: "Reference adapter: Tic-Tac-Toe",
  },
  {
    name: "example_connect4_adapter.py",
    relPath: "adapter/example_connect4_adapter.py",
    description: "Reference adapter: Connect 4",
  },
  {
    name: "example_checkers_adapter.py",
    relPath: "adapter/example_checkers_adapter.py",
    description: "Reference adapter: Checkers",
  },
  {
    name: "example_numguesser_adapter.py",
    relPath: "adapter/example_numguesser_adapter.py",
    description: "Reference adapter: Number Guesser",
  },
];

export interface KitManifest {
  files: { name: string; description: string }[];
}

/** The downloadable-file listing shown by GET /api/training/kit. */
export function getKitManifest(): KitManifest {
  return {
    files: KIT_FILES.filter((f) => fs.existsSync(path.join(AI_DIR, f.relPath))).map((f) => ({
      name: f.name,
      description: f.description,
    })),
  };
}

/** Absolute path for a whitelisted kit file, or null for anything else. */
export function getKitFilePath(name: string): string | null {
  const file = KIT_FILES.find((f) => f.name === name);
  if (!file) return null;
  const absolute = path.join(AI_DIR, file.relPath);
  return fs.existsSync(absolute) ? absolute : null;
}

/**
 * One-shot bootstrap script: fetches every kit file into a fresh directory
 * and prints the next steps. Served at GET /api/training/kit/install.sh so
 * onboarding is a single copy-pasteable line.
 */
export function buildInstallScript(baseUrl: string): string {
  const fetches = getKitManifest()
    .files.map((f) => `curl -fsSL "$BASE/api/training/kit/${f.name}" -o "${f.name}"`)
    .join("\n");

  return `#!/bin/sh
# GameNite Arena - local training kit bootstrap
# Usage: curl -fsSL ${baseUrl}/api/training/kit/install.sh | sh
set -e

BASE="\${GAMENITE_URL:-${baseUrl}}"
KIT_DIR="gamenite-training-kit"

mkdir -p "$KIT_DIR"
cd "$KIT_DIR"

${fetches}

echo ""
echo "GameNite training kit ready in ./$KIT_DIR"
echo ""
echo "Next steps (all from inside ./$KIT_DIR — the kit is flat, no subfolders):"
echo "  1. cd $KIT_DIR && python3 -m pip install -r requirements.txt"
echo "  2. Real training run (SB3 PPO on Nim, streams live to the dashboard):"
echo "     python3 example_local_training_nim.py --base-url $BASE --username <you> --password <pwd>"
echo "     (append --job-id <id> to attach to a run registered on the web)"
echo "  3. Optional smoke test with synthetic metrics, no learning:"
echo "     python3 demo_local_session.py --base-url $BASE --username <you> --password <pwd>"
echo "  4. Wire session_reporter.py into your own adapter loop (see its docstring)."
`;
}
