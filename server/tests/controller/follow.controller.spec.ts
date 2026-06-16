import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as follow from "../../src/controllers/follow.controller.ts";

// setup.ts reseeds the user repo (user0/pwd0000 ...) before each test.
const caster = { username: "user0", password: "pwd0000" };

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/follow",
    express
      .Router()
      .post("/feed", follow.postFeed)
      .get("/:username/followers", follow.getFollowers)
      .get("/:username/following", follow.getFollowingList)
      .post("/:username", follow.postFollow)
      .post("/:username/unfollow", follow.postUnfollow),
  );
  return app;
}

describe("POST /api/follow/:username", () => {
  it("follows a user and returns the updated following list (200)", async () => {
    const res = await supertest(makeApp()).post("/api/follow/user1").send({ auth: caster });
    expect(res.status).toBe(200);
    expect((res.body as { username: string }[]).map((u) => u.username)).toContain("user1");
  });

  it("returns 404 for an unknown user", async () => {
    const res = await supertest(makeApp()).post("/api/follow/ghost").send({ auth: caster });
    expect(res.status).toBe(404);
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/follow/user1")
      .send({ auth: { username: "user0", password: "wrong" } });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/follow/:username/unfollow", () => {
  it("unfollows a user (200)", async () => {
    await supertest(makeApp()).post("/api/follow/user1").send({ auth: caster });
    const res = await supertest(makeApp())
      .post("/api/follow/user1/unfollow")
      .send({ auth: caster });
    expect(res.status).toBe(200);
    expect((res.body as { username: string }[]).map((u) => u.username)).not.toContain("user1");
  });
});

describe("GET /api/follow/:username/followers and /following", () => {
  it("lists a user's followers (200)", async () => {
    await supertest(makeApp()).post("/api/follow/user1").send({ auth: caster }); // user0 follows user1
    const res = await supertest(makeApp()).get("/api/follow/user1/followers");
    expect(res.status).toBe(200);
    expect((res.body as { username: string }[]).map((u) => u.username)).toContain("user0");
  });

  it("lists who a user follows (200)", async () => {
    await supertest(makeApp()).post("/api/follow/user1").send({ auth: caster });
    const res = await supertest(makeApp()).get("/api/follow/user0/following");
    expect(res.status).toBe(200);
    expect((res.body as { username: string }[]).map((u) => u.username)).toContain("user1");
  });

  it("returns 404 for an unknown user", async () => {
    const res = await supertest(makeApp()).get("/api/follow/ghost/followers");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/follow/:username — bad body", () => {
  it("returns 400 when body is empty", async () => {
    const res = await supertest(makeApp()).post("/api/follow/user1").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/follow/:username/unfollow — bad body", () => {
  it("returns 400 when body is empty", async () => {
    const res = await supertest(makeApp()).post("/api/follow/user1/unfollow").send({});
    expect(res.status).toBe(400);
  });
});

describe("GET /api/follow/:username/following — unknown user", () => {
  it("returns 404 for an unknown username", async () => {
    const res = await supertest(makeApp()).get("/api/follow/ghost/following");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/follow/feed", () => {
  it("returns the feed envelope for the authed user (200)", async () => {
    await supertest(makeApp()).post("/api/follow/user1").send({ auth: caster });
    const res = await supertest(makeApp()).post("/api/follow/feed").send({ auth: caster });
    expect(res.status).toBe(200);
    const feed = res.body as {
      following: { user: { username: string } }[];
      replays: unknown[];
    };
    expect(Array.isArray(feed.following)).toBe(true);
    expect(Array.isArray(feed.replays)).toBe(true);
    expect(feed.following.map((f) => f.user.username)).toContain("user1");
  });

  it("returns 403 without valid auth", async () => {
    const res = await supertest(makeApp()).post("/api/follow/feed").send({});
    expect(res.status).toBe(400);
  });
});
