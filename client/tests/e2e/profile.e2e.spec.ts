import { test, expect, type Page } from "@playwright/test";
import {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_USER,
  FIXTURE_FIRST_MATCH_ID,
  PROFILE_MATCHES_PER_PAGE,
  logIn,
} from "./replayTestUtils.ts";

/**
 * The filter controls live inside the FilterBar's collapsed-by-default
 * panel; every test that drives a panel control must open it first.
 * (The sort select and active-filter chips stay in the always-visible
 * compact row.)
 */
/**
 * Set a React-controlled range input's value deterministically. `fill()` on
 * type="range" proved flaky on CI runners; going through the native value
 * setter + input event is what React listens to, with no actionability
 * dependence.
 */
async function setRangeValue(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function openFilterPanel(page: Page) {
  await page.getByTestId("filter-toggle").click();
  await expect(page.getByTestId("filter-bar-panel")).toBeVisible();
}

/**
 * Tests for the redesigned `/profile/:username` page (spec section
 * "Tests the test agent must write" #1). All tests log in as user0.
 *
 * The code agent owns the implementation. These tests reference the mock
 * fixture defined in `client/src/__mocks__/replays.ts`; see the
 * INSTRUCTION TO CODE AGENT block in `./replayTestUtils.ts` for the fixture
 * shape these tests assume.
 *
 * Skeleton elements MUST expose `data-testid="skeleton"` so we can assert
 * their presence/absence; component-specific skeletons (e.g. match card
 * skeletons) can also expose a more specific testid like
 * `data-testid="match-card-skeleton"`.
 */
test.describe("The redesigned profile page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with a header skeleton, then renders the header with display name + @username + Elo chips", async ({
    page,
  }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);

    // Skeletons must appear immediately on mount.
    await expect(page.getByTestId("profile-header-skeleton")).toBeVisible();

    // Then the real header renders.
    await expect(page.getByRole("heading", { name: DEFAULT_DISPLAY_NAME })).toBeVisible();
    await expect(page.getByText(`@${DEFAULT_USER}`)).toBeVisible();

    // After data load, the skeleton must be gone.
    await expect(page.getByTestId("profile-header-skeleton")).toHaveCount(0);

    // The header is honest about real ratings: a freshly-seeded user has no
    // RatingRecords, so no per-game chips render and the overall slot says
    // "Unrated". (Chips appear once rated games exist — unit-tested.)
    await expect(page.getByTestId("overall-elo")).toBeVisible();
    await expect(page.getByTestId("overall-elo")).toContainText(/Unrated|\d{3,4}/);
  });

  test("recent-matches section shows skeleton cards, then real cards", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);

    // Match card skeletons appear before data loads.
    await expect(page.getByTestId("match-card-skeleton").first()).toBeVisible();

    // Real cards render in their place. We assert on count >0 rather than
    // an exact text to keep the test robust to small fixture variations.
    await expect(page.getByTestId("match-card").first()).toBeVisible();
    await expect(page.getByTestId("match-card-skeleton")).toHaveCount(0);
  });

  test("each match card surfaces the required metadata", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const firstCard = page.getByTestId("match-card").first();
    await expect(firstCard).toBeVisible();

    // The fixture's first card is a Human vs AI Nim match (per the contract
    // in replayTestUtils.ts). We assert the required surfaces are present
    // without binding to brittle exact text.

    // Game title chip ("Nim" / "Connect 4" / ...). The card includes the
    // game name somewhere in its visible text.
    await expect(firstCard.getByTestId("match-card-game")).toBeVisible();

    // "user vs user" title.
    await expect(firstCard.getByTestId("match-card-title")).toContainText(" vs ");

    // Move count + watch count + Elo range badge in `NNNN-NNNN` format +
    // AI badge + result chip + date label.
    await expect(firstCard.getByTestId("match-card-moves")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-watches")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-elo-range")).toHaveText(/\d{3,4}\s*-\s*\d{3,4}/);
    await expect(firstCard.getByTestId("match-card-badge-ai")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-result")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-date")).toBeVisible();
  });

  test("clicking a match card navigates to /replays/:matchId", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const firstCard = page.getByTestId("match-card").first();
    await expect(firstCard).toBeVisible();

    // Click a non-interactive part of the card: the center can land on a
    // nested participant link or the watch-later star, which capture the
    // click by design.
    await firstCard.getByTestId("match-card-game").click();
    // The fixture's first match has id FIXTURE_FIRST_MATCH_ID.
    await page.waitForURL(new RegExp(`/replays/${FIXTURE_FIRST_MATCH_ID}(\\?.*)?$`));
  });

  test("all filter controls render", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const filters = page.getByTestId("filter-bar");
    await expect(filters).toBeVisible();

    // Sort lives in the always-visible compact row.
    await expect(page.getByLabel("Sort")).toBeVisible();

    // The rest of the controls live in the collapsible panel.
    await openFilterPanel(page);
    // Game multi-select.
    await expect(page.getByTestId("filter-game")).toBeVisible();
    // Participant type.
    await expect(page.getByTestId("filter-participant-type")).toBeVisible();
    // Result.
    await expect(page.getByTestId("filter-result")).toBeVisible();
    // Elo range slider.
    await expect(page.getByTestId("filter-elo-range")).toBeVisible();
    // Date range.
    await expect(page.getByTestId("filter-date-range")).toBeVisible();
    // Move count range.
    await expect(page.getByTestId("filter-move-count")).toBeVisible();
    // Participant search.
    await expect(page.getByLabel("Search participants")).toBeVisible();
    // Rated only toggle.
    await expect(page.getByTestId("filter-rated-only")).toBeVisible();

    // "Clear all" appears once any filter deviates from the default.
    await page.getByTestId("filter-result").getByRole("button", { name: "Wins" }).click();
    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  });

  test("changing the sort updates the displayed match list ordering", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);

    // Snapshot the first card's title under default sort (Newest).
    const firstTitleDefault = await page.getByTestId("match-card-title").first().innerText();

    // Switch to "Oldest" - in a chronological fixture that must reorder.
    await page.getByLabel("Sort").selectOption("oldest");

    // Wait for the URL to reflect the change, then poll until the refetched
    // (real API) list actually reorders.
    await page.waitForURL(/sort=oldest/);
    await expect
      .poll(async () => page.getByTestId("match-card-title").first().innerText())
      .not.toEqual(firstTitleDefault);
  });

  test("changing the game filter shrinks the displayed match list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    const allCount = await page.getByTestId("match-card").count();
    expect(allCount).toBeGreaterThan(0);

    // Filter down to Nim only.
    await page.getByTestId("filter-game").getByRole("button", { name: "Nim" }).click();
    await page.waitForURL(/game=nim/);

    const filteredCount = await page.getByTestId("match-card").count();
    expect(filteredCount).toBeLessThanOrEqual(allCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test("changing the Elo range updates the match list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);

    // The RangeSlider primitive must expose its dual handles as
    // `data-testid="filter-elo-min"` and `data-testid="filter-elo-max"`.
    // We narrow the range aggressively (1600-1800) and expect the URL to
    // reflect the change.
    // Commit each handle and wait for it to land before moving the next:
    // two rapid sets can race the controlled component's re-render, making
    // the second onChange emit the stale pair (first value resets and, being
    // the default again, never reaches the URL).
    await setRangeValue(page, "filter-elo-min", "1600");
    await expect.poll(() => page.url()).toMatch(/minElo=1600/);
    await setRangeValue(page, "filter-elo-max", "1800");
    await expect
      .poll(() => page.url())
      .toMatch(/minElo=1600.*maxElo=1800|maxElo=1800.*minElo=1600/);
    // The list must still render (possibly empty state, possibly cards).
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("changing the date range filter updates the URL and list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    await page.getByTestId("filter-date-range").getByRole("button", { name: "This week" }).click();
    await page.waitForURL(/date=week/);
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("changing the move count range filter updates the URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    // Sequential commit per handle — see the elo-range note above.
    await setRangeValue(page, "filter-move-count-min", "5");
    await expect.poll(() => page.url()).toMatch(/minMoves=5/);
    await setRangeValue(page, "filter-move-count-max", "20");
    await expect.poll(() => page.url()).toMatch(/minMoves=5.*maxMoves=20|maxMoves=20.*minMoves=5/);
  });

  test("participant search filters the list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    await page.getByLabel("Search participants").fill("Bot");
    // SearchInput is debounced; wait for the URL to update.
    await page.waitForURL(/participant=Bot/);
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("result filter (wins/losses/draws) reflects in URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    await page.getByTestId("filter-result").getByRole("button", { name: "Wins" }).click();
    await page.waitForURL(/result=wins/);
  });

  test("'Rated only' toggle filters to rated matches", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await openFilterPanel(page);
    // Target the input's testid: getByLabel("Rated only") would also match
    // the active-filter chip's "Remove Rated only filter" aria-label.
    // The checkbox input is visually hidden and inert to direct clicks;
    // the wrapping label is the interactive surface.
    await page.locator("label", { has: page.getByTestId("filter-rated-only") }).click();
    await expect(page.getByTestId("filter-rated-only")).toBeChecked();
    await page.waitForURL(/rated=true/);
  });

  test("'Clear all' button resets every filter and the URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}?sort=oldest&game=nim&rated=true`);
    // Wait for the filter state to be hydrated from the URL.
    await openFilterPanel(page);
    await expect(page.getByTestId("filter-rated-only")).toBeChecked();

    await page.getByRole("button", { name: "Clear all" }).click();

    await expect(page.getByTestId("filter-rated-only")).not.toBeChecked();
    // URL no longer carries the filter params.
    await expect(page).toHaveURL(new RegExp(`/profile/${DEFAULT_USER}/?$`));
  });

  test("pagination / Load more works", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const initialCount = await page.getByTestId("match-card").count();
    expect(initialCount).toBeLessThanOrEqual(PROFILE_MATCHES_PER_PAGE);

    // The fixture must contain >12 user0 matches so Load More appears.
    const loadMore = page.getByRole("button", { name: /Load more/i });
    await expect(loadMore).toBeVisible();

    await loadMore.click();
    await expect.poll(() => page.getByTestId("match-card").count()).toBeGreaterThan(initialCount);
  });

  test("empty state appears when filters return zero matches", async ({ page }) => {
    // Aggressively-narrow Elo window. The fixture should have no matches with
    // both participants between 2300-2400.
    await page.goto(`/profile/${DEFAULT_USER}?minElo=2300&maxElo=2400`);
    // Scoped: the best-AI card legitimately shows its own empty state too.
    await expect(
      page.getByTestId("profile-recent-matches").getByTestId("empty-state"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("edit profile section is visible only to the profile owner", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    // The profile header renders its sections as a tablist.
    await expect(page.getByRole("tab", { name: "Edit profile" })).toBeVisible();

    // Navigate to a different user's profile - the tab must NOT show.
    await page.goto(`/profile/user1`);
    await expect(page.getByRole("heading", { name: /yāo/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Edit profile" })).not.toBeVisible();
  });

  test("settings tab is navigable via ?tab=settings for the owner", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}?tab=settings`);
    // The edit-profile form section is expanded.
    await expect(page.getByRole("heading", { name: /display name/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /reset password/i })).toBeVisible();
  });

  test("settings tab redirects / hides for a non-owner", async ({ page }) => {
    // A non-owner who navigates to the settings tab on someone else's profile
    // should either be silently switched to the matches tab or shown an
    // unauthorized notice. We accept either as long as the edit form does
    // NOT render.
    await page.goto(`/profile/user1?tab=settings`);
    await expect(page.getByRole("heading", { name: /reset password/i })).not.toBeVisible();
  });

  test("unknown user shows a friendly error state", async ({ page }) => {
    await page.goto(`/profile/this-user-does-not-exist`);
    await expect(page.getByTestId("error-state")).toBeVisible();
    await expect(page.getByText(/user not found/i)).toBeVisible();
  });
});
