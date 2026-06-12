import { describe, expect, it } from "vitest";
import {
  buildBootstrapCommand,
  buildKitRunCommand,
  buildTokenMintCommand,
  shellQuote,
} from "./trainerCommand.ts";

/**
 * The connect-your-trainer card hands users a command to paste into a
 * shell, so every interpolated value (job id, token, username) must come
 * out shell-safe. Job ids and tokens are server-minted and normally tame,
 * but the builder cannot rely on that.
 */

describe("shellQuote", () => {
  it("passes plain identifier-ish values through unquoted", () => {
    expect(shellQuote("job-123")).toBe("job-123");
    expect(shellQuote("a.b_c:d-e")).toBe("a.b_c:d-e");
  });

  it("single-quotes anything with shell metacharacters", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("$(rm -rf /)")).toBe("'$(rm -rf /)'");
    expect(shellQuote("a;b|c")).toBe("'a;b|c'");
  });

  it("escapes embedded single quotes the POSIX way", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes the empty string rather than vanishing", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("buildBootstrapCommand", () => {
  it("builds the documented curl-pipe-sh one-liner", () => {
    expect(buildBootstrapCommand("https://arena.example", "job-1", "tkn_abc")).toBe(
      "curl -fsSL https://arena.example/api/training/kit/install.sh | sh -s -- --job-id job-1 --token tkn_abc",
    );
  });

  it("shell-quotes hostile ids and tokens", () => {
    expect(buildBootstrapCommand("http://localhost:4530", "job 1", "t;k")).toBe(
      "curl -fsSL http://localhost:4530/api/training/kit/install.sh | sh -s -- --job-id 'job 1' --token 't;k'",
    );
  });
});

describe("buildKitRunCommand", () => {
  it("builds the already-have-the-kit attach command", () => {
    expect(buildKitRunCommand("job-1", "tkn_abc")).toBe(
      ".venv/bin/python train.py --job-id job-1 --token tkn_abc",
    );
  });

  it("quotes where needed", () => {
    expect(buildKitRunCommand("job 1", "tok'en")).toBe(
      ".venv/bin/python train.py --job-id 'job 1' --token 'tok'\\''en'",
    );
  });
});

describe("buildTokenMintCommand (manual fallback)", () => {
  it("mints against the token endpoint with the username baked in", () => {
    const cmd = buildTokenMintCommand("https://arena.example", "zara");
    expect(cmd).toBe(
      "curl -fsS -X POST https://arena.example/api/training/token " +
        "-H 'Content-Type: application/json' " +
        `-d '{"auth":{"username":"zara","password":"YOUR_PASSWORD"},"payload":{}}'`,
    );
  });

  it("JSON-escapes and shell-quotes a hostile username", () => {
    const cmd = buildTokenMintCommand("https://a.example", 'za"ra');
    // JSON escaping turns the quote into \" and the whole -d body stays
    // inside one single-quoted shell word.
    expect(cmd).toContain(`-d '{"auth":{"username":"za\\"ra","password":"YOUR_PASSWORD"}`);
  });
});
