import { expect, type Page } from "@playwright/test";

/**
 * Shared identifiers and fixture constants for the replay-related e2e tests.
 *
 * INSTRUCTION TO CODE AGENT: the deterministic mock fixture in
 * `client/src/__mocks__/replays.ts` MUST satisfy the following constraints so
 * that these e2e tests have stable, predictable assertions to make:
 *
 *  - The mock fixture array contains at least 30 replays.
 *  - The fixture's first entry has id `FIXTURE_FIRST_MATCH_ID` (below).
 *  - The fixture's first entry is a Nim match with EXACTLY 8 moves (so the
 *    move list is non-trivial and J/L "jump 5" shortcuts are exercised).
 *  - The fixture's first entry includes user0 ("The Knight Of Games") as one
 *    of its participants so that the profile recent-matches list for user0
 *    contains it.
 *  - The fixture's first entry is a Human vs AI match (so the AI badge can
 *    be asserted).
 *  - The fixture's first entry has both participants' `ratingAtMatchTime`
 *    populated such that the elo range badge renders.
 *  - At least 24 replays in the global fixture for the discovery feed so the
 *    first page is full.
 *  - At least 13 of user0's replays so profile pagination triggers
 *    (12 per page).
 *  - At least one replay tagged so that it appears in EACH of these featured
 *    strips:
 *      "Most viewed today" / "Trending now (last 7 days)" /
 *      "Notable AI vs Human matches" / "Highest-rated this week"
 *  - At least one replay with `rated === true` and at least one with
 *    `rated === false`, both belonging to user0, so the "rated only" filter
 *    is observable on the profile.
 *  - At least 3 mock annotations attached to the first replay's first move,
 *    spanning at least two different markers.
 */
export const FIXTURE_FIRST_MATCH_ID = "mock-match-1";

/** First fixture is expected to be a Nim match with this exact move count. */
export const FIXTURE_FIRST_MATCH_MOVE_COUNT = 8;

/** Per-page sizes from the spec. */
export const PROFILE_MATCHES_PER_PAGE = 12;
export const DISCOVERY_MATCHES_PER_PAGE = 24;

/** Default e2e user. user0 owns enough fixture matches to populate the page. */
export const DEFAULT_USER = "user0";
export const DEFAULT_PASSWORD = "pwd0000";
export const DEFAULT_DISPLAY_NAME = "The Knight Of Games";

/**
 * Log a user in with a username and password and wait for the post-login
 * redirect. Defaults to user0.
 */
export async function logIn(
  page: Page,
  username: string = DEFAULT_USER,
  password: string = DEFAULT_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL("/");
}

/**
 * Log in and wait until the post-login app shell is ready. Useful when the
 * caller will immediately navigate elsewhere and does not need to assert on
 * Home page contents.
 */
export async function logInAndReady(
  page: Page,
  username: string = DEFAULT_USER,
  password: string = DEFAULT_PASSWORD,
) {
  await logIn(page, username, password);
  await expect(page.getByText(/signed in as/i)).toBeVisible();
}
