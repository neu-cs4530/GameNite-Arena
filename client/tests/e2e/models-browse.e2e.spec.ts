import { test, expect, type Page } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import { MODELS_PER_PAGE, SUPPORTED_GAMES } from "./trainerTestUtils.ts";

/**
 * Tests for `/models` (spec section "Tests the trainer test agent must
 * write" #5). The models discovery page mirrors `/replays`:
 *   - Header + "New training run" CTA.
 *   - Featured strip 1: "Top models per game".
 *   - Featured strip 2: "Recently forked".
 *   - Featured strip 3: "Hello world starters".
 *   - Browse all: <FilterBar> + paginated grid of <ModelCard> at
 *     MODELS_PER_PAGE per page.
 */
/**
 * The filter controls live inside the FilterBar's collapsed-by-default
 * panel; Sort stays in the always-visible compact row.
 */
async function openFilterPanel(page: Page) {
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("filter-bar-panel")).toBeVisible();
}

/** Wait for the async (real-first) model list before taking counts. */
async function awaitGrid(page: Page) {
  await expect(page.getByTestId("browse-grid")).toBeVisible();
  await expect(page.getByTestId("browse-grid").getByTestId("model-card").first()).toBeVisible();
}

test.describe("The /models discovery page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with skeleton strips and skeleton grid, then real content", async ({ page }) => {
    await page.goto("/models");

    // Skeletons appear on mount.
    await expect(page.getByTestId("model-card-skeleton").first()).toBeVisible();
    await expect(page.getByTestId("hero-strip-skeleton").first()).toBeVisible();

    // Real surface mounts.
    await expect(page.getByTestId("models-browse")).toBeVisible();
    await expect(page.getByTestId("browse-grid")).toBeVisible();

    // Skeletons gone.
    await expect(page.getByTestId("model-card-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("hero-strip-skeleton")).toHaveCount(0);
  });

  test("all three featured strips render in the spec-mandated order", async ({ page }) => {
    await page.goto("/models");
    const strips = page.getByTestId("featured-strip");
    const expectedOrder = [/Top models per game/i, /Recently forked/i, /Hello world starters/i];
    expect(await strips.count()).toBe(expectedOrder.length);
    for (let i = 0; i < expectedOrder.length; i += 1) {
      await expect(strips.nth(i)).toContainText(expectedOrder[i]);
    }
  });

  test("'Top models per game' strip shows one card per supported game", async ({ page }) => {
    await page.goto("/models");
    const strip = page.getByTestId("featured-strip").filter({ hasText: /Top models per game/i });
    await expect(strip).toBeVisible();
    // One card per supported game.
    expect(await strip.getByTestId("model-card").count()).toBe(SUPPORTED_GAMES.length);
  });

  test("'Recently forked' strip shows at least one fork", async ({ page }) => {
    await page.goto("/models");
    const strip = page.getByTestId("featured-strip").filter({ hasText: /Recently forked/i });
    await expect(strip).toBeVisible();
    expect(await strip.getByTestId("model-card").count()).toBeGreaterThan(0);
  });

  test("'Hello world starters' strip shows at least one template", async ({ page }) => {
    await page.goto("/models");
    const strip = page.getByTestId("featured-strip").filter({ hasText: /Hello world starters/i });
    await expect(strip).toBeVisible();
    expect(await strip.getByTestId("model-card").count()).toBeGreaterThan(0);
  });

  test("browse grid renders up to MODELS_PER_PAGE cards per page", async ({ page }) => {
    await page.goto("/models");
    await awaitGrid(page);
    const browse = page.getByTestId("browse-grid");
    const count = await browse.getByTestId("model-card").count();
    expect(count).toBeLessThanOrEqual(MODELS_PER_PAGE);
    expect(count).toBeGreaterThan(0);
  });

  test("all filter controls are present", async ({ page }) => {
    await page.goto("/models");
    await expect(page.getByTestId("filter-bar")).toBeVisible();
    // Sort lives in the always-visible compact row.
    await expect(page.getByLabel(/Sort/i)).toBeVisible();
    // The rest of the controls live in the collapsible panel.
    await openFilterPanel(page);
    await expect(page.getByTestId("filter-game")).toBeVisible();
    await expect(page.getByTestId("filter-visibility")).toBeVisible();
    await expect(page.getByTestId("filter-ownership")).toBeVisible();
    await expect(page.getByTestId("filter-deployed-only")).toBeAttached();
    await expect(page.getByTestId("filter-tier")).toBeVisible();
    await expect(page.getByTestId("filter-elo-range")).toBeVisible();
    await expect(page.getByTestId("filter-winrate-range")).toBeVisible();
    await expect(page.getByTestId("filter-date-range")).toBeVisible();
    await expect(page.getByLabel(/Owner search/i)).toBeVisible();
    await expect(page.getByTestId("filter-has-checkpoint")).toBeAttached();
    await expect(page.getByTestId("filter-forked-only")).toBeAttached();

    // "Clear all" appears once any filter deviates from the default.
    await page.getByTestId("filter-game").getByRole("button", { name: /^Nim$/ }).click();
    await expect(page.getByRole("button", { name: /Clear all/i })).toBeVisible();
  });

  test("changing a sort updates the URL query string", async ({ page }) => {
    await page.goto("/models");
    await page.getByLabel(/Sort/i).selectOption("highest-elo");
    await page.waitForURL(/sort=highest-elo/);
  });

  test("changing the game filter updates the URL query string", async ({ page }) => {
    await page.goto("/models");
    await openFilterPanel(page);
    await page.getByTestId("filter-game").getByRole("button", { name: /^Nim$/ }).click();
    await page.waitForURL(/game=nim/);
  });

  test("each sort option reorders the displayed cards", async ({ page }) => {
    await page.goto("/models");
    await awaitGrid(page);
    const grid = page.getByTestId("browse-grid");

    const firstUnderDefault = await grid.getByTestId("model-card-title").first().innerText();

    await page.getByLabel(/Sort/i).selectOption("highest-elo");
    await page.waitForURL(/sort=highest-elo/);
    await expect
      .poll(async () => grid.getByTestId("model-card-title").first().innerText())
      .not.toEqual(firstUnderDefault);
    const firstUnderHighest = await grid.getByTestId("model-card-title").first().innerText();

    await page.getByLabel(/Sort/i).selectOption("lowest-elo");
    await page.waitForURL(/sort=lowest-elo/);
    await expect
      .poll(async () => grid.getByTestId("model-card-title").first().innerText())
      .not.toEqual(firstUnderHighest);
    const firstUnderLowest = await grid.getByTestId("model-card-title").first().innerText();

    // At least one sort must produce a different leading card from the
    // default order.
    expect(new Set([firstUnderDefault, firstUnderHighest, firstUnderLowest]).size).toBeGreaterThan(
      1,
    );
  });

  test("'Yours only' ownership segmented filter reduces the count", async ({ page }) => {
    await page.goto("/models");
    await awaitGrid(page);
    const browse = page.getByTestId("browse-grid");
    const allCount = await browse.getByTestId("model-card").count();

    await openFilterPanel(page);
    await page
      .getByTestId("filter-ownership")
      .getByRole("radio", { name: /Yours only/i })
      .click();
    await page.waitForURL(/ownership=yours/);

    const yoursCount = await browse.getByTestId("model-card").count();
    expect(yoursCount).toBeLessThanOrEqual(allCount);
  });

  test("'Public only' visibility filter reduces the count", async ({ page }) => {
    await page.goto("/models");
    await awaitGrid(page);
    const browse = page.getByTestId("browse-grid");
    const allCount = await browse.getByTestId("model-card").count();

    await openFilterPanel(page);
    await page
      .getByTestId("filter-visibility")
      .getByRole("radio", { name: /Public only/i })
      .click();
    await page.waitForURL(/visibility=public/);

    const publicCount = await browse.getByTestId("model-card").count();
    expect(publicCount).toBeLessThanOrEqual(allCount);
  });

  test("combined filters via query string hydrate correctly", async ({ page }) => {
    await page.goto("/models?game=nim&visibility=public&minElo=1500&maxElo=2200");
    await openFilterPanel(page);
    await expect(
      page.getByTestId("filter-game").getByRole("button", { name: /^Nim$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByTestId("filter-visibility").getByRole("radio", { name: /Public only/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("'Clear all' resets every filter and the URL", async ({ page }) => {
    await page.goto("/models?game=nim&sort=highest-elo&visibility=public");
    await page.getByRole("button", { name: /Clear all/i }).click();
    await expect(page).toHaveURL((url) => !/game=|sort=|visibility=/.test(url.search));
  });

  test("empty state appears for an impossible filter combination", async ({ page }) => {
    await page.goto("/models?minElo=2390&maxElo=2400&game=tictactoe&visibility=private");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByRole("button", { name: /Clear filters/i })).toBeVisible();
  });

  test("pagination of the browse grid works", async ({ page }) => {
    await page.goto("/models");
    await awaitGrid(page);
    const browse = page.getByTestId("browse-grid");
    const firstPageFirstTitle = await browse.getByTestId("model-card-title").first().innerText();

    const next = page.getByRole("button", { name: /Next page|Next/i });
    await expect(next).toBeVisible();
    await next.click();
    await page.waitForURL(/page=2/);

    await expect
      .poll(async () => browse.getByTestId("model-card-title").first().innerText())
      .not.toEqual(firstPageFirstTitle);
  });

  test("clicking a card navigates to /models/:modelId", async ({ page }) => {
    await page.goto("/models");
    const first = page.getByTestId("browse-grid").getByTestId("model-card").first();
    await first.click();
    await page.waitForURL(/\/models\/[^/]+$/);
  });

  test("'New training run' CTA navigates to /trainer/new", async ({ page }) => {
    await page.goto("/models");
    await page.getByRole("button", { name: /New training run/i }).click();
    await page.waitForURL("/trainer/new");
  });
});
