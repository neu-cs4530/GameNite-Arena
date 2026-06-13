import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signupTrainerUser, type TrainerUser } from "./realTrainerUtils.ts";
import { logIn } from "./replayTestUtils.ts";

/**
 * Full-stack proof of the matchmaking flow that replaced manual game
 * creation: two real users (two browser contexts, two fresh signups so both
 * sit at the default 1500 rating) pick the same game and mode in the portal,
 * queue, and get paired into ONE live game by the server's matchmaker loop.
 *
 * Both players start at 1500 and the initial search window is ±100, so the
 * first tick after the second join must pair them — every wait below is
 * bounded by the 2s tick, padded only for CI scheduling jitter.
 */

let context1: BrowserContext;
let context2: BrowserContext;
let page1: Page;
let page2: Page;

test.beforeEach(async ({ browser }) => {
  context1 = await browser.newContext();
  context2 = await browser.newContext();
  page1 = await context1.newPage();
  page2 = await context2.newPage();
});

test.afterEach(async () => {
  await context1.close();
  await context2.close();
});

/** Portal walk: the nim tile opens the section page; its Ranked CTA queues. */
async function queueRankedNim(page: Page) {
  await page.goto("/games");
  await page.getByTestId("game-tile-nim").click();
  await page.waitForURL("/games/nim");

  // The Ranked CTA carries the player's rating emblem once loaded.
  await expect(page.getByTestId("play-ranked-rating")).toBeVisible();

  await page.getByTestId("play-ranked").click();
  await page.waitForURL("/games/queue/nim?rated=true");
}

test.describe("matchmaking portal", () => {
  test("two fresh users queue ranked nim and land in the same live game @smoke", async ({
    request,
  }) => {
    const user1: TrainerUser = await signupTrainerUser(request, "mmq1");
    const user2: TrainerUser = await signupTrainerUser(request, "mmq2");
    await logIn(page1, user1.username, user1.password);
    await logIn(page2, user2.username, user2.password);

    // First player queues alone and sees the classic queue screen.
    await queueRankedNim(page1);
    await expect(page1.getByTestId("queue-timer")).toBeVisible();
    await expect(page1.getByTestId("stat-window")).toContainText("±");
    await expect(page1.getByTestId("queue-rating-emblem")).toBeVisible();

    // Second player joins the same pool.
    await queueRankedNim(page2);
    await expect(page2.getByTestId("queue-timer")).toBeVisible();

    // The next matchmaker tick (≤2s) pairs them; both navigate to the game.
    await page1.waitForURL(/\/game\/[^/]+$/, { timeout: 15000 });
    await page2.waitForURL(/\/game\/[^/]+$/, { timeout: 15000 });

    const gameId1 = page1.url().split("/").pop();
    const gameId2 = page2.url().split("/").pop();
    expect(gameId1).toBeTruthy();
    expect(gameId1).toBe(gameId2);

    // The matched game actually renders, with each user seated as a player
    // (the matchmaker create/join/start path, not a spectator view).
    await expect(page1.getByText(/you are player #/)).toBeVisible();
    await expect(page2.getByText(/you are player #/)).toBeVisible();
  });
});
