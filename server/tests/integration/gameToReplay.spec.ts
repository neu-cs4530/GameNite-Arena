import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { createGame, joinGame, startGame, updateGame } from "../../src/services/game.service.ts";
import { matchRecorder } from "../../src/services/matchRecorder.service.ts";
import { getReplay, listReplays } from "../../src/services/replay.service.ts";
import { GameRepo, MatchRepo, UserRepo } from "../../src/repository.ts";
import * as replay from "../../src/controllers/replay.controller.ts";

/* ---------------------------------------------------------------------------
 * End-to-end pipeline test: play a real game of nim through game.service,
 * then assert the finished match comes back through the replay service and
 * the /api/replay HTTP endpoints. This is the test that closes the wiring
 * gap previously documented as it.todo() markers in replay.controller.spec.
 *
 * Uses the PRODUCTION replay store (no replaceStoreForTests) so the
 * composite Keyv-first read path is what's being exercised.
 * ----------------------------------------------------------------------- */

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/replay",
    express
      .Router()
      .get("/list", replay.getList)
      .get("/:matchId", replay.getById)
      .post("/:matchId/view", replay.postView),
  );
  return app;
}

/**
 * Plays a full game of nim (21 objects, alternating take-3) and returns the
 * gameId plus both players. 7 moves total; the 7th flips done.
 */
async function playFullNimGame() {
  const user0 = (await getUserByUsername("user0"))!;
  const user1 = (await getUserByUsername("user1"))!;

  const game = await createGame(user0, "nim", new Date());
  const gameId = game.gameId;
  await joinGame(gameId, user1);
  await startGame(gameId, user0);

  const turnOrder = [user0, user1];
  for (let i = 0; i < 7; i++) {
    await updateGame(gameId, turnOrder[i % 2], 3);
  }
  return { gameId, user0, user1 };
}

describe("gameplay → replay pipeline", () => {
  it("starts recording on the first accepted move", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const game = await createGame(user0, "nim", new Date());
    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);

    expect(matchRecorder.isRecording(game.gameId)).toBe(false);
    await updateGame(game.gameId, user0, 3);
    expect(matchRecorder.isRecording(game.gameId)).toBe(true);
    // Not done yet — nothing persisted.
    expect(await MatchRepo.find(game.gameId)).toBeNull();
  });

  it("does not capture rejected moves", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const game = await createGame(user0, "nim", new Date());
    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);

    // Out-of-range move and out-of-turn move both throw before capture.
    await expect(updateGame(game.gameId, user0, 5)).rejects.toThrow(/invalid move/);
    await expect(updateGame(game.gameId, user1, 3)).rejects.toThrow(/invalid move/);
    expect(matchRecorder.isRecording(game.gameId)).toBe(false);
  });

  it("captures every accepted move and persists exactly once when done flips", async () => {
    const { gameId, user0, user1 } = await playFullNimGame();

    expect(matchRecorder.isRecording(gameId)).toBe(false);
    const stored = await MatchRepo.find(gameId);
    expect(stored).not.toBeNull();
    expect(stored!.gameKey).toBe("nim");
    expect(stored!.moves).toHaveLength(7);
    expect(stored!.moves.map((m) => m.actor)).toEqual([
      user0.userId,
      user1.userId,
      user0.userId,
      user1.userId,
      user0.userId,
      user1.userId,
      user0.userId,
    ]);
    expect(stored!.moves.every((m) => m.move === 3)).toBe(true);
    // Pre-first-move state is archived so replays can rebuild from move 0.
    expect(stored!.initialState).toEqual({ remaining: 21, nextPlayer: 0 });

    // Participants carry resolved display names from UserRepo.
    const display0 = (await UserRepo.get(user0.userId)).display;
    const display1 = (await UserRepo.get(user1.userId)).display;
    expect(stored!.participants).toEqual([
      { id: user0.userId, type: "human", displayName: display0 },
      { id: user1.userId, type: "human", displayName: display1 },
    ]);

    // models.ts contract: the finished GameRecord points at its MatchRecord.
    expect((await GameRepo.get(gameId)).matchId).toBe(gameId);
  });

  it("archives exactly one final move when the last move is double-submitted concurrently", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const game = await createGame(user0, "nim", new Date());
    const gameId = game.gameId;
    await joinGame(gameId, user1);
    await startGame(gameId, user0);

    const turnOrder = [user0, user1];
    for (let i = 0; i < 6; i++) {
      await updateGame(gameId, turnOrder[i % 2], 3);
    }
    // Double-submit the winning move (client double-click / retry). Both
    // calls may pass validation against stale state; the archive must still
    // contain exactly 7 moves.
    await Promise.allSettled([updateGame(gameId, user0, 3), updateGame(gameId, user0, 3)]);

    const stored = await MatchRepo.find(gameId);
    expect(stored).not.toBeNull();
    expect(stored!.moves).toHaveLength(7);
  });

  it("serves the finished game through the replay service detail read", async () => {
    const { gameId } = await playFullNimGame();

    const detail = await getReplay(gameId);
    expect(detail).not.toBeNull();
    expect(detail!.matchId).toBe(gameId);
    expect(detail!.gameKey).toBe("nim");
    expect(detail!.moveCount).toBe(7);
    expect(detail!.moves).toHaveLength(7);
    expect(detail!.moves.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Human-readable notation, not raw JSON.
    expect(detail!.moves[0].notation).toBe("Take 3");
    // The recorded initial state rides along for stateful playback.
    expect(detail!.initialState).toEqual({ remaining: 21, nextPlayer: 0 });
    // Usernames resolve so the FE can link player profiles.
    expect(detail!.participants.map((p) => p.username)).toEqual(["user0", "user1"]);
  });

  it("includes the finished game in the replay discovery list", async () => {
    const { gameId } = await playFullNimGame();

    const page = await listReplays({ page: 1, pageSize: 100 });
    const ids = page.replays.map((r) => r.matchId);
    expect(ids).toContain(gameId);
    // The dev seed fixtures are still layered underneath.
    expect(ids).toContain("mock-match-1");
  });

  it("serves the finished game over the HTTP endpoints", async () => {
    const { gameId } = await playFullNimGame();
    const app = makeApp();

    const detail = await supertest(app).get(`/api/replay/${gameId}`);
    expect(detail.status).toBe(200);
    const detailBody = detail.body as { matchId: string; moves: unknown[]; gameKey: string };
    expect(detailBody.matchId).toBe(gameId);
    expect(detailBody.gameKey).toBe("nim");
    expect(detailBody.moves).toHaveLength(7);

    const list = await supertest(app).get("/api/replay/list?games=nim&pageSize=100");
    expect(list.status).toBe(200);
    const listBody = list.body as { replays: { matchId: string }[] };
    expect(listBody.replays.map((r) => r.matchId)).toContain(gameId);

    const view = await supertest(app).post(`/api/replay/${gameId}/view`);
    expect(view.status).toBe(200);
    expect(view.body).toEqual({ matchId: gameId, watchCount: 1 });
  });
});
