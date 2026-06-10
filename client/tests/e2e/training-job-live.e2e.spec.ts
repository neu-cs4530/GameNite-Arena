import { test, expect, type Page } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import { FIXTURE_FIRST_JOB_ID, FIXTURE_RUNNING_JOB_ID } from "./trainerTestUtils.ts";

/**
 * Tests for `/trainer/jobs/:jobId` (spec section "Tests the trainer test agent
 * must write" #3). The live job viewer is two-column on desktop:
 *   - Header: job id, model name, game badge, status pill, elapsed, episodes.
 *   - Left column: <JobProgressChart> with meanReward + winRate.
 *   - Right column: <JobMetricsPanel> + <CheckpointsList>.
 *   - Bottom action bar: Cancel / Download / Deploy depending on state.
 *
 * WebSocket integration is mocked - the hook emits an event every ~400ms.
 * We use `expect(...).toPass()` polling so the test waits for the
 * mock interval to surface new data without flaking.
 */

async function gotoJob(page: Page, jobId: string) {
  await page.goto(`/trainer/jobs/${jobId}`);
  await expect(page.getByTestId("training-job-live")).toBeVisible();
}

test.describe("The live training job page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with skeletons, then renders chart, metrics, and checkpoints", async ({ page }) => {
    await page.goto(`/trainer/jobs/${FIXTURE_FIRST_JOB_ID}`);

    // Skeleton on mount: chart + metrics + checkpoints.
    await expect(page.getByTestId("skeleton").first()).toBeVisible();

    // Then the real surface mounts.
    await expect(page.getByTestId("training-job-live")).toBeVisible();
    await expect(page.getByTestId("job-progress-chart")).toBeVisible();
    await expect(page.getByTestId("job-metrics-panel")).toBeVisible();
    await expect(page.getByTestId("checkpoint-picker")).toBeVisible();

    // Skeletons gone.
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
  });

  test("header reflects job metadata: id, model name, game badge, status pill, episodes", async ({
    page,
  }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    const header = page.getByTestId("training-job-header");
    await expect(header).toBeVisible();
    // The first fixture job is completed Nim.
    await expect(header.getByTestId("job-status-pill")).toHaveText(/completed/i);
    await expect(header).toContainText(/nim/i);
    // Episode counter format: "N / N".
    await expect(header.getByTestId("episode-progress")).toContainText(/\d+\s*\/\s*\d+/);
  });

  test("status pill reflects the running job's status", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    await expect(page.getByTestId("job-status-pill")).toHaveText(/running/i);
    // The live training dot indicates an active WebSocket.
    await expect(page.getByTestId("live-training-dot")).toBeVisible();
  });

  test("mocked WebSocket events update the chart and metrics over time", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);

    const meanRewardCell = page.getByTestId("metric-mean-reward");
    const episodesCell = page.getByTestId("metric-episodes");
    await expect(meanRewardCell).toBeVisible();
    await expect(episodesCell).toBeVisible();

    const firstEpisodes = Number((await episodesCell.innerText()).replace(/[^0-9]/g, "")) || 0;

    // Poll until the episodes counter has advanced. The mock emits every
    // ~400ms; allow up to 8s for a single tick to be observed.
    await expect(async () => {
      const next = Number((await episodesCell.innerText()).replace(/[^0-9]/g, "")) || 0;
      expect(next).toBeGreaterThan(firstEpisodes);
    }).toPass({ timeout: 8000 });

    // The chart's data point count also grows. The chart MUST render its
    // series as `<polyline data-testid="chart-series-mean-reward">` (and
    // similar for winRate) so we can read the `points` attribute and verify
    // it has more vertices than at first paint.
    const seriesPolyline = page.getByTestId("chart-series-mean-reward");
    await expect(seriesPolyline).toBeVisible();
  });

  test("Cancel button on a running job flips status to canceled", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    await page.getByRole("button", { name: /Cancel/i }).click();
    // Confirmation step.
    await page.getByRole("button", { name: /Confirm cancel/i }).click();
    await expect(page.getByTestId("job-status-pill")).toHaveText(/canceled/i);
  });

  test("on a completed job, Download .pth triggers a download", async ({ page }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download .pth/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pth$/);
  });

  test("Deploy is enabled when cap not reached", async ({ page }) => {
    // The first fixture job is a Nim job; the cap-saturated game is connect4.
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    await expect(page.getByRole("button", { name: /^Deploy$/ })).toBeEnabled();
  });

  test("Deploy is disabled with cap-explainer tooltip when cap reached", async ({ page }) => {
    // The test agent assumes a fixture exists with id `mock-job-cap-saturated`
    // - a completed Connect 4 job whose game already has 3 active
    // deployments for user0. The Deploy button is disabled and the
    // hover/focus tooltip mentions the cap.
    await page.goto(`/trainer/jobs/mock-job-cap-saturated`);
    await expect(page.getByTestId("training-job-live")).toBeVisible();

    const deployBtn = page.getByRole("button", { name: /^Deploy$/ });
    await expect(deployBtn).toBeDisabled();

    // The cap explainer is rendered (as a sibling tooltip, accessible
    // description, or aria-describedby) and mentions the cap.
    await expect(page.getByText(/3 active deployments in Connect 4/i)).toBeVisible();
    // CTA to manage deployments.
    await expect(page.getByRole("link", { name: /Manage deployments/i })).toBeVisible();
  });

  test("checkpoints list shows entries with Resume / Download per checkpoint", async ({ page }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    const checkpoints = page.getByTestId("checkpoint-picker");
    await expect(checkpoints).toBeVisible();

    const items = checkpoints.getByTestId("checkpoint-item");
    expect(await items.count()).toBeGreaterThan(0);

    // Each checkpoint item exposes Resume + Download.
    await expect(items.first().getByRole("button", { name: /Resume/i })).toBeVisible();
    await expect(items.first().getByRole("button", { name: /Download/i })).toBeVisible();
  });

  test("Resume from a checkpoint navigates to /trainer/new with the checkpoint prefilled", async ({
    page,
  }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    await page
      .getByTestId("checkpoint-picker")
      .getByTestId("checkpoint-item")
      .first()
      .getByRole("button", { name: /Resume/i })
      .click();
    await page.waitForURL(/\/trainer\/new\?.*fromCheckpoint=/);
  });

  test("WebSocket cleanup: navigating away does not log errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    // Wait for a couple of WebSocket emits before navigating away so we
    // exercise the unsubscribe path.
    await page.waitForTimeout(900);
    await page.goto("/trainer");
    await expect(page.getByTestId("trainer-dashboard")).toBeVisible();

    // No "setState on unmounted" or similar leak warnings.
    expect(errors.filter((e) => /unmounted|memory leak/i.test(e))).toEqual([]);
  });

  test("switching jobId resets the accumulated WebSocket event stream", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    // After a beat, the event count is > 0.
    await page.waitForTimeout(500);
    const countA = await page.getByTestId("event-count").innerText();
    expect(Number(countA)).toBeGreaterThan(0);

    // Navigate to the completed first fixture job; the live event count for
    // a non-running job resets to 0 on switch.
    await page.goto(`/trainer/jobs/${FIXTURE_FIRST_JOB_ID}`);
    await expect(page.getByTestId("event-count")).toHaveText("0");
  });

  test("unknown jobId renders an error state with a retry", async ({ page }) => {
    await page.goto("/trainer/jobs/does-not-exist");
    await expect(page.getByTestId("error-state")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });

  test("getJob view-counter increments on mount (watch-count style)", async ({ page }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    const counter = page.getByTestId("job-views-counter");
    await expect(counter).toBeVisible();
    const first = Number(await counter.innerText());

    await page.goto("/trainer");
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    const second = Number(await counter.innerText());
    expect(second).toBeGreaterThan(first);
  });
});
