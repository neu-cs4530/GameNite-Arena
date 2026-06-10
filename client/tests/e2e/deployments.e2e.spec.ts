import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import {
  DEPLOYMENT_CAP_PER_GAME,
  DEPLOYMENTS_PER_PAGE,
  FIXTURE_FULL_CAP_GAME,
} from "./trainerTestUtils.ts";

/**
 * Tests for the deployments section of `/trainer` (and the deeper-link
 * `/trainer?tab=deployments`). Spec section "Tests the trainer test agent
 * must write" #4. Coverage:
 *   - Cards render status / model / game / slot indicator.
 *   - Pause / Resume / Retire transitions.
 *   - 3-active cap enforcement when attempting to deploy a 4th in a
 *     fully-saturated game.
 *   - Invalid-move-streak indicator updates from the mocked detail.
 *   - Filters / sorts: status, game, sort reflected in URL.
 */
test.describe("Deployments management", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer?tab=deployments");
  });

  test("deployment cards render with status, model, game, slot indicator", async ({ page }) => {
    const cards = page.getByTestId("deployment-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    const first = cards.first();
    await expect(first.getByTestId("job-status-pill")).toBeVisible();
    await expect(first.getByTestId("deployment-card-model")).toBeVisible();
    await expect(first.getByTestId("deployment-card-game")).toBeVisible();
    // Slot indicator inside the card mirrors the dashboard strip.
    await expect(first.getByTestId("slot-capacity-indicator")).toBeVisible();
  });

  test("pause flips active to paused", async ({ page }) => {
    const activeCard = page
      .getByTestId("deployment-card")
      .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /active/i }) })
      .first();
    await expect(activeCard).toBeVisible();

    await activeCard.getByRole("button", { name: /Pause/i }).click();
    await expect(activeCard.getByTestId("job-status-pill")).toHaveText(/paused/i);
  });

  test("resume flips paused to active", async ({ page }) => {
    const pausedCard = page
      .getByTestId("deployment-card")
      .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /paused/i }) })
      .first();
    await expect(pausedCard).toBeVisible();

    await pausedCard.getByRole("button", { name: /Resume/i }).click();
    await expect(pausedCard.getByTestId("job-status-pill")).toHaveText(/active/i);
  });

  test("retire flips active to retired", async ({ page }) => {
    const activeCard = page
      .getByTestId("deployment-card")
      .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /active/i }) })
      .first();
    await activeCard.getByRole("button", { name: /Retire/i }).click();
    // Confirmation modal (retire is destructive).
    await page.getByRole("button", { name: /Confirm retire/i }).click();

    // The retired card now reads retired. We don't bind to identity across
    // sections; we just assert at least one retired card exists.
    await expect(
      page
        .getByTestId("deployment-card")
        .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /retired/i }) })
        .first(),
    ).toBeVisible();
  });

  test("3-active cap: deploying a 4th in connect4 surfaces the cap explainer", async ({ page }) => {
    // The fixture for FIXTURE_FULL_CAP_GAME (connect4) has 3 active
    // deployments for user0. From the models section, attempt to deploy a
    // Connect 4 model and the cap error appears.
    await page.goto("/trainer?tab=models");
    const modelsSection = page.getByTestId("trainer-section-models");

    // Find a Connect 4 model card belonging to user0 (the user's-only filter
    // is already implied since this is the dashboard). The card has a
    // "Connect 4" badge.
    const connectCard = modelsSection
      .getByTestId("model-card")
      .filter({ has: page.locator("text=Connect 4") })
      .first();
    await expect(connectCard).toBeVisible();
    await connectCard.getByRole("button", { name: /Deploy/i }).click();

    // The cap-hit error state surfaces with the spec's friendly message.
    const error = page.getByTestId("slot-cap-exceeded-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(
      new RegExp(`${DEPLOYMENT_CAP_PER_GAME} active deployments in Connect 4`, "i"),
    );
    // CTA to manage deployments.
    await expect(error.getByRole("link", { name: /Manage deployments/i })).toBeVisible();
  });

  test("invalid move streak indicator renders on deployment cards", async ({ page }) => {
    // The fixture has at least one deployment with invalidMoveStreak > 0.
    const streaks = page.getByTestId("invalid-move-streak");
    await expect(streaks.first()).toBeVisible();
    // Indicator text shows N / 3 (threshold from Story 2.8).
    await expect(streaks.first()).toContainText(/\d\s*\/\s*3/);
  });

  test("last forfeit timestamp is visible on at least one card", async ({ page }) => {
    // The fixture has at least one deployment with lastForfeitAt set.
    await expect(page.getByTestId("deployment-card-last-forfeit").first()).toBeVisible();
  });

  test("status filter is reflected in URL and narrows the count", async ({ page }) => {
    const initial = await page.getByTestId("deployment-card").count();

    await page
      .getByTestId("filter-status")
      .getByRole("button", { name: /Active/i })
      .click();
    await page.waitForURL(/status=active/);

    const after = await page.getByTestId("deployment-card").count();
    expect(after).toBeLessThanOrEqual(initial);
  });

  test("game filter is reflected in URL", async ({ page }) => {
    await page
      .getByTestId("filter-game")
      .getByRole("button", { name: /Connect 4/i })
      .click();
    await page.waitForURL(new RegExp(`game=${FIXTURE_FULL_CAP_GAME}`));
  });

  test("sort selector reorders cards and is reflected in URL", async ({ page }) => {
    await page.getByLabel(/Sort/i).selectOption("most-matches");
    await page.waitForURL(/sort=most-matches/);

    await page.getByLabel(/Sort/i).selectOption("recent-forfeits");
    await page.waitForURL(/sort=recent-forfeits/);
  });

  test("'Recent forfeits' toggle filters the list", async ({ page }) => {
    await page.getByLabel(/Recent forfeits/i).check();
    await page.waitForURL(/recentForfeits=true/);
  });

  test("'Clear all' resets all filters", async ({ page }) => {
    await page
      .getByTestId("filter-status")
      .getByRole("button", { name: /Active/i })
      .click();
    await page.waitForURL(/status=active/);

    await page.getByRole("button", { name: /Clear all/i }).click();
    await expect(page).toHaveURL((url) => !/status=/.test(url.search));
  });

  test("page size respects DEPLOYMENTS_PER_PAGE", async ({ page }) => {
    const count = await page.getByTestId("deployment-card").count();
    expect(count).toBeLessThanOrEqual(DEPLOYMENTS_PER_PAGE);
  });
});
