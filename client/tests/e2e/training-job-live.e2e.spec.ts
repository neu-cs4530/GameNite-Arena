/**
 * The live run page against REAL sessions — including the live socket flip:
 * progress posted to the API must light up the page WITHOUT a reload,
 * because the bridge fans it into the page's socket subscription.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  completeSession,
  failSession,
  logInTrainer,
  registerSession,
  reportProgress,
  signupTrainerUser,
  uploadArtifact,
  type TrainerUser,
} from "./realTrainerUtils.ts";

let user: TrainerUser;
let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  user = await signupTrainerUser(api, "e2e_live");
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("Queued: the handoff state", () => {
  test("shows the connect-your-trainer card with the exact attach command", async ({ page }) => {
    const run = await registerSession(api, user, { name: "live-handoff-bot" });

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);

    await expect(page.getByTestId("connect-trainer-card")).toBeVisible();
    await expect(page.getByTestId("connect-trainer-command")).toContainText(
      `--job-id ${run.jobId}`,
    );
    // No chart noise while there is nothing to chart.
    await expect(page.getByTestId("live-chart-section")).toHaveCount(0);
  });

  test("flips live WITHOUT a reload when the trainer reports", async ({ page }) => {
    const run = await registerSession(api, user, { name: "live-flip-bot", episodes: 200 });

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);
    await expect(page.getByTestId("connect-trainer-card")).toBeVisible();

    // The "local trainer" reports through the same API the reporter uses.
    await reportProgress(api, user, run.jobId, 50, { winRate: 0.42, meanReward: 0.1 });

    // The socket event reaches the already-subscribed page: it refetches,
    // the handoff card yields to the live chart and metrics.
    await expect(page.getByTestId("live-chart-section")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("metric-win-rate")).toContainText("42.0%");

    // More reports stream straight into the page.
    await reportProgress(api, user, run.jobId, 120, { winRate: 0.61, meanReward: 0.3 });
    await expect(page.getByTestId("metric-win-rate")).toContainText("61.0%", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("metric-episodes")).toContainText("120");

    await completeSession(api, user, run.jobId);
  });
});

test.describe("Terminal states", () => {
  test("completion + artifact upload light up download/deploy without a manual reload", async ({
    page,
  }) => {
    const run = await registerSession(api, user, { name: "live-finish-bot", episodes: 100 });
    await reportProgress(api, user, run.jobId, 60, { winRate: 0.5 });

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);
    await expect(page.getByTestId("live-chart-section")).toBeVisible();

    // The reporter's documented order: complete first, artifact right after
    // (uploading before the UI assertions keeps the page's staged re-reads
    // comfortably ahead of the upload).
    await completeSession(api, user, run.jobId, { winRate: 0.83, meanReward: 0.6 });
    await uploadArtifact(api, user, run.jobId);
    await expect(page.getByTestId("job-actions").getByTestId("run-again")).toBeVisible({
      timeout: 15_000,
    });

    // The delayed post-terminal refetch picks the artifact up.
    await expect(page.getByTestId("download-artifact")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("deploy-model")).toBeVisible();

    // Advanced tier: integrity metadata for the real artifact.
    await page.getByTestId("advanced-panel-toggle").click();
    await expect(page.getByTestId("advanced-artifact")).toContainText("sha256");
    await expect(page.getByTestId("advanced-job-id")).toContainText(run.jobId);
  });

  test("a UI cancel reaches the trainer through its next progress response", async ({ page }) => {
    const run = await registerSession(api, user, { name: "live-cancel-bot" });
    await reportProgress(api, user, run.jobId, 10);

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);

    await page.getByTestId("cancel-run").click();
    await page.getByTestId("cancel-confirm").click();
    await expect(page.getByTestId("training-job-header")).toContainText(/canceled/i);

    const status = await reportProgress(api, user, run.jobId, 20);
    expect(status).toBe("canceled");
  });

  test("a failed run shows its reason front and center", async ({ page }) => {
    const run = await registerSession(api, user, { name: "live-failed-bot" });
    await reportProgress(api, user, run.jobId, 5);
    await failSession(api, user, run.jobId, "NaN loss at episode 5");

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);

    await expect(page.getByTestId("job-failure-reason")).toContainText("NaN loss");
  });
});

test.describe("Disclosure tiers on the live page", () => {
  test("event log and raw session data are opt-in", async ({ page }) => {
    const run = await registerSession(api, user, { name: "live-tiers-bot" });
    await reportProgress(api, user, run.jobId, 30, { winRate: 0.3 });

    await logInTrainer(page, user);
    await page.goto(`/trainer/jobs/${run.jobId}`);

    await expect(page.getByTestId("event-log-body")).toHaveCount(0);
    await expect(page.getByTestId("raw-session-body")).toHaveCount(0);

    await page.getByTestId("advanced-panel-toggle").click();
    await expect(page.getByTestId("advanced-model-id")).toBeVisible();
    await page.getByTestId("raw-session-toggle").click();
    await expect(page.getByTestId("raw-session-body")).toContainText(run.jobId);

    await completeSession(api, user, run.jobId);
  });

  test("an unknown run id renders the error state", async ({ page }) => {
    await logInTrainer(page, user);
    await page.goto("/trainer/jobs/does-not-exist");
    await expect(page.getByTestId("training-job-live-error")).toBeVisible();
  });
});
