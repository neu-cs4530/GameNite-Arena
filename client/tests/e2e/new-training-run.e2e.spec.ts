/**
 * The register-a-run form (local-first): it captures game, name, and
 * config, registers a REAL queued session, and hands off to the live
 * page's connect-your-trainer state.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  completeSession,
  logInTrainer,
  registerSession,
  reportProgress,
  signupTrainerUser,
  type TrainerUser,
} from "./realTrainerUtils.ts";

let user: TrainerUser;
let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  user = await signupTrainerUser(api, "e2e_newrun");
});

test.afterAll(async () => {
  await api.dispose();
});

test.beforeEach(async ({ page }) => {
  await logInTrainer(page, user);
  await page.goto("/trainer/new");
});

test.describe("The form", () => {
  test("renders the local-first essentials and nothing else", async ({ page }) => {
    await expect(page.getByTestId("new-training-run")).toBeVisible();
    await expect(page.getByTestId("model-name-input")).toBeVisible();
    await expect(page.getByTestId("local-first-note")).toContainText(
      "Training happens on your machine",
    );
    // The fictions are gone: no cost estimator, no upload tab, no notify toggle.
    await expect(page.getByTestId("cost-estimator")).toHaveCount(0);
    await expect(page.getByTestId("upload-zone")).toHaveCount(0);
  });

  test("game selection is single-select", async ({ page }) => {
    await page.getByRole("radio", { name: "Connect 4" }).click();
    await expect(page.getByRole("radio", { name: "Connect 4" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "Nim" }).click();
    await expect(page.getByRole("radio", { name: "Nim" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Connect 4" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("register stays disabled until the run has a name", async ({ page }) => {
    await expect(page.getByTestId("register-run")).toBeDisabled();
    await page.getByTestId("model-name-input").fill("my-honest-bot");
    await expect(page.getByTestId("register-run")).toBeEnabled();
  });

  test("episode bounds are enforced at the input", async ({ page }) => {
    await page.getByTestId("model-name-input").fill("bounds-bot");
    await page.getByLabel(/Episode count/i).fill("20000000");
    // HyperparamInput refuses the out-of-range commit and says why.
    await expect(page.getByText(/Must be ≤ 10000000/i)).toBeVisible();
  });
});

test.describe("Registration hands off to the live page", () => {
  test("submitting registers a REAL queued session and shows the attach command", async ({
    page,
  }) => {
    const name = `form-bot-${Date.now().toString(36)}`;
    await page.getByTestId("model-name-input").fill(name);
    await page.getByTestId("register-run").click();

    await expect(page).toHaveURL(/\/trainer\/jobs\/.+/, { timeout: 10_000 });
    await expect(page.getByTestId("connect-trainer-card")).toBeVisible();
    const jobId = page.url().split("/trainer/jobs/")[1];
    // The attach command is masked behind a copy button — the job id and token
    // are never printed on the page.
    await expect(page.getByTestId("connect-trainer-command-copy")).toHaveText("Copy command");
    await expect(page.getByTestId("connect-trainer-command")).not.toContainText(jobId);

    // The registered session is real: the API can report against it.
    const status = await reportProgress(api, user, jobId, 5);
    expect(status).toBe("running");
    await completeSession(api, user, jobId);
  });

  test("fromJob prefills from a real source run", async ({ page }) => {
    const source = await registerSession(api, user, {
      name: "rerun-source-bot",
      episodes: 4242,
      learningRate: 0.005,
    });
    await completeSession(api, user, source.jobId);

    await page.goto(`/trainer/new?fromJob=${source.jobId}`);
    await expect(page.getByTestId("model-name-input")).toHaveValue("rerun-source-bot");
    await expect(page.getByLabel(/Episode count/i)).toHaveValue("4242");
  });
});
