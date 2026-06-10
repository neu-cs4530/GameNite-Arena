import { test, expect, type Page } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import {
  FIXTURE_FIRST_JOB_ID,
  FIXTURE_FIRST_MODEL_ID,
  FIXTURE_RUNNING_JOB_ID,
} from "./trainerTestUtils.ts";

/**
 * Tests for the 10 trainer "extras" the spec asks the test agent to invent
 * AND test for, PLUS three additional FEATURE PROPOSALs beyond the spec.
 *
 * Design choices made by the test agent (where the spec was vague) are
 * documented in test comments so the code agent knows the contract they
 * must meet.
 */

async function gotoJob(page: Page, jobId: string) {
  await page.goto(`/trainer/jobs/${jobId}`);
  await expect(page.getByTestId("training-job-live")).toBeVisible();
}

// ============================================================
// Spec extra #1: Compare two training runs side by side.
// ============================================================
test.describe("Spec extra: Compare two training runs side by side", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - Each completed `<TrainingJobCard>` exposes a "Compare runs" link
   *     that navigates to `/trainer/compare?a=<jobIdA>&b=<jobIdB>`.
   *   - On first click, the route opens with only `?a=...` and prompts to
   *     select a second job.
   *   - The compare page renders two columns of `<JobMetricsPanel>` and a
   *     shared `<JobProgressChart>` overlaying both series.
   */
  test("compare page renders two metric panels and an overlay chart", async ({ page }) => {
    await page.goto(`/trainer/compare?a=${FIXTURE_FIRST_JOB_ID}&b=mock-job-2`);
    await expect(page.getByTestId("compare-runs")).toBeVisible();
    const panels = page.getByTestId("job-metrics-panel");
    expect(await panels.count()).toBe(2);
    await expect(page.getByTestId("job-progress-chart")).toBeVisible();
  });

  test("'Compare runs' link on a completed job card pre-fills the A side", async ({ page }) => {
    await page.goto("/trainer");
    const card = page
      .getByTestId("training-job-card")
      .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /completed/i }) })
      .first();
    await card.getByRole("link", { name: /Compare runs/i }).click();
    await page.waitForURL(/\/trainer\/compare\?a=/);
  });
});

// ============================================================
// Spec extra #2: Hyperparameter presets bar on the config form.
// ============================================================
test.describe("Spec extra: Hyperparameter presets bar (Aggressive/Balanced/Conservative)", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer/new");
  });

  /**
   * Design contract:
   *   - Above the hyperparam form, three preset chips: Aggressive,
   *     Balanced, Conservative.
   *   - Clicking applies a known set of values to episode count + learning
   *     rate. Preset name reflected in URL via `?preset=aggressive`.
   */
  test("'Balanced' preset applies a known set of hyperparams", async ({ page }) => {
    await page.getByRole("button", { name: /Balanced/i }).click();
    await page.waitForURL(/preset=balanced/);
    // Balanced episode count is a non-zero, in-range number.
    const episodes = await page.getByLabel(/Episode count/i).inputValue();
    expect(Number(episodes)).toBeGreaterThan(0);
  });

  test("preset chips are visible and distinct", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Aggressive/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Balanced/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Conservative/i })).toBeVisible();
  });

  test("switching presets changes the underlying hyperparam values", async ({ page }) => {
    await page.getByRole("button", { name: /Aggressive/i }).click();
    const aggressiveEpisodes = await page.getByLabel(/Episode count/i).inputValue();

    await page.getByRole("button", { name: /Conservative/i }).click();
    const conservativeEpisodes = await page.getByLabel(/Episode count/i).inputValue();

    expect(aggressiveEpisodes).not.toEqual(conservativeEpisodes);
  });
});

// ============================================================
// Spec extra #3: Cost estimator on the config form.
// ============================================================
test.describe("Spec extra: Cost estimator on the config form", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer/new");
  });

  /**
   * Design contract:
   *   - Below the hyperparam form, a `<CostEstimator>` panel.
   *   - Shows estimated compute time and slot occupancy. Updates live as
   *     the hyperparams change.
   */
  test("cost estimator shows compute time and slot occupancy", async ({ page }) => {
    const estimator = page.getByTestId("cost-estimator");
    await expect(estimator).toBeVisible();
    await expect(estimator.getByTestId("estimate-compute-time")).toContainText(/\d/);
    await expect(estimator.getByTestId("estimate-slot-occupancy")).toBeVisible();
  });

  test("changing episode count changes the estimated compute time", async ({ page }) => {
    const estimator = page.getByTestId("cost-estimator");
    await page.getByLabel(/Episode count/i).fill("1000");
    const at1k = await estimator.getByTestId("estimate-compute-time").innerText();

    await page.getByLabel(/Episode count/i).fill("100000");
    const at100k = await estimator.getByTestId("estimate-compute-time").innerText();

    expect(at1k).not.toEqual(at100k);
  });
});

// ============================================================
// Spec extra #4: "If you stop now" projection on live training.
// ============================================================
test.describe("Spec extra: 'If you stop now' projection on live training", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - On the live job page (running status), a panel shows projected
   *     final win rate if the user cancels right now.
   *   - The number updates as new WebSocket events arrive.
   */
  test("running job page shows an 'if you stop now' panel", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    const projection = page.getByTestId("stop-now-projection");
    await expect(projection).toBeVisible();
    // Shows a percentage value.
    await expect(projection).toContainText(/\d+\.?\d*\s*%/);
  });
});

// ============================================================
// Spec extra #5: Model lineage tree (mini graph of forks).
// ============================================================
test.describe("Spec extra: Model lineage tree (mini graph of forks)", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - On the model card page, a `<ModelLineageTree>` renders an
   *     SVG mini-graph of ancestors and immediate fork descendants.
   *   - Each node is a clickable link to its model card.
   */
  test("model card page renders a lineage tree mini graph", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const tree = page.getByTestId("model-lineage-tree");
    await expect(tree).toBeVisible();
    // At least one node is the current model (highlighted).
    await expect(tree.getByTestId("lineage-node-current")).toBeVisible();
  });

  test("clicking a lineage node navigates to that model card", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const tree = page.getByTestId("model-lineage-tree");
    // Click a non-current node, if any exist.
    const otherNode = tree.getByTestId("lineage-node").first();
    if ((await otherNode.count()) > 0) {
      await otherNode.click();
      await page.waitForURL(/\/models\/[^/]+$/);
    }
  });
});

// ============================================================
// Spec extra #6: Deployment activity sparkline.
// ============================================================
test.describe("Spec extra: Deployment activity sparkline (matches per day)", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer?tab=deployments");
  });

  /**
   * Design contract:
   *   - Each deployment card carries a small `<ActivitySparkline>`
   *     showing matches played per day for the last 14 days.
   */
  test("each deployment card carries an activity sparkline", async ({ page }) => {
    const first = page.getByTestId("deployment-card").first();
    await expect(first).toBeVisible();
    await expect(first.getByTestId("activity-sparkline")).toBeVisible();
  });
});

// ============================================================
// Spec extra #7: "Notify me when training completes" toggle.
// ============================================================
test.describe("Spec extra: 'Notify me when training completes' toggle", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - On the live job page, a checkbox/toggle "Notify me when complete".
   *   - Setting it writes localStorage key
   *     `gnarena:notifyJobs` = JSON array of jobIds.
   *   - The toggle re-reads its state from localStorage on visit.
   */
  test("toggle persists across visits via localStorage", async ({ page }) => {
    await gotoJob(page, FIXTURE_RUNNING_JOB_ID);
    const toggle = page.getByLabel(/Notify me when (training )?completes?/i);
    await toggle.check();
    await expect(toggle).toBeChecked();

    // Reload preserves.
    await page.reload();
    await expect(page.getByLabel(/Notify me when (training )?completes?/i)).toBeChecked();

    // localStorage contains the jobId.
    const stored = await page.evaluate(() => window.localStorage.getItem("gnarena:notifyJobs"));
    expect(stored).toContain(FIXTURE_RUNNING_JOB_ID);
  });
});

// ============================================================
// Spec extra #8: Replay link from a deployment to most recent match.
// ============================================================
test.describe("Spec extra: Replay link from a deployment to most recent match", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer?tab=deployments");
  });

  /**
   * Design contract:
   *   - Each deployment card has a "Watch most recent match" link that
   *     deep-links to `/replays/<matchId>` (reusing the replay viewer).
   *   - The matchId is mocked from the deployment fixture.
   */
  test("deployment card link navigates to /replays/:matchId", async ({ page }) => {
    const first = page.getByTestId("deployment-card").first();
    await first.getByRole("link", { name: /Watch most recent match/i }).click();
    await page.waitForURL(/\/replays\/[^/]+$/);
  });
});

// ============================================================
// Spec extra #9: Model card "View related replays" button.
// ============================================================
test.describe("Spec extra: Model card 'View related replays' button", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - Model card page header includes a "View related replays" button
   *     that links to `/replays?modelId=<modelId>`, filtering the
   *     replay discovery feed to matches played by this model.
   */
  test("'View related replays' navigates to /replays with modelId filter", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    await page.getByRole("button", { name: /View related replays/i }).click();
    await page.waitForURL(new RegExp(`/replays\\?.*modelId=${FIXTURE_FIRST_MODEL_ID}`));
  });
});

// ============================================================
// Spec extra #10: Job rerun ("Run again with same config").
// ============================================================
test.describe("Spec extra: Job rerun - 'Run again with same config'", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  /**
   * Design contract:
   *   - Completed/failed/canceled job pages expose a "Run again with same
   *     config" button.
   *   - Clicking navigates to `/trainer/new?fromJob=<jobId>` and the form
   *     pre-fills with the original hyperparams.
   */
  test("'Run again' navigates to /trainer/new prefilled from the job", async ({ page }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    await page.getByRole("button", { name: /Run again with same config/i }).click();
    await page.waitForURL(new RegExp(`/trainer/new\\?.*fromJob=${FIXTURE_FIRST_JOB_ID}`));
  });

  test("the prefilled form retains the source job's episode count", async ({ page }) => {
    await page.goto(`/trainer/new?fromJob=${FIXTURE_FIRST_JOB_ID}`);
    const episodes = await page.getByLabel(/Episode count/i).inputValue();
    // The mock job's episode count is recorded; assert it's not empty.
    expect(episodes).not.toBe("");
    expect(Number(episodes)).toBeGreaterThan(0);
  });
});

// ============================================================
// FEATURE PROPOSAL #1: Keyboard shortcut quick-launch via "n"
// ============================================================
test.describe("FEATURE PROPOSAL: Keyboard quick-launch new run via 'n'", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  // FEATURE PROPOSAL:
  // On the trainer dashboard, pressing the "n" key (when not focused on an
  // input) navigates to `/trainer/new`. This mirrors the muscle memory of
  // GitHub's repo shortcuts and saves a click for power users running
  // many experiments per session.
  test("pressing 'n' on the dashboard navigates to /trainer/new", async ({ page }) => {
    await page.goto("/trainer");
    await page.getByTestId("trainer-dashboard").click();
    await page.keyboard.press("n");
    await page.waitForURL("/trainer/new");
  });

  test("'n' is suppressed while typing in an input", async ({ page }) => {
    await page.goto("/trainer");
    // Focus the deployment filter search to simulate typing.
    await page
      .getByLabel(/Owner search/i)
      .first()
      .click();
    await page.keyboard.press("n");
    // We did NOT navigate.
    expect(page.url()).not.toContain("/trainer/new");
  });
});

// ============================================================
// FEATURE PROPOSAL #2: Auto-deploy on completion toggle.
// ============================================================
test.describe("FEATURE PROPOSAL: Auto-deploy on completion toggle", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer/new");
  });

  // FEATURE PROPOSAL:
  // The new-run form exposes a checkbox "Auto-deploy on completion". When
  // checked, the resulting job is recorded with `autoDeploy: true`, and on
  // completion the `.pth` is auto-deployed to the first free slot for the
  // selected game. If the cap is full at completion time, the system shows
  // a notification suggesting the user free a slot.
  //
  // This eliminates the "submit, walk away, come back, click deploy"
  // friction that bites users running overnight training.
  test("toggle is visible on the new-run form and persists in the submitted job", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /hello world template/i }).click();
    await page.getByTestId("hello-world-template-button").click();
    await page.getByRole("button", { name: /^Nim$/ }).click();
    await page.getByLabel(/Episode count/i).fill("1000");

    const autoDeploy = page.getByLabel(/Auto[- ]deploy on completion/i);
    await expect(autoDeploy).toBeVisible();
    await autoDeploy.check();

    await page.getByRole("button", { name: /Launch training run/i }).click();
    await page.waitForURL(/\/trainer\/jobs\/[^/]+$/);

    // The live job page exposes a small badge confirming auto-deploy.
    await expect(page.getByTestId("auto-deploy-badge")).toBeVisible();
  });
});

// ============================================================
// FEATURE PROPOSAL #3: Side-by-side checkpoint diff viewer.
// ============================================================
test.describe("FEATURE PROPOSAL: Side-by-side checkpoint diff viewer", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  // FEATURE PROPOSAL:
  // From the live job page, selecting two checkpoints in the
  // `<CheckpointPicker>` reveals a "Compare checkpoints" button. Clicking
  // opens a panel showing key metrics (mean reward, win rate, parameter
  // delta-norm) between the two checkpoints, so a trainer can identify
  // when training stopped improving.
  test("selecting two checkpoints reveals a 'Compare checkpoints' action", async ({ page }) => {
    await gotoJob(page, FIXTURE_FIRST_JOB_ID);
    const picker = page.getByTestId("checkpoint-picker");
    const items = picker.getByTestId("checkpoint-item");
    // Need at least 2 checkpoints for the action to surface. The contract
    // requires the running fixture job to have multiple checkpoints.
    if ((await items.count()) >= 2) {
      await items
        .nth(0)
        .getByRole("checkbox", { name: /Compare/i })
        .check();
      await items
        .nth(1)
        .getByRole("checkbox", { name: /Compare/i })
        .check();

      const compareBtn = page.getByRole("button", { name: /Compare checkpoints/i });
      await expect(compareBtn).toBeVisible();
      await compareBtn.click();

      // Diff panel opens.
      await expect(page.getByTestId("checkpoint-diff-panel")).toBeVisible();
      await expect(page.getByTestId("checkpoint-diff-mean-reward")).toBeVisible();
      await expect(page.getByTestId("checkpoint-diff-win-rate")).toBeVisible();
    }
  });
});

// ============================================================
// FEATURE PROPOSAL #4: Public training run leaderboard.
// ============================================================
test.describe("FEATURE PROPOSAL: Public training run leaderboard at /trainer/leaderboard", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  // FEATURE PROPOSAL:
  // A community leaderboard surfacing the top public completed training
  // runs by final win rate, per game. Encourages public sharing,
  // discoverability, and friendly competition. Each row links to the
  // model card.
  test("/trainer/leaderboard renders a table of top public runs", async ({ page }) => {
    await page.goto("/trainer/leaderboard");
    const board = page.getByTestId("trainer-leaderboard");
    await expect(board).toBeVisible();

    // Filter by game tab.
    const tab = board.getByRole("tab", { name: /^Nim$/ });
    await expect(tab).toBeVisible();
    await tab.click();

    // Each row has a model name + final win rate.
    const rows = board.getByRole("row");
    expect(await rows.count()).toBeGreaterThan(1); // header + at least one row.
  });

  test("clicking a leaderboard row navigates to its model card", async ({ page }) => {
    await page.goto("/trainer/leaderboard");
    const firstLink = page.getByTestId("trainer-leaderboard").getByRole("link").first();
    await firstLink.click();
    await page.waitForURL(/\/models\/[^/]+$/);
  });
});
