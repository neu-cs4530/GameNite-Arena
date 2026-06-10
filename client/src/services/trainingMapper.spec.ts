import { describe, expect, it } from "vitest";
import type { TrainingSessionInfo } from "@gamenite/shared";
import { mapSessionToJobDetail } from "./trainingMapper.ts";

/**
 * The mapper must be TOTAL: TrainingJobLive dereferences views, the three
 * series arrays, checkpoints, hasArtifact and targetEpisodes without guards,
 * so a missing default = a white-screen ErrorBoundary on the live page.
 */

const baseInfo: TrainingSessionInfo = {
  jobId: "job-1",
  modelId: "model-1",
  modelDisplayName: "local-nim-bot",
  owner: { username: "user0", display: "The Knight Of Games" },
  gameKey: "nim",
  status: "running",
  config: { episodes: 1000, learningRate: 0.0003 },
  progress: {
    episodes: 250,
    meanReward: 0.4,
    winRate: 0.61,
    updatedAt: "2026-06-09T12:00:00.000Z",
  },
  hasArtifact: false,
  createdAt: "2026-06-09T11:00:00.000Z",
};

describe("mapSessionToJobDetail", () => {
  it("maps every server field onto the client job detail", () => {
    const detail = mapSessionToJobDetail(baseInfo);

    expect(detail.id).toBe("job-1");
    expect(detail.modelId).toBe("model-1");
    expect(detail.modelDisplayName).toBe("local-nim-bot");
    expect(detail.owner).toEqual({ username: "user0", displayName: "The Knight Of Games" });
    expect(detail.gameKey).toBe("nim");
    expect(detail.status).toBe("running");
    expect(detail.hyperparameters.episodes).toBe(1000);
    expect(detail.hyperparameters.learningRate).toBe(0.0003);
    expect(detail.progressEpisodes).toBe(250);
    expect(detail.targetEpisodes).toBe(1000);
    expect(detail.currentMeanReward).toBe(0.4);
    expect(detail.currentWinRate).toBe(0.61);
    expect(detail.createdAt).toBe("2026-06-09T11:00:00.000Z");
    expect(detail.hasArtifact).toBe(false);
  });

  it("fills every page-critical field the server does not track with a safe default", () => {
    const detail = mapSessionToJobDetail(baseInfo);

    expect(detail.views).toBe(0);
    expect(detail.checkpoints).toEqual([]);
    expect(detail.hasCheckpoint).toBe(false);
    expect(detail.episodesSeries).toEqual([]);
    expect(detail.meanRewardSeries).toEqual([]);
    expect(detail.winRateSeries).toEqual([]);
    expect(detail.startedAt).toBeUndefined();
    expect(detail.completedAt).toBeUndefined();
  });

  it("carries terminal fields through", () => {
    const detail = mapSessionToJobDetail({
      ...baseInfo,
      status: "completed",
      hasArtifact: true,
      completedAt: "2026-06-09T13:00:00.000Z",
    });

    expect(detail.status).toBe("completed");
    expect(detail.hasArtifact).toBe(true);
    expect(detail.completedAt).toBe("2026-06-09T13:00:00.000Z");
  });

  it("passes extra config through as the opaque blob", () => {
    const detail = mapSessionToJobDetail({
      ...baseInfo,
      config: { ...baseInfo.config, extra: { gamma: 0.99 } },
    });
    expect(detail.hyperparameters.extraConfig).toEqual({ gamma: 0.99 });
  });

  it("maps the canceled status (a real session status the live event union lacks)", () => {
    const detail = mapSessionToJobDetail({ ...baseInfo, status: "canceled" });
    expect(detail.status).toBe("canceled");
  });
});
