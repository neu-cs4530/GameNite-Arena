import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import {
  DEPLOYMENT_CAP_PER_GAME,
  FIXTURE_FULL_CAP_GAME,
  SUPPORTED_GAMES,
} from "./trainerTestUtils.ts";

/**
 * Tests for `/trainer` (spec section "Tests the trainer test agent must
 * write" #1). The dashboard is the home for AI training and is laid out
 * top-to-bottom as:
 *   1. Header (title, subtitle, "Start a new training run" CTA, hello-world)
 *   2. Slot capacity strip
 *   3. Active training runs (queued / running)
 *   4. Recent completed runs (completed / failed / canceled)
 *   5. Your deployments grid
 *   6. Your models grid
 *
 * Skeleton elements MUST expose `data-testid="skeleton"` so we can assert
 * their presence/absence; component-specific skeletons also expose the more
 * specific testids listed in the spec.
 */
test.describe("The trainer dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with skeletons in each section, then real content", async ({ page }) => {
    await page.goto("/trainer");

    // Section-specific skeletons appear immediately on mount.
    await expect(page.getByTestId("training-job-card-skeleton").first()).toBeVisible();
    await expect(page.getByTestId("deployment-card-skeleton").first()).toBeVisible();
    await expect(page.getByTestId("model-card-skeleton").first()).toBeVisible();

    // The real dashboard surface mounts.
    await expect(page.getByTestId("trainer-dashboard")).toBeVisible();

    // Once data loads, the skeletons are gone.
    await expect(page.getByTestId("training-job-card-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("deployment-card-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("model-card-skeleton")).toHaveCount(0);
  });

  test("header renders title, subtitle, primary CTA, and hello-world button", async ({ page }) => {
    await page.goto("/trainer");
    await expect(page.getByRole("heading", { name: /AI Trainer/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start a new training run/i })).toBeVisible();
    await expect(page.getByTestId("hello-world-template-button")).toBeVisible();
  });

  test("slot capacity strip renders one indicator per supported game with cap of 3", async ({
    page,
  }) => {
    await page.goto("/trainer");
    const strip = page.getByTestId("slot-capacity-indicator");
    await expect(strip.first()).toBeVisible();

    // Expect exactly one slot indicator per supported game.
    expect(await strip.count()).toBe(SUPPORTED_GAMES.length);

    // Each game-specific indicator carries its own testid and shows "/ 3".
    for (const game of SUPPORTED_GAMES) {
      const gameIndicator = page.getByTestId(`slot-capacity-game-${game}`);
      await expect(gameIndicator).toBeVisible();
      await expect(gameIndicator).toContainText(new RegExp(`/\\s*${DEPLOYMENT_CAP_PER_GAME}`));
    }
  });

  test("slot capacity for connect4 shows the full cap (3/3 used) from the fixture", async ({
    page,
  }) => {
    await page.goto("/trainer");
    const fullCap = page.getByTestId(`slot-capacity-game-${FIXTURE_FULL_CAP_GAME}`);
    await expect(fullCap).toBeVisible();
    await expect(fullCap).toContainText(
      new RegExp(`${DEPLOYMENT_CAP_PER_GAME}\\s*/\\s*${DEPLOYMENT_CAP_PER_GAME}`),
    );
  });

  test("active training runs section renders cards for running/queued jobs only", async ({
    page,
  }) => {
    await page.goto("/trainer");
    const activeSection = page.getByTestId("trainer-section-active-jobs");
    await expect(activeSection).toBeVisible();

    const cards = activeSection.getByTestId("training-job-card");
    expect(await cards.count()).toBeGreaterThan(0);

    // Every active card has a status pill that reads queued or running.
    const pills = activeSection.getByTestId("job-status-pill");
    const pillCount = await pills.count();
    for (let i = 0; i < pillCount; i += 1) {
      await expect(pills.nth(i)).toHaveText(/queued|running/i);
    }

    // Each running card has a progress chart (sparkline) and a live dot.
    await expect(activeSection.getByTestId("job-progress-chart").first()).toBeVisible();
  });

  test("recent completed runs section shows download/deploy buttons where appropriate", async ({
    page,
  }) => {
    await page.goto("/trainer");
    const recentSection = page.getByTestId("trainer-section-recent-jobs");
    await expect(recentSection).toBeVisible();

    const cards = recentSection.getByTestId("training-job-card");
    expect(await cards.count()).toBeGreaterThan(0);

    // At least one completed card exposes a "Download .pth" button.
    await expect(
      recentSection.getByRole("button", { name: /Download .pth/i }).first(),
    ).toBeVisible();

    // At least one completed card exposes a "Deploy" button.
    await expect(recentSection.getByRole("button", { name: /^Deploy$/ }).first()).toBeVisible();

    // Status pills in this section never read "queued" or "running".
    const pills = recentSection.getByTestId("job-status-pill");
    const pillCount = await pills.count();
    for (let i = 0; i < pillCount; i += 1) {
      await expect(pills.nth(i)).toHaveText(/completed|failed|canceled/i);
    }
  });

  test("your deployments section shows status, pause/resume/retire, and 'playing live'", async ({
    page,
  }) => {
    await page.goto("/trainer");
    const deploymentsSection = page.getByTestId("trainer-section-deployments");
    await expect(deploymentsSection).toBeVisible();

    const cards = deploymentsSection.getByTestId("deployment-card");
    expect(await cards.count()).toBeGreaterThan(0);

    // Pause / Resume / Retire controls are present on at least one active card.
    const activeCard = cards
      .filter({ has: page.getByTestId("job-status-pill").filter({ hasText: /active/i }) })
      .first();
    await expect(activeCard.getByRole("button", { name: /Pause/i })).toBeVisible();
    await expect(activeCard.getByRole("button", { name: /Retire/i })).toBeVisible();
    // Story 2.6: a "playing live" indicator on each active deployment.
    await expect(activeCard.getByTestId("playing-live-indicator")).toBeVisible();
  });

  test("your models section shows deploy and fork buttons on each card", async ({ page }) => {
    await page.goto("/trainer");
    const modelsSection = page.getByTestId("trainer-section-models");
    await expect(modelsSection).toBeVisible();

    const cards = modelsSection.getByTestId("model-card");
    expect(await cards.count()).toBeGreaterThan(0);

    // First card has deploy + fork.
    const firstCard = cards.first();
    await expect(firstCard.getByTestId("fork-button")).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Deploy/i })).toBeVisible();
  });

  test("'Start a new training run' navigates to /trainer/new", async ({ page }) => {
    await page.goto("/trainer");
    await page.getByRole("button", { name: /Start a new training run/i }).click();
    await page.waitForURL("/trainer/new");
  });

  test("'Hello world template' navigates to /trainer/new with template prefilled", async ({
    page,
  }) => {
    await page.goto("/trainer");
    await page.getByTestId("hello-world-template-button").click();
    // The dashboard's hello-world button deep-links to the new-run form with
    // a `fromTemplate=hello-world` query param so the form pre-fills.
    await page.waitForURL(/\/trainer\/new\?.*fromTemplate=hello-world/);
  });

  test("tab query string deep-links a section", async ({ page }) => {
    // ?tab=deployments scrolls / focuses the deployments section. We assert
    // the section is in viewport rather than scroll position which can be
    // browser-specific.
    await page.goto("/trainer?tab=deployments");
    await expect(page.getByTestId("trainer-section-deployments")).toBeInViewport();
  });

  test("filter bar on deployments section is present", async ({ page }) => {
    await page.goto("/trainer");
    const deploymentsSection = page.getByTestId("trainer-section-deployments");
    await expect(deploymentsSection.getByTestId("filter-bar")).toBeVisible();
  });

  test("filter bar on models section is present", async ({ page }) => {
    await page.goto("/trainer");
    const modelsSection = page.getByTestId("trainer-section-models");
    await expect(modelsSection.getByTestId("filter-bar")).toBeVisible();
  });

  test("no models empty state offers a 'Start your first training run' CTA", async ({ page }) => {
    // Filter the models section to a guaranteed-empty state. The owner search
    // for a never-used string produces zero results.
    await page.goto("/trainer?modelOwner=NEVER_EXISTS_qqq");
    const modelsSection = page.getByTestId("trainer-section-models");
    await expect(modelsSection.getByTestId("empty-state")).toBeVisible();
    await expect(
      modelsSection.getByRole("button", { name: /Start your first training run/i }),
    ).toBeVisible();
  });
});
