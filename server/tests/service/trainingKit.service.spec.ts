import { describe, expect, it } from "vitest";
import {
  buildInstallScript,
  getKitManifest,
  getKitFilePath,
} from "../../src/services/trainingKit.service.ts";

/* ---------------------------------------------------------------------------
 * The training kit is the platform-distributed set of files a user needs to
 * train locally. train.py is the single entrypoint; the bootstrap script must
 * set up a venv and either hand off straight into an attached run
 * (`sh -s -- --job-id <id> --token <tkn>`) or print the next-step commands.
 * ------------------------------------------------------------------------- */

const BASE = "http://localhost:8000";

describe("getKitManifest", () => {
  it("ships train.py as the kit entrypoint", () => {
    const names = getKitManifest().files.map((f) => f.name);
    expect(names).toContain("train.py");
  });

  it("keeps the adapter SDK, reporter, and requirements", () => {
    const names = getKitManifest().files.map((f) => f.name);
    for (const required of [
      "session_reporter.py",
      "base_adapter.py",
      "requirements.txt",
      "example_nim_adapter.py",
      "example_tictactoe_adapter.py",
      "example_connect4_adapter.py",
      "example_checkers_adapter.py",
      "example_numguesser_adapter.py",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("no longer ships the demo or the superseded example trainer", () => {
    const names = getKitManifest().files.map((f) => f.name);
    expect(names).not.toContain("demo_local_session.py");
    expect(names).not.toContain("example_local_training_nim.py");
    expect(getKitFilePath("demo_local_session.py")).toBeNull();
    expect(getKitFilePath("example_local_training_nim.py")).toBeNull();
  });
});

describe("buildInstallScript", () => {
  const script = () => buildInstallScript(BASE);

  it("is POSIX sh with set -e", () => {
    expect(script().startsWith("#!/bin/sh\n")).toBe(true);
    expect(script()).toContain("set -e");
    // No bashisms in the flow control we generate.
    expect(script()).not.toContain("[[");
  });

  it("fetches every manifest file, including train.py", () => {
    const text = script();
    for (const f of getKitManifest().files) {
      expect(text).toContain(`/api/training/kit/${f.name}`);
    }
    expect(text).toContain("train.py");
  });

  it("parses --job-id and --token arguments passed after sh -s --", () => {
    const text = script();
    expect(text).toContain("--job-id");
    expect(text).toContain("--token");
    expect(text).toContain("JOB_ID=");
    expect(text).toContain("TOKEN=");
  });

  it("creates a venv and installs the pinned requirements into it", () => {
    const text = script();
    expect(text).toContain("python3 -m venv .venv");
    expect(text).toContain(".venv/bin/pip install -q -r requirements.txt");
  });

  it("hands off into train.py when a job id was given", () => {
    const text = script();
    expect(text).toContain('GAMENITE_TOKEN="$TOKEN" exec .venv/bin/python train.py');
    expect(text).toContain('--job-id "$JOB_ID"');
    expect(text).toContain('--base-url "$BASE"');
  });

  it("prints train.py next steps when no job id was given", () => {
    const text = script();
    // The no-args branch tells the user how to run the trainer themselves.
    expect(text).toMatch(/train\.py --base-url/);
    expect(text).toContain("--job-id <id>");
    // The deleted scripts are gone from the guidance too.
    expect(text).not.toContain("demo_local_session.py");
    expect(text).not.toContain("example_local_training_nim.py");
  });

  it("embeds the request's base url", () => {
    expect(buildInstallScript("https://arena.example.com")).toContain("https://arena.example.com");
  });
});
