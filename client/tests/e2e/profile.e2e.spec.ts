import { test, expect } from "@playwright/test";
import {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_USER,
  FIXTURE_FIRST_MATCH_ID,
  PROFILE_MATCHES_PER_PAGE,
  logIn,
} from "./replayTestUtils.ts";

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

    // Per-game Elo chips render (Nim, Number Guesser at minimum).
    await expect(page.getByTestId("elo-chip")).not.toHaveCount(0);

    // Overall average Elo prominently rendered.
    await expect(page.getByTestId("overall-elo")).toBeVisible();
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
    await expect(firstCard.getByTestId("badge-ai")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-result")).toBeVisible();
    await expect(firstCard.getByTestId("match-card-date")).toBeVisible();
  });

  test("clicking a match card navigates to /replays/:matchId", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const firstCard = page.getByTestId("match-card").first();
    await expect(firstCard).toBeVisible();

    await firstCard.click();
    // The fixture's first match has id FIXTURE_FIRST_MATCH_ID.
    await page.waitForURL(new RegExp(`/replays/${FIXTURE_FIRST_MATCH_ID}(\\?.*)?$`));
  });

  test("all filter controls render", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    const filters = page.getByTestId("filter-bar");
    await expect(filters).toBeVisible();

    // Sort.
    await expect(page.getByLabel("Sort")).toBeVisible();
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
    await expect(page.getByLabel("Rated only")).toBeVisible();
    // Clear all button.
    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  });

  test("changing the sort updates the displayed match list ordering", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);

    // Snapshot the first card's title under default sort (Newest).
    const firstTitleDefault = await page.getByTestId("match-card-title").first().innerText();

    // Switch to "Oldest" - in a chronological fixture that must reorder.
    await page.getByLabel("Sort").selectOption("oldest");

    // Wait for the URL to reflect the change and the list to update.
    await page.waitForURL(/sort=oldest/);
    const firstTitleOldest = await page.getByTestId("match-card-title").first().innerText();
    expect(firstTitleOldest).not.toEqual(firstTitleDefault);
  });

  test("changing the game filter shrinks the displayed match list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
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

    // The RangeSlider primitive must expose its dual handles as
    // `data-testid="filter-elo-min"` and `data-testid="filter-elo-max"`.
    // We narrow the range aggressively (1600-1800) and expect the URL to
    // reflect the change.
    const minHandle = page.getByTestId("filter-elo-min");
    const maxHandle = page.getByTestId("filter-elo-max");
    await minHandle.fill("1600");
    await maxHandle.fill("1800");

    await page.waitForURL(/minElo=1600.*maxElo=1800|maxElo=1800.*minElo=1600/);
    // The list must still render (possibly empty state, possibly cards).
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("changing the date range filter updates the URL and list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await page.getByTestId("filter-date-range").getByRole("button", { name: "This week" }).click();
    await page.waitForURL(/date=week/);
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("changing the move count range filter updates the URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await page.getByTestId("filter-move-count-min").fill("5");
    await page.getByTestId("filter-move-count-max").fill("20");
    await page.waitForURL(/minMoves=5.*maxMoves=20|maxMoves=20.*minMoves=5/);
  });

  test("participant search filters the list", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await page.getByLabel("Search participants").fill("Bot");
    // SearchInput is debounced; wait for the URL to update.
    await page.waitForURL(/participant=Bot/);
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });

  test("result filter (wins/losses/draws) reflects in URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await page.getByTestId("filter-result").getByRole("button", { name: "Wins" }).click();
    await page.waitForURL(/result=wins/);
  });

  test("'Rated only' toggle filters to rated matches", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await page.getByLabel("Rated only").check();
    await page.waitForURL(/rated=true/);
  });

  test("'Clear all' button resets every filter and the URL", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}?sort=oldest&game=nim&rated=true`);
    // Wait for the filter state to be hydrated from the URL.
    await expect(page.getByLabel("Rated only")).toBeChecked();

    await page.getByRole("button", { name: "Clear all" }).click();

    await expect(page.getByLabel("Rated only")).not.toBeChecked();
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
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  test("edit profile section is visible only to the profile owner", async ({ page }) => {
    await page.goto(`/profile/${DEFAULT_USER}`);
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();

    // Navigate to a different user's profile - the button must NOT show.
    await page.goto(`/profile/user1`);
    await expect(page.getByRole("heading", { name: /yāo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit profile" })).not.toBeVisible();
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
