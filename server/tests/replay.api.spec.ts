import { describe, expect, it } from "vitest";
import supertest, { type Response } from "supertest";
import { app } from "../src/app.ts";
import { replayRepo } from "../src/services/replayStore.service.ts";
import { type ReplayRecord } from "@gamenite/shared";
import { randomUUID } from "crypto";

let response: Response;

const sampleReplay: ReplayRecord = {
  gameId: "replay-game-001",
  gameType: "chess",
  players: ["P1", "P2"],
  outcome: "player_one_wins",
  startedAt: 1000,
  endedAt: 1010,
  moveHistory: [
    { userMove: 0, playedBy: "P1", moveNotation: "e4", playedAt: 1001 },
    { userMove: 1, playedBy: "P2", moveNotation: "e5", playedAt: 1002 },
  ],
};

describe("GET /api/replay/:gameId", () => {
  it("should 404 when no replay exists for that gameId", async () => {
    response = await supertest(app).get(`/api/replay/${randomUUID().toString()}`);
    expect(response.status).toBe(404);
  });

  it("should return the stored replay as JSON when one exists", async () => {
    await replayRepo.saveReplay(sampleReplay);

    response = await supertest(app).get(`/api/replay/${sampleReplay.gameId}`);
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual(sampleReplay);
  });
});
