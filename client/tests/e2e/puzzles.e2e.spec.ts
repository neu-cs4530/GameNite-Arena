/**
 * Daily puzzles tab against the REAL stack:
 *
 *   two real users play a full nim game over sockets → the recorder archives
 *   the match → the puzzle GET lazily mines today's nim puzzle from that
 *   archive → a fresh throwaway user solves it on /puzzles.
 *
 * The suite plays its own source game first, so the lazy generator always
 * has a match to mine even on a cold database — no seeded or mocked
 * puzzles anywhere in the path.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoadGame } from "./testUtils.ts";
import { logInTrainer, signupTrainerUser, type TrainerUser } from "./realTrainerUtils.ts";

let api: APIRequestContext;
let solver: TrainerUser;

test.beforeAll(async ({ browser, playwright }) => {
  // Archive one finished nim match (misère: 7 × Take three — player 2 wins)
  // so today's puzzle can be lazily generated from a real win.
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  await createAndLoadGame(page1, page2, "nim", true, false);
  const pages = [page1, page2];
  for (let move = 0; move < 7; move++) {
    const takeThree = pages[move % 2].getByRole("button", { name: "Take three" });
    await expect(takeThree).toBeEnabled();
    await takeThree.click();
  }
  await expect(page1.getByText(/The game is over/)).toBeVisible();
  await context1.close();
  await context2.close();

  api = await playwright.request.newContext();
  solver = await signupTrainerUser(api, "e2e_puzzle");
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("Daily puzzles tab", () => {
  test("a fresh user picks nim, attempts the daily puzzle, and gets a rated verdict @smoke", async ({
    page,
  }) => {
    await logInTrainer(page, solver);
    await page.goto("/puzzles");
    await expect(page.getByTestId("puzzles-page")).toBeVisible();

    // Progressive disclosure: tiles only, no puzzle card at rest.
    await expect(page.getByTestId("puzzle-card")).toHaveCount(0);

    await page.getByTestId("puzzle-game-tile-nim").click();

    // The lazily generated position renders: token pile + framing.
    await expect(page.getByTestId("puzzle-board-nim")).toBeVisible();
    await expect(page.getByTestId("puzzle-board-nim")).toContainText("tokens left");

    // The solution must NOT be on screen before an attempt — the disclosure
    // doesn't even exist in the DOM yet.
    await expect(page.getByTestId("puzzle-solution")).toHaveCount(0);
    await expect(page.getByText("Solution & explanation")).toHaveCount(0);

    // Any legal take is a valid attempt (Take 1 is always legal).
    await page.getByTestId("puzzle-take-1").click();

    // Verdict panel: Puzzle Glicko + streak numbers from the live endpoint.
    await expect(page.getByTestId("puzzle-result")).toBeVisible();
    await expect(page.getByTestId("puzzle-glicko-tile")).toContainText("Puzzle Glicko");
    await expect(page.getByTestId("puzzle-glicko-tile")).toContainText(/\d{3,4}/);
    await expect(page.getByTestId("puzzle-streak-tile")).toContainText(/\d/);

    // Only NOW does the solution disclosure exist; opening it reveals the line.
    await expect(page.getByTestId("puzzle-solution")).toBeVisible();
    await page.getByTestId("puzzle-solution-toggle").click();
    await expect(page.getByTestId("puzzle-solution-body")).toContainText(/Take [123]/);
  });

  test("?game=nim deep-links straight to the puzzle and the hint reveals only the first move @smoke", async ({
    page,
  }) => {
    await logInTrainer(page, solver);
    await page.goto("/puzzles?game=nim");

    // Linkable: the nim puzzle loads without any tile click.
    await expect(page.getByTestId("puzzle-board-nim")).toBeVisible();

    // The hint shows exactly one move and never the solution disclosure.
    await page.getByTestId("puzzle-hint-toggle").click();
    await expect(page.getByTestId("puzzle-hint-body")).toContainText(
      "First move of the winning line:",
    );
    await expect(page.getByTestId("puzzle-hint-body")).toContainText(/Take [123]/);
    await expect(page.getByTestId("puzzle-solution")).toHaveCount(0);
  });
});
