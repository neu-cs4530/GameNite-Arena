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
    name: "train.py",
    relPath: "train.py",
    description:
      "The trainer CLI (kit entrypoint): real chunked PPO, live reporting, artifact upload",
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
 * One-shot bootstrap script: fetches every kit file into a fresh directory,
 * builds a venv with the pinned requirements, and either hands off straight
 * into an attached training run or prints the next steps. Served at
 * GET /api/training/kit/install.sh so onboarding is a single line:
 *
 *   curl -fsSL <base>/api/training/kit/install.sh | sh
 *   curl -fsSL <base>/api/training/kit/install.sh | sh -s -- --job-id <id> --token <tkn>
 */
export function buildInstallScript(baseUrl: string): string {
  const fetches = getKitManifest()
    .files.map((f) => `curl -fsSL "$BASE/api/training/kit/${f.name}" -o "${f.name}"`)
    .join("\n");

  return `#!/bin/sh
# GameNite Arena - local training kit bootstrap
# Usage: curl -fsSL ${baseUrl}/api/training/kit/install.sh | sh
#        curl -fsSL ${baseUrl}/api/training/kit/install.sh | sh -s -- --job-id <id> --token <tkn>
set -e

BASE="\${GAMENITE_URL:-${baseUrl}}"
KIT_DIR="gamenite-training-kit"
JOB_ID=""
TOKEN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --job-id)
      [ $# -ge 2 ] || { echo "Missing value for --job-id" >&2; exit 1; }
      JOB_ID="$2"; shift 2 ;;
    --token)
      [ $# -ge 2 ] || { echo "Missing value for --token" >&2; exit 1; }
      TOKEN="$2"; shift 2 ;;
    *)
      echo "Unknown option: $1 (supported: --job-id <id>, --token <tkn>)" >&2
      exit 1 ;;
  esac
done

mkdir -p "$KIT_DIR"
cd "$KIT_DIR"

${fetches}

python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

if [ -n "$JOB_ID" ]; then
  echo ""
  echo "Kit ready - attaching to training run $JOB_ID"
  GAMENITE_TOKEN="$TOKEN" exec .venv/bin/python train.py --base-url "$BASE" --job-id "$JOB_ID"
fi

echo ""
echo "GameNite training kit ready in ./$KIT_DIR"
echo ""
echo "Next steps (all from inside ./$KIT_DIR - the kit is flat, no subfolders):"
echo "  1. Attach to a run registered on the web (the job page shows your --job-id):"
echo "     .venv/bin/python train.py --base-url $BASE --job-id <id> --token <tkn>"
echo "  2. Or self-register a run from the CLI:"
echo "     .venv/bin/python train.py --base-url $BASE --game nim --username <you> --password <pwd>"
echo "  3. Wire session_reporter.py into your own adapter loop (see its docstring)."
`;
}
