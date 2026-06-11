/**
 * Smoke coverage for the leaderboards tab + rated post-match recap.
 *
 * Two throwaway users (created through the real signup API, per
 * realTrainerUtils) queue RANKED nim through the matchmaking portal UI,
 * play the game to a deterministic finish, and both must see the recap:
 * positive Glicko change for the winner, negative for the loser, and the
 * leaderboard movement strip. The /leaderboards tab must then list both
 * players with updated ratings and show the viewer's self-summary strip.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signupTrainerUser, type TrainerUser } from "./realTrainerUtils.ts";
import { logIn } from "./replayTestUtils.ts";

let userContext1: BrowserContext;
let userContext2: BrowserContext;
let page1: Page;
let page2: Page;

test.beforeEach(async ({ browser }) => {
  userContext1 = await browser.newContext();
  userContext2 = await browser.newContext();
  page1 = await userContext1.newPage();
  page2 = await userContext2.newPage();
});

test.afterEach(async () => {
  await userContext1.close();
  await userContext2.close();
});

/** Queue for RANKED nim through the games portal: /games → nim → Ranked → Play. */
async function queueRankedNim(page: Page): Promise<void> {
  await page.goto("/games");
  await page.getByTestId("game-tile-nim").click();
  // The ranked/casual picker may render as pills (radio) or buttons.
  await page
    .getByRole("radio", { name: /ranked/i })
    .or(page.getByRole("button", { name: /ranked/i }))
    .first()
    .click();
  await page
    .getByRole("button", { name: /^play\b/i })
    .first()
    .click();
}

/**
 * Plays misère nim from 21 deterministically: both players always take
 * three, so the pile hits 0 on the first mover's 7th take — the first
 * mover takes the last object and loses.
 *
 * @returns the pages as [winner, loser]
 */
async function playNimToCompletion(first: Page, second: Page): Promise<[Page, Page]> {
  let mover = first;
  for (let i = 0; i < 7; i++) {
    const button = mover.getByRole("button", { name: "Take three" });
    await expect(button).toBeEnabled({ timeout: 15000 });
    await button.click();
    mover = mover === first ? second : first;
  }
  return [second, first];
}

test.describe("Leaderboards and post-match recap", () => {
  test("@smoke leaderboards tab opens from the nav and discloses a game board", async ({
    request,
  }) => {
    const user = await signupTrainerUser(request, "lbtab");
    await logIn(page1, user.username, user.password);

    await page1.getByRole("link", { name: "Leaderboards" }).click();
    await page1.waitForURL("/leaderboards");
    await expect(page1.getByTestId("leaderboards-page")).toBeVisible();

    // Progressive disclosure: no board until a game is picked.
    await expect(page1.getByTestId("lb-pick-hint")).toBeVisible();
    await page1.getByTestId("lb-game-tile-nim").click();
    await expect(page1).toHaveURL(/game=nim/);

    // A fresh user is not ranked: the honest nudge shows instead of a self strip.
    await expect(page1.getByTestId("lb-self-empty")).toBeVisible();
  });

  test("@smoke ranked nim match shows recaps with Glicko movement and updates the board", async ({
    request,
  }) => {
    const user1 = await signupTrainerUser(request, "lbrc1");
    const user2 = await signupTrainerUser(request, "lbrc2");
    await logIn(page1, user1.username, user1.password);
    await logIn(page2, user2.username, user2.password);

    // Queue both for ranked nim; the matchmaker pairs within a tick (~2s).
    await queueRankedNim(page1);
    await queueRankedNim(page2);
    await page1.waitForURL(/\/game\//, { timeout: 30000 });
    await page2.waitForURL(/\/game\//, { timeout: 30000 });

    // Wait for the started game to render, then find who moves first.
    await expect(page1.getByRole("button", { name: "Take three" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page2.getByRole("button", { name: "Take three" })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await page1.getByRole("button", { name: "Take three" }).isEnabled()) ||
          (await page2.getByRole("button", { name: "Take three" }).isEnabled()),
        { timeout: 15000 },
      )
      .toBe(true);
    const page1MovesFirst = await page1.getByRole("button", { name: "Take three" }).isEnabled();
    const first = page1MovesFirst ? page1 : page2;
    const second = page1MovesFirst ? page2 : page1;

    const [winner, loser] = await playNimToCompletion(first, second);
    const winnerUser: TrainerUser = winner === page1 ? user1 : user2;
    const loserUser: TrainerUser = winner === page1 ? user2 : user1;

    // Both players get the rated recap with honest outcome headlines.
    await expect(winner.getByTestId("recap-panel")).toBeVisible({ timeout: 15000 });
    await expect(loser.getByTestId("recap-panel")).toBeVisible({ timeout: 15000 });
    await expect(winner.getByTestId("recap-headline")).toHaveText("You won");
    await expect(loser.getByTestId("recap-headline")).toHaveText("You lost");

    // Winner gains Glicko, loser drops; both see the movement strip.
    await expect(winner.getByTestId("recap-delta")).toContainText("+");
    await expect(loser.getByTestId("recap-delta")).toContainText("-");
    await expect(winner.getByTestId("movement-strip")).toBeVisible({ timeout: 15000 });
    await expect(loser.getByTestId("movement-strip")).toBeVisible({ timeout: 15000 });

    // The recap links to the game's board; follow it as the winner.
    await winner.getByTestId("recap-view-leaderboard").click();
    await winner.waitForURL(/\/leaderboards\?game=nim/);

    // The viewer gets the pinned self strip with their post-game rating.
    await expect(winner.getByTestId("lb-self-strip")).toBeVisible({ timeout: 15000 });
    const ratingText = await winner.getByTestId("lb-self-rating").textContent();
    expect(Number(ratingText!.replace(/\D/g, ""))).toBeGreaterThan(1500);

    // Both fresh users appear on the board (search to be page-proof).
    await winner.getByTestId("filter-toggle").click();
    await winner.getByTestId("lb-search").fill(winnerUser.username);
    await expect(winner.getByTestId("lb-row-self")).toContainText(winnerUser.username, {
      timeout: 10000,
    });
    await winner.getByTestId("lb-search").fill(loserUser.username);
    await expect(winner.getByTestId("lb-rows")).toContainText(loserUser.username, {
      timeout: 10000,
    });
  });
});
