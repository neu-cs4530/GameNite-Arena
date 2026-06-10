/**
 * server/src/services/trainingToken.service.ts
 * ==============================================
 * Expiring API tokens for the LOCAL training channel.
 *
 * The local trainer exchanges its password exactly once
 * (POST /api/training/token) and then authenticates every session call with
 * the opaque token — the password stays out of training loops, process
 * lists, and shell history, and a leaked token dies on its own after the
 * TTL. Web-UI calls may keep sending username/password; every training
 * route accepts either shape via checkTrainingAuth().
 *
 * Tokens are random 256-bit hex strings keyed directly in TrainingTokenRepo
 * for O(1) lookup. The Repo interface has no delete, so expired records are
 * simply ignored at auth time and age out with the store.
 */

import { randomBytes } from "node:crypto";
import type { TrainingAuth, TrainingTokenInfo } from "@gamenite/shared";
import { TrainingTokenRepo } from "../repository.ts";
import { checkAuth } from "./auth.service.ts";
import type { UserWithId } from "../types.ts";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // one day — longer than any training run

/** Mint a fresh token for an already-authenticated user. */
export async function issueTrainingToken(user: UserWithId): Promise<TrainingTokenInfo> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString();

  await TrainingTokenRepo.set(token, {
    userId: user.userId,
    username: user.username,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  });

  return { token, username: user.username, expiresAt };
}

/**
 * Resolve either auth shape to a user: token -> stored, unexpired token
 * record; username/password -> the regular checkAuth path.
 */
export async function checkTrainingAuth(auth: TrainingAuth): Promise<UserWithId | null> {
  if ("token" in auth) {
    const record = await TrainingTokenRepo.find(auth.token);
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= Date.now()) return null;
    return { userId: record.userId, username: record.username };
  }
  return checkAuth(auth);
}
