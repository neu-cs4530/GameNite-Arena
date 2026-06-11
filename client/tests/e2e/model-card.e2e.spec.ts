import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import { FIXTURE_FIRST_MODEL_ID } from "./trainerTestUtils.ts";

/**
 * Tests for `/models/:modelId` (spec section "Tests the trainer test agent
 * must write" #6). The public model card has:
 *   1. Header: name, owner, game, visibility, fork count, fork button,
 *      "Deploy" if owner.
 *   2. Stats grid: win rate, avg latency, per-game Elo via <TierBadge>.
 *   3. Lineage: "Forked from X" if set.
 *   4. Training history list.
 *   5. Deployments list.
 *   6. Recent match performance (reuses <MatchCard>).
 *
 * The first fixture model (`FIXTURE_FIRST_MODEL_ID`) is user0-owned, public,
 * Nim, with at least one active deployment associated.
 */
test.describe("The /models/:modelId page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with skeletons, then renders the full card surface", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);

    // Skeleton on mount.
    await expect(page.getByTestId("model-card-page-skeleton")).toBeVisible();

    // Real surface mounts.
    await expect(page.getByTestId("model-card-page")).toBeVisible();
    await expect(page.getByTestId("model-card-page-skeleton")).toHaveCount(0);
  });

  test("header renders name, owner, game badge, visibility badge, and fork count", async ({
    page,
  }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const header = page.getByTestId("model-card-page-header");
    await expect(header).toBeVisible();
    // Owner is user0 ("The Knight Of Games").
    await expect(header).toContainText(/The Knight Of Games|user0/i);
    // Public visibility badge.
    await expect(header).toContainText(/Public/i);
    // Game badge: Nim.
    await expect(header).toContainText(/Nim/i);
    // Fork count is a number.
    await expect(header.getByTestId("fork-count")).toContainText(/\d+/);
  });

  test("stats grid renders win rate, avg latency, per-game Elo, matches, days since training", async ({
    page,
  }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    await expect(page.getByTestId("stat-winrate")).toBeVisible();
    await expect(page.getByTestId("stat-avg-latency")).toBeVisible();
    await expect(page.getByTestId("stat-elo-per-game")).toBeVisible();
    await expect(page.getByTestId("stat-matches-total")).toBeVisible();
    await expect(page.getByTestId("stat-days-since-training")).toBeVisible();
  });

  test("per-game Elo uses the replay-primitive <TierBadge>", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    // The stat-elo-per-game section renders a TierBadge for each game.
    const tier = page
      .getByTestId("stat-elo-per-game")
      .getByTestId(/^tier-badge-/)
      .first();
    await expect(tier).toBeVisible();
    const testId = await tier.getAttribute("data-testid");
    expect(testId).toMatch(/^tier-badge-(bronze|silver|gold|platinum|diamond)$/);
  });

  test("public model owned by you shows BOTH Fork and Deploy buttons", async ({ page }) => {
    // FIXTURE_FIRST_MODEL_ID is public + owned by user0.
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    await expect(page.getByTestId("fork-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /Deploy/i })).toBeVisible();
  });

  test("private model owned by you shows Deploy button but NOT a Fork button", async ({ page }) => {
    // The mock fixture should include a private user0 model at this id.
    // user0-owned private connect4 model.
    await page.goto("/models/mock-model-3");
    await expect(page.getByRole("button", { name: /Deploy/i })).toBeVisible();
    await expect(page.getByTestId("fork-button")).not.toBeVisible();
  });

  test("public model NOT owned by you shows Fork but no Deploy", async ({ page }) => {
    // Other-user public model.
    // user1-owned public model.
    await page.goto("/models/mock-model-18");
    await expect(page.getByTestId("fork-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /Deploy/i })).not.toBeVisible();
  });

  test("forked-from link navigates to the parent model card", async ({ page }) => {
    // A fixture model with forkedFrom set lives at this id.
    // user0 fork whose parent (mock-model-11) exists in the fixture.
    await page.goto("/models/mock-model-12");
    const lineage = page.getByTestId("model-lineage");
    await expect(lineage).toBeVisible();
    await lineage.getByRole("link", { name: /Forked from/i }).click();
    await page.waitForURL(/\/models\/[^/]+$/);
  });

  test("Deploy button respects the slot cap (disabled with explainer when full)", async ({
    page,
  }) => {
    // Connect 4 model owned by user0 with the cap saturated.
    // user0 connect4 model; the fixture saturates the cap with 3 active deployments.
    await page.goto("/models/mock-model-5");
    const deploy = page.getByRole("button", { name: /^Deploy$/ });
    await expect(deploy).toBeDisabled();
    await expect(page.getByText(/3 active deployments in Connect 4/i)).toBeVisible();
  });

  test("training history section lists past TrainingJobCards for this model", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const history = page.getByTestId("model-training-history");
    await expect(history).toBeVisible();
    expect(await history.getByTestId("training-job-card").count()).toBeGreaterThan(0);
  });

  test("deployments section lists DeploymentCards", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const deployments = page.getByTestId("model-deployments");
    await expect(deployments).toBeVisible();
    expect(await deployments.getByTestId("deployment-card").count()).toBeGreaterThan(0);
  });

  test("recent match performance reuses the replay <MatchCard>", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    const matches = page.getByTestId("model-recent-matches");
    await expect(matches).toBeVisible();
    expect(await matches.getByTestId("match-card").count()).toBeGreaterThan(0);
  });

  test("Fork button navigates to /models/:modelId/fork", async ({ page }) => {
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}`);
    await page.getByTestId("fork-button").click();
    await page.waitForURL(`/models/${FIXTURE_FIRST_MODEL_ID}/fork`);
  });

  test("unknown modelId renders an error state", async ({ page }) => {
    await page.goto("/models/this-model-does-not-exist");
    await expect(page.getByTestId("error-state")).toBeVisible();
    await expect(page.getByText(/model not found/i)).toBeVisible();
  });
});
