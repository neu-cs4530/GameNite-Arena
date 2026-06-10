import { beforeEach, describe, expect, it } from "vitest";
import {
  issueTrainingToken,
  checkTrainingAuth,
} from "../../src/services/trainingToken.service.ts";
import { TrainingTokenRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

let user0: UserWithId;

beforeEach(async () => {
  await TrainingTokenRepo.clear();
  user0 = (await getUserByUsername("user0"))!;
});

describe("issueTrainingToken", () => {
  it("returns an opaque token bound to the user with a future expiry", async () => {
    const info = await issueTrainingToken(user0);

    expect(info.username).toBe("user0");
    expect(info.token.length).toBeGreaterThanOrEqual(32);
    expect(Date.parse(info.expiresAt)).toBeGreaterThan(Date.now());

    const stored = await TrainingTokenRepo.get(info.token);
    expect(stored.userId).toBe(user0.userId);
  });

  it("issues a distinct token per call", async () => {
    const a = await issueTrainingToken(user0);
    const b = await issueTrainingToken(user0);
    expect(a.token).not.toBe(b.token);
  });
});

describe("checkTrainingAuth", () => {
  it("resolves password auth exactly like checkAuth", async () => {
    const user = await checkTrainingAuth({ username: "user0", password: "pwd0000" });
    expect(user?.userId).toBe(user0.userId);
    expect(await checkTrainingAuth({ username: "user0", password: "nope" })).toBeNull();
  });

  it("resolves a valid token to its user", async () => {
    const info = await issueTrainingToken(user0);
    const user = await checkTrainingAuth({ token: info.token });
    expect(user?.userId).toBe(user0.userId);
    expect(user?.username).toBe("user0");
  });

  it("rejects unknown tokens", async () => {
    expect(await checkTrainingAuth({ token: "x".repeat(64) })).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const info = await issueTrainingToken(user0);
    const stored = await TrainingTokenRepo.get(info.token);
    stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    await TrainingTokenRepo.set(info.token, stored);

    expect(await checkTrainingAuth({ token: info.token })).toBeNull();
  });
});
