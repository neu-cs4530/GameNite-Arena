/**
 * server/src/services/inferenceAuth.ts
 * =====================================
 * Shared-token gate for the machine-to-machine inference endpoints that the
 * self-hosted Python box calls (e.g. GET /api/inference/artifact/:modelId).
 *
 * This is NOT the user body-auth (`withAuth` / checkAuth). The box has no user
 * session — it authenticates with a single shared secret carried in the
 * standard Authorization header:
 *
 *     Authorization: Bearer <INFERENCE_SHARED_TOKEN>
 *
 * FAIL-CLOSED contract: if INFERENCE_SHARED_TOKEN is unset or empty the gate
 * returns 503 and never serves the request — a missing secret must never
 * degrade into allow-all. A wrong or missing token is 401.
 *
 * The token is never logged; only coarse outcomes (missing-config / rejected)
 * reach the caller.
 */

import { timingSafeEqual } from "node:crypto";
import { type RequestHandler } from "express";

/** The configured shared token, or undefined when unset/empty (fail-closed). */
export function inferenceSharedToken(): string | undefined {
  const token = process.env["INFERENCE_SHARED_TOKEN"];
  return token === undefined || token === "" ? undefined : token;
}

/**
 * Constant-time token comparison so a network attacker can't recover the token
 * byte-by-byte from response timing. A length mismatch short-circuits to false
 * (the only thing it leaks is "wrong length", harmless for a fixed-size token).
 */
function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parse the bearer credential out of an Authorization header value. */
function bearerCredential(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1];
}

/**
 * Express middleware enforcing the shared-token gate.
 *   - INFERENCE_SHARED_TOKEN unset/empty  -> 503 (fail closed)
 *   - missing / malformed / wrong token   -> 401
 *   - exact match                          -> next()
 */
export const requireInferenceToken: RequestHandler = (req, res, next) => {
  const expected = inferenceSharedToken();
  if (expected === undefined) {
    res.status(503).send({ error: "Inference shared token is not configured" });
    return;
  }
  const presented = bearerCredential(req.header("Authorization"));
  if (presented === undefined || !tokensMatch(presented, expected)) {
    res.status(401).send({ error: "Invalid inference token" });
    return;
  }
  next();
};
