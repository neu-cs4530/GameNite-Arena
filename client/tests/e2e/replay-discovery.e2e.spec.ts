import { test, expect, type Page } from "@playwright/test";
import { DISCOVERY_MATCHES_PER_PAGE, logIn } from "./replayTestUtils.ts";

/**
 * Tests for the `/replays` discovery page.
 *
 * The page renders, top-to-bottom:
 *   1. Page header.
 *   2. The collapsible ReplayFilterBar with an always-visible single-select
 *      preset pill row ("Popular this week" is the default) plus the compact
 *      sort/chips header; the heavy controls collapse behind the toggle.
 *   3. ONE paginated browse grid (24 per page). The old featured strips are
 *      gone — their categories live on as presets.
 *
 * Presets expand CLIENT-SIDE into concrete filter values (sort / date /
 * participantType; "Upsets" keeps its `preset=upsets` flag), so the URL and
 * the service request only ever carry concrete params. Assertions here are
 * data-robust: they check structure and behavior, not exact fixture counts.
 */

const PRESET_KEYS = [
  "popular-week",
  "most-viewed-today",
  "ai-vs-human",
  "top-rated",
  "upsets",
  "newest",
] as const;

const DEFAULT_PRESET_KEY = "popular-week";

function pill(page: Page, key: string) {
  return page.getByTestId(`filter-preset-${key}`);
}

/** All preset pills currently in the selected state. */
function pressedPills(page: Page) {
  return page.locator('[data-testid^="filter-preset-"][aria-pressed="true"]');
}

/** Either the populated grid or the empty state — one of them must show. */
function gridOrEmpty(page: Page) {
  return page.getByTestId("browse-grid").or(page.getByTestId("empty-state"));
}

test.describe("The /replays discovery page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("renders one filterable grid with the default preset and no featured strips", async ({
    page,
  }) => {
    await page.goto("/replays");

    await expect(page.getByTestId("filter-bar")).toBeVisible();
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByTestId("browse-grid")).toBeVisible();
    expect(await page.getByTestId("browse-grid").getByTestId("match-card").count()).toBeGreaterThan(
      0,
    );

    // The four featured strips are gone for good.
    await expect(page.getByTestId("featured-strip")).toHaveCount(0);
    await expect(page.getByTestId("hero-strip")).toHaveCount(0);

    // The default state is the empty URL — presets only write params when
    // they deviate from the default expansion.
    expect(new URL(page.url()).search).toBe("");
  });

  test("shows all six preset pills with exactly one selected", async ({ page }) => {
    await page.goto("/replays");
    // The preset row lives ABOVE the collapsible panel: visible without
    // touching the Filters toggle.
    await expect(page.getByTestId("filter-presets")).toBeVisible();
    for (const key of PRESET_KEYS) {
      await expect(pill(page, key)).toBeVisible();
    }
    await expect(pressedPills(page)).toHaveCount(1);
  });

  test("caps the grid at 24 cards per page", async ({ page }) => {
    await page.goto("/replays");
    await expect(page.getByTestId("browse-grid")).toBeVisible();
    const cards = page.getByTestId("browse-grid").getByTestId("match-card");
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.count()).toBeLessThanOrEqual(DISCOVERY_MATCHES_PER_PAGE);
  });

  test("'Most viewed today' expands client-side into concrete query params", async ({ page }) => {
    await page.goto("/replays");

    // The service must be asked for the *expanded* filters — the server's
    // `preset` query param is unimplemented, so only concrete values go out.
    const listRequest = page.waitForRequest(
      (req) => req.url().includes("/api/replay/list") && req.url().includes("date=today"),
    );
    await pill(page, "most-viewed-today").click();
    await listRequest;

    // sort=most-viewed equals the default baseline, so only `date` lands in
    // the page URL.
    await page.waitForURL(/date=today/);
    expect(page.url()).not.toMatch(/preset=/);

    await expect(pill(page, "most-viewed-today")).toHaveAttribute("aria-pressed", "true");
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "false");
    await expect(gridOrEmpty(page)).toBeVisible();
  });

  test("'AI vs Human' applies participant type, sort and date in one click", async ({ page }) => {
    await page.goto("/replays");
    await pill(page, "ai-vs-human").click();

    await page.waitForURL(/participantType=mixed/);
    await page.waitForURL(/sort=newest/);
    await page.waitForURL(/date=all/);

    await expect(pill(page, "ai-vs-human")).toHaveAttribute("aria-pressed", "true");
    await expect(gridOrEmpty(page)).toBeVisible();
  });

  test("'Upsets' keeps its preset flag in the URL", async ({ page }) => {
    await page.goto("/replays");
    await pill(page, "upsets").click();
    await page.waitForURL(/preset=upsets/);
    await expect(pill(page, "upsets")).toHaveAttribute("aria-pressed", "true");
    await expect(gridOrEmpty(page)).toBeVisible();
  });

  test("presets are single-select: picking one replaces the previous", async ({ page }) => {
    await page.goto("/replays");

    await pill(page, "top-rated").click();
    await page.waitForURL(/sort=highest-elo/);
    await expect(pill(page, "top-rated")).toHaveAttribute("aria-pressed", "true");

    await pill(page, "newest").click();
    await page.waitForURL(/sort=newest/);
    await expect(pill(page, "newest")).toHaveAttribute("aria-pressed", "true");
    await expect(pill(page, "top-rated")).toHaveAttribute("aria-pressed", "false");
    await expect(pressedPills(page)).toHaveCount(1);
  });

  test("manually changing a preset-controlled filter deselects the active pill", async ({
    page,
  }) => {
    await page.goto("/replays");
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");

    // Sort lives in the always-visible compact header.
    await page.getByLabel("Sort").selectOption("oldest");
    await page.waitForURL(/sort=oldest/);

    await expect(pressedPills(page)).toHaveCount(0);
  });

  test("panel filters compose with the active preset via chips and the count badge", async ({
    page,
  }) => {
    await page.goto("/replays");

    await page.getByTestId("filter-toggle").click();
    await page.getByTestId("filter-game").getByRole("button", { name: "Nim" }).click();
    await page.waitForURL(/game=nim/);

    // Orthogonal filters do NOT kick the preset out.
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");

    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips).toContainText("Nim");
    await expect(page.getByTestId("filter-active-count")).toHaveText("1");

    // Removing the chip clears just that filter.
    await page.getByRole("button", { name: "Remove Game: Nim filter" }).click();
    await page.waitForURL((url) => !url.searchParams.has("game"));
    await expect(chips).toHaveCount(0);
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");
  });

  test("Clear all restores the default preset and then hides itself", async ({ page }) => {
    await page.goto("/replays");

    // A non-default preset alone is enough to make Clear all appear.
    await pill(page, "newest").click();
    await page.waitForURL(/sort=newest/);
    await expect(page.getByTestId("filter-clear-all")).toBeVisible();

    await page.getByTestId("filter-clear-all").click();
    await page.waitForURL((url) => !url.searchParams.has("sort") && !url.searchParams.has("date"));

    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");
    // Pristine default state: nothing to clear.
    await expect(page.getByTestId("filter-clear-all")).toHaveCount(0);
    await expect(page.getByTestId("browse-grid")).toBeVisible();
  });

  test("the collapsible panel exposes the full filter control set", async ({ page }) => {
    await page.goto("/replays");

    await expect(page.getByTestId("filter-bar-panel")).toHaveCount(0);
    await page.getByTestId("filter-toggle").click();
    await expect(page.getByTestId("filter-bar-panel")).toBeVisible();

    await expect(page.getByLabel("Sort")).toBeVisible();
    await expect(page.getByTestId("filter-game")).toBeVisible();
    await expect(page.getByTestId("filter-participant-type")).toBeVisible();
    await expect(page.getByTestId("filter-result")).toBeVisible();
    await expect(page.getByTestId("filter-elo-range")).toBeVisible();
    await expect(page.getByTestId("filter-date-range")).toBeVisible();
    await expect(page.getByTestId("filter-move-count")).toBeVisible();
    await expect(page.getByLabel("Search participants")).toBeVisible();
    await expect(page.getByLabel("Rated only")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("filter-bar-panel")).toHaveCount(0);
  });

  test("deep links hydrate both the controls and the preset row", async ({ page }) => {
    // Only the deviation from the default expansion needs to be in the URL.
    await page.goto("/replays?date=today");
    await expect(pill(page, "most-viewed-today")).toHaveAttribute("aria-pressed", "true");

    // A fully explicit expansion also resolves to its pill.
    await page.goto("/replays?sort=newest&date=all&participantType=mixed");
    await expect(pill(page, "ai-vs-human")).toHaveAttribute("aria-pressed", "true");
    await expect(pressedPills(page)).toHaveCount(1);
  });

  test("shows an empty state with a working reset when nothing matches", async ({ page }) => {
    await page.goto(
      "/replays?minElo=2380&maxElo=2400&game=tictactoe&rated=true&participant=zzz-no-such-player",
    );
    await expect(page.getByTestId("empty-state")).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("browse-grid")).toBeVisible();
    await expect(pill(page, DEFAULT_PRESET_KEY)).toHaveAttribute("aria-pressed", "true");
  });

  test("paginates the grid when the data spans multiple pages", async ({ page }) => {
    await page.goto("/replays");
    await expect(page.getByTestId("browse-grid")).toBeVisible();

    // <Pagination> renders nothing when everything fits on one page; the
    // seed size is not this test's contract, so skip rather than fail.
    const next = page.getByRole("button", { name: "Next page" });
    test.skip((await next.count()) === 0, "seed fits on a single page");

    await next.click();
    await page.waitForURL(/page=2/);
    expect(await page.getByTestId("browse-grid").getByTestId("match-card").count()).toBeGreaterThan(
      0,
    );
  });

  test("clicking a card navigates to /replays/:matchId", async ({ page }) => {
    await page.goto("/replays");
    await page.getByTestId("browse-grid").getByTestId("match-card").first().click();
    await page.waitForURL(/\/replays\/[^/]+$/);
  });
});
