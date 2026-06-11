/**
 * Trainer dashboard against REAL runs.
 *
 * Every piece of state these tests assert was created through the live API
 * (the same calls the local trainer makes) — the suite is the proof that
 * the dashboard shows real data. The suite registers its own user, so
 * everything starts from zero.
 *
 * Layout under test (progressive disclosure):
 *   tier 0: count chips (the doors) + Live-Now card + quickstart when idle
 *   tier 1: Runs / Deployments / Models disclosures
 *   tier 2: per-run row expansion
 *   tier 3: raw session data
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  cancelSession,
  completeSession,
  deployModel,
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
  user = await signupTrainerUser(api, "e2e_dash");
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("Fresh trainer (tier 0 at rest)", () => {
  test("a brand-new user sees the calm quickstart, no chips, closed sections", async ({ page }) => {
    const freshUser = await signupTrainerUser(api, "e2e_dash_fresh");
    await logInTrainer(page, freshUser);
    await page.goto("/trainer");

    await expect(page.getByTestId("trainer-quickstart")).toBeVisible();
    await expect(page.getByTestId("quickstart-kit-command")).toContainText("install.sh");
    await expect(page.getByTestId("status-chips")).toHaveCount(0);
    // Sections are present but closed — their bodies don't exist in the DOM.
    await expect(page.getByTestId("trainer-section-runs")).toBeVisible();
    await expect(page.getByTestId("trainer-section-runs-body")).toHaveCount(0);
  });
});

test.describe("Real runs drive the dashboard", () => {
  test("a queued registration lights the Waiting chip and the Live-Now card", async ({ page }) => {
    const { jobId } = await registerSession(api, user, { name: "dash-queued-bot" });

    await logInTrainer(page, user);
    await page.goto("/trainer");

    await expect(page.getByTestId("status-chip-queued")).toBeVisible();
    await expect(page.getByTestId("live-now-card")).toBeVisible();
    await expect(page.getByTestId("live-now-waiting")).toBeVisible();

    // Tidy (checked): cancel so later tests' chip counts stay interpretable.
    await cancelSession(api, user, jobId);
  });

  test("a running session auto-opens Runs and shows live progress on the row", async ({ page }) => {
    const run = await registerSession(api, user, { name: "dash-running-bot", episodes: 100 });
    await reportProgress(api, user, run.jobId, 40, { winRate: 0.5, meanReward: 0.2 });

    await logInTrainer(page, user);
    await page.goto("/trainer");

    await expect(page.getByTestId("status-chip-running")).toBeVisible();
    // Runs auto-opens only because something is running.
    await expect(page.getByTestId("trainer-section-runs-body")).toBeVisible();
    const row = page.getByTestId("job-row").filter({ hasText: "dash-running-bot" });
    await expect(row.getByTestId("job-row-progress")).toContainText("40");

    await completeSession(api, user, run.jobId);
  });

  test("chips are doors: the Failed chip opens Runs filtered, with the reason on the row", async ({
    page,
  }) => {
    const run = await registerSession(api, user, { name: "dash-failed-bot" });
    await reportProgress(api, user, run.jobId, 10);
    await failSession(api, user, run.jobId, "loss diverged after 10 episodes");

    await logInTrainer(page, user);
    await page.goto("/trainer");

    await page.getByTestId("status-chip-failed").click();
    await expect(page.getByTestId("trainer-section-runs-body")).toBeVisible();
    const failedRow = page.getByTestId("job-row").filter({ hasText: "dash-failed-bot" });
    await expect(failedRow).toHaveCount(1);
    await expect(failedRow.getByTestId("job-row-error")).toContainText("loss diverged");
    // Pre-filtered list: other statuses are out of view until cleared.
    await expect(page.getByTestId("runs-clear-filters")).toBeVisible();
    await expect(page.getByTestId("job-row").filter({ hasText: "dash-running-bot" })).toHaveCount(
      0,
    );
  });

  test("row expansion is tier 2 (config, ids) and raw data is tier 3", async ({ page }) => {
    const run = await registerSession(api, user, {
      name: "dash-expand-bot",
      episodes: 777,
      learningRate: 0.001,
    });
    await reportProgress(api, user, run.jobId, 100, { winRate: 0.4 });
    await completeSession(api, user, run.jobId);

    await logInTrainer(page, user);
    await page.goto("/trainer");
    // Chips always OPEN (never toggle) — race-free door into the section.
    await page.getByTestId("status-chip-completed").click();
    await page.getByTestId("runs-clear-filters").click();

    const row = page.getByTestId("job-row").filter({ hasText: "dash-expand-bot" });
    await expect(row.getByTestId("job-row-details")).toHaveCount(0);
    await row.getByTestId("job-row-toggle").click();

    await expect(row.getByTestId("job-row-details")).toBeVisible();
    await expect(row.getByTestId("job-row-details")).toContainText("777");
    await expect(row.getByTestId("job-row-id")).toContainText(run.jobId);

    // Tier 3: raw session data only on demand.
    await expect(row.getByTestId("job-row-raw-body")).toHaveCount(0);
    await row.getByTestId("job-row-raw-toggle").click();
    await expect(row.getByTestId("job-row-raw-body")).toContainText(run.modelId);
  });

  test("canceling a queued run from its row works and the trainer sees it", async ({ page }) => {
    const run = await registerSession(api, user, { name: "dash-cancel-bot" });

    await logInTrainer(page, user);
    await page.goto("/trainer");
    await page.getByTestId("status-chip-queued").click();

    const row = page.getByTestId("job-row").filter({ hasText: "dash-cancel-bot" });
    await row.getByTestId("job-row-cancel").click();
    // The queued pre-filter is honest: a now-canceled run drops out of it...
    await expect(row).toHaveCount(0);
    // ...and shows its canceled status once the filter is cleared.
    await page.getByTestId("runs-clear-filters").click();
    await expect(
      page
        .getByTestId("job-row")
        .filter({ hasText: "dash-cancel-bot" })
        .getByText(/canceled/i)
        .first(),
    ).toBeVisible();

    // The control channel: the trainer's next report comes back "canceled".
    const status = await reportProgress(api, user, run.jobId, 50);
    expect(status).toBe("canceled");
  });
});

test.describe("Deployments on real artifacts", () => {
  test("deploying a trained model shows real slot usage and lifecycle actions work", async ({
    page,
  }) => {
    const run = await registerSession(api, user, {
      name: "dash-deploy-bot",
      gameKey: "connect4",
    });
    await reportProgress(api, user, run.jobId, 500, { winRate: 0.8 });
    await completeSession(api, user, run.jobId);
    await uploadArtifact(api, user, run.jobId);
    await deployModel(api, user, run.modelId, "dash deploy slot");

    await logInTrainer(page, user);
    await page.goto("/trainer");

    await expect(page.getByTestId("status-chip-deployed")).toContainText("1");
    await page.getByTestId("status-chip-deployed").click();
    await expect(page.getByTestId("trainer-section-deployments-body")).toBeVisible();

    // Real per-game slot usage.
    await expect(page.getByTestId("slot-capacity-game-connect4")).toContainText("1 / 3");

    const row = page.getByTestId("deployment-row").filter({ hasText: "dash-deploy-bot" });
    await expect(row.getByTestId("deployment-row-status")).toContainText("active");

    // Pause -> resume -> retire, all against the live API.
    await row.getByTestId("deployment-row-pause").click();
    await expect(row.getByTestId("deployment-row-status")).toContainText("paused");
    await row.getByTestId("deployment-row-resume").click();
    await expect(row.getByTestId("deployment-row-status")).toContainText("active");
    await row.getByTestId("deployment-row-retire").click();
    await row.getByTestId("deployment-row-retire-confirm").click();
    await expect(row.getByTestId("deployment-row-status")).toContainText("retired");
    await expect(page.getByTestId("slot-capacity-game-connect4")).toContainText("0 / 3");
  });

  test("?tab=deployments deep link opens the collapsed section", async ({ page }) => {
    await logInTrainer(page, user);
    await page.goto("/trainer?tab=deployments");
    await expect(page.getByTestId("trainer-section-deployments-body")).toBeVisible();
  });
});

test.describe("Models section is the real model list", () => {
  test("models created by runs appear, with artifact state", async ({ page }) => {
    // Self-sufficient: create both fixtures here so this test (and retries
    // in a fresh worker) never depend on earlier tests' state.
    const withArtifact = await registerSession(api, user, { name: "models-artifact-bot" });
    await completeSession(api, user, withArtifact.jobId);
    await uploadArtifact(api, user, withArtifact.jobId);
    const bare = await registerSession(api, user, { name: "models-bare-bot" });
    await cancelSession(api, user, bare.jobId);

    await logInTrainer(page, user);
    await page.goto("/trainer");
    await page.getByTestId("trainer-section-models-toggle").click();

    const trained = page.getByTestId("model-row").filter({ hasText: "models-artifact-bot" });
    await expect(trained.getByTestId("model-row-artifact")).toContainText("artifact uploaded");
    await expect(
      page.getByTestId("model-row").filter({ hasText: "models-bare-bot" }),
    ).toContainText("no artifact yet");
  });
});

test.describe("Chrome and design tokens", () => {
  test("the n shortcut opens the new-run form", async ({ page }) => {
    await logInTrainer(page, user);
    await page.goto("/trainer");
    await expect(page.getByTestId("trainer-dashboard")).toBeVisible();
    // The listener attaches on mount; retry the press until it lands so a
    // fresh worker (zero chips, no other waitable signal) cannot flake.
    await expect(async () => {
      await page.keyboard.press("n");
      await expect(page).toHaveURL(/\/trainer\/new/, { timeout: 500 });
    }).toPass({ timeout: 10_000 });
  });

  test("new components draw from the design token set, not hardcoded colors", async ({ page }) => {
    await logInTrainer(page, user);
    await page.goto("/trainer");

    const tokenValue = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--color-bg-elevated)";
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    });
    const sectionBg = await page
      .getByTestId("trainer-section-runs")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sectionBg).toBe(tokenValue);
  });
});
