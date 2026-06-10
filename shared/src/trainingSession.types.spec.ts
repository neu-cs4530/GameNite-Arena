import { describe, expect, it } from "vitest";
import {
  zStartTrainingSession,
  zReportTrainingProgress,
  zCompleteTrainingSession,
  zFailTrainingSession,
  zTrainerGameKey,
} from "./trainingSession.types.ts";

describe("zTrainerGameKey", () => {
  it("accepts every trainer game", () => {
    for (const key of ["nim", "guess", "checkers", "connect4", "tictactoe"]) {
      expect(zTrainerGameKey.safeParse(key).success).toBe(true);
    }
  });

  it("rejects unknown games (including the ai-SDK alias 'numguesser')", () => {
    expect(zTrainerGameKey.safeParse("numguesser").success).toBe(false);
    expect(zTrainerGameKey.safeParse("chess").success).toBe(false);
  });
});

describe("zStartTrainingSession", () => {
  const valid = {
    gameKey: "nim",
    modelDisplayName: "my-nim-bot",
    config: { episodes: 1000, learningRate: 0.0003 },
  };

  it("accepts a minimal valid payload", () => {
    expect(zStartTrainingSession.safeParse(valid).success).toBe(true);
  });

  it("accepts an existing modelId instead of a display name", () => {
    const parsed = zStartTrainingSession.safeParse({
      gameKey: "connect4",
      modelId: "some-model-id",
      config: { episodes: 5, learningRate: 0.1, extra: { gamma: 0.99 } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing config", () => {
    expect(zStartTrainingSession.safeParse({ gameKey: "nim" }).success).toBe(false);
  });

  it("rejects non-positive episodes and out-of-range learning rates", () => {
    expect(
      zStartTrainingSession.safeParse({
        ...valid,
        config: { episodes: 0, learningRate: 0.001 },
      }).success,
    ).toBe(false);
    expect(
      zStartTrainingSession.safeParse({
        ...valid,
        config: { episodes: 10, learningRate: 0 },
      }).success,
    ).toBe(false);
    expect(
      zStartTrainingSession.safeParse({
        ...valid,
        config: { episodes: 10, learningRate: 1.5 },
      }).success,
    ).toBe(false);
  });
});

describe("zReportTrainingProgress", () => {
  it("accepts episodes alone", () => {
    expect(zReportTrainingProgress.safeParse({ episodes: 10 }).success).toBe(true);
  });

  it("accepts an open numeric metric bag and a message", () => {
    const parsed = zReportTrainingProgress.safeParse({
      episodes: 25,
      metrics: { loss: 0.3, winRate: 0.61, meanReward: 0.4, anything: 1 },
      message: "Episode 25/100",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative episodes and non-numeric metrics", () => {
    expect(zReportTrainingProgress.safeParse({ episodes: -1 }).success).toBe(false);
    expect(
      zReportTrainingProgress.safeParse({ episodes: 1, metrics: { loss: "high" } }).success,
    ).toBe(false);
  });
});

describe("terminal payloads", () => {
  it("complete accepts empty and metric-bearing payloads", () => {
    expect(zCompleteTrainingSession.safeParse({}).success).toBe(true);
    expect(zCompleteTrainingSession.safeParse({ finalMetrics: { winRate: 0.9 } }).success).toBe(
      true,
    );
  });

  it("fail requires a non-empty error string", () => {
    expect(zFailTrainingSession.safeParse({ error: "exploded" }).success).toBe(true);
    expect(zFailTrainingSession.safeParse({ error: "" }).success).toBe(false);
    expect(zFailTrainingSession.safeParse({}).success).toBe(false);
  });
});
