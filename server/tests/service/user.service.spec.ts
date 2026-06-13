import { beforeEach, describe, expect, it } from "vitest";
import { populateSafeUserInfo, updateUser } from "../../src/services/user.service.ts";
import { enforceAuth, getUserByUsername } from "../../src/services/auth.service.ts";
import { DeploymentRepo } from "../../src/repository.ts";

// enforceAuth isn't tested by current integration tests,
// because existing tests exercise the REST api, and enforceAuth
// is only used in the socket api
describe("enforceAuth", () => {
  it("should return a user and id on good auth", async () => {
    const user = await enforceAuth({ username: "user1", password: "pwd1111" });
    expect(user).toStrictEqual({ userId: expect.any(String), username: "user1" });
  });

  it("should raise on bad auth", async () => {
    await expect(enforceAuth({ username: "user1", password: "no" })).rejects.toThrow();
  });
});

// updateUser can't be fully tested by current integration tests; part of its
// contract is that it throws if updateUser is called with an invalid user id,
// but a well-behaved controller won't ever invoke updateUser with an invalid
// user id
describe("updateUser", () => {
  it("should throw if given an invalid user id", async () => {
    await expect(updateUser("fake", { display: "Stacey Fakename" })).rejects.toThrow();
  });
});

// AI seats store their deployment id where a user id would go (Story 2.6),
// so the safe-info populater must render them as synthetic users instead of
// failing the user lookup.
describe("populateSafeUserInfo", () => {
  beforeEach(async () => {
    await DeploymentRepo.clear();
  });

  it("renders a human user without the isAi flag", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const info = await populateSafeUserInfo(user1.userId);
    expect(info).toStrictEqual({
      username: "user1",
      display: "Yāo",
      createdAt: expect.any(Date),
    });
  });

  it("renders an AI seat from its deployment record", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const createdAt = "2026-06-01T12:00:00.000Z";
    const deploymentId = await DeploymentRepo.add({
      modelId: "model-7",
      userId: user1.userId,
      gameKey: "nim",
      displayName: "SeatBot",
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });

    const info = await populateSafeUserInfo(deploymentId);
    expect(info).toStrictEqual({
      username: deploymentId,
      display: "SeatBot",
      createdAt: new Date(createdAt),
      isAi: true,
    });
  });

  it("still throws for an id that is neither a user nor a deployment", async () => {
    await expect(populateSafeUserInfo("no-such-id")).rejects.toThrow(/no-such-id/);
  });
});
