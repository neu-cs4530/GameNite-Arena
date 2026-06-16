/**
 * Daily puzzles + practice tabs against the REAL stack:
 *
 *   two real users play a full nim game over sockets -> the recorder archives
 *   the match -> the puzzle GET lazily mines today's nim puzzle from that
 *   archive -> a fresh throwaway user solves it on /puzzles/daily.
 *
 * The suite plays its own source games first, so the lazy generator always
 * has a match to mine even on a cold database — no seeded or mocked
 * puzzles anywhere in the path. Two nim matches are archived: the daily
 * puzzle claims the most recent one, leaving the other for the practice feed.
 *
 * One connect4 win and one tictactoe win are archived too, covering the
 * board-click puzzles (the player submits a move by clicking the puzzle
 * board itself, not PuzzleMoveInput). Checkers is skipped here: a checkers
 * game only ends when a side has zero legal moves, which takes far more
 * moves than a short scripted line, so it stays covered by the server/unit
 * puzzle tests instead.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoadGame } from "./testUtils.ts";
import { logInTrainer, signupTrainerUser, type TrainerUser } from "./realTrainerUtils.ts";

let api: APIRequestContext;
let solver: TrainerUser;

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(120000);

  // Archive two finished nim matches whose penultimate move is SOUND, so the
  // mining gate accepts them: 21 → 3,3,3,3,3,2,2 leaves 2 tokens; the winner
  // then takes 1 (leaving 1 ≡ 1 mod 4 — the theory-winning move) and the
  // loser is forced to take the last token. The old 7×Take-three line is
  // deliberately rejected now — its split move was a blunder.
  const line = ["three", "three", "three", "three", "three", "two", "two", "one", "one"];
  for (let i = 0; i < 2; i++) {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await createAndLoadGame(page1, page2, "nim", true, false);
    const pages = [page1, page2];
    for (let move = 0; move < line.length; move++) {
      const btn = pages[move % 2].getByRole("button", { name: `Take ${line[move]}` });
      await expect(btn).toBeEnabled();
      await btn.click();
    }
    await expect(page1.getByText(/The game is over/)).toBeVisible();
    await context1.close();
    await context2.close();
  }

  // Archive one connect4 win: Red (page1, player 0, moves first) drops in
  // columns 0, 1, 2 (Yellow, page2, drops on top of each), then Red drops in
  // column 3, completing a horizontal four in a row on the bottom row. That
  // last drop is the puzzle's split move.
  {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await createAndLoadGame(page1, page2, "connect4", true, false);
    const pages = [page1, page2];
    const cols = [0, 0, 1, 1, 2, 2, 3];
    for (let move = 0; move < cols.length; move++) {
      const btn = pages[move % 2].getByTestId(`c4-col-${cols[move]}`);
      await expect(btn).toBeEnabled();
      await btn.click();
    }
    await expect(page1.getByText(/The game is over/)).toBeVisible();
    await context1.close();
    await context2.close();
  }

  // Archive one tictactoe win: X (player 1) moves first, so page2 plays X and
  // page1 plays O. X takes (0,0), (0,1), (0,2) while O takes (1,0), (1,1), and
  // X's last move completes the top row and is the puzzle's split move.
  {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await createAndLoadGame(page1, page2, "tictactoe", true, false);
    const cells: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ];
    const movers = [page2, page1, page2, page1, page2];
    const marks = ["X", "O", "X", "O", "X"];
    for (let move = 0; move < cells.length; move++) {
      const [row, col] = cells[move];
      const btn = movers[move].getByRole("button", {
        name: `Place ${marks[move]} at row ${row + 1}, column ${col + 1}`,
      });
      await expect(btn).toBeEnabled();
      await btn.click();
    }
    await expect(page1.getByTestId("ttt-status")).toContainText("The game is over");
    await context1.close();
    await context2.close();
  }

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
    await page.goto("/puzzles/daily");
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
    await page.goto("/puzzles/daily?game=nim");

    // Linkable: the nim puzzle loads without any tile click.
    await expect(page.getByTestId("puzzle-board-nim")).toBeVisible();

    // The hint is a server-side grant now: one move, revealed in place, and
    // it forfeits the rated slot (the practice note appears). The full
    // solution disclosure still never renders before an attempt.
    await page.getByTestId("puzzle-hint").click();
    await expect(page.getByTestId("puzzle-hint-reveal")).toContainText(/Take [123]/);
    // hints cost rating too
    await expect(page.getByTestId("puzzle-hint-penalty")).toContainText(/-5/);
    await expect(page.getByTestId("puzzle-practice-note")).toBeVisible();
    await expect(page.getByTestId("puzzle-solution")).toHaveCount(0);
  });

  test("a fresh user picks connect4 and solves the daily puzzle by clicking the board", async ({
    page,
  }) => {
    await logInTrainer(page, solver);
    await page.goto("/puzzles/daily");

    await page.getByTestId("puzzle-game-tile-connect4").click();
    await expect(page.getByTestId("puzzle-board-connect4")).toBeVisible();
    await expect(page.getByTestId("puzzle-solution")).toHaveCount(0);

    // The board is the input: drop in column 4 to complete four in a row.
    await page.getByTestId("c4-col-3").click();

    await expect(page.getByTestId("puzzle-result")).toBeVisible();
    await expect(page.getByTestId("puzzle-glicko-tile")).toContainText("Puzzle Glicko");
    await expect(page.getByTestId("puzzle-streak-tile")).toContainText(/\d/);

    await page.getByTestId("puzzle-solution-toggle").click();
    await expect(page.getByTestId("puzzle-solution-body")).toContainText("column 4");
  });

  test("a fresh user picks tictactoe and solves the daily puzzle by clicking the board", async ({
    page,
  }) => {
    await logInTrainer(page, solver);
    await page.goto("/puzzles/daily");

    await page.getByTestId("puzzle-game-tile-tictactoe").click();
    await expect(page.getByTestId("puzzle-board-tictactoe")).toBeVisible();
    await expect(page.getByTestId("puzzle-solution")).toHaveCount(0);

    // The board is the input: mark the top-right square to complete the top row.
    await page.getByTestId("ttt-cell-0-2").click();

    await expect(page.getByTestId("puzzle-result")).toBeVisible();
    await expect(page.getByTestId("puzzle-glicko-tile")).toContainText("Puzzle Glicko");
    await expect(page.getByTestId("puzzle-streak-tile")).toContainText(/\d/);

    await page.getByTestId("puzzle-solution-toggle").click();
    await expect(page.getByTestId("puzzle-solution-body")).toContainText("row 1, column 3");
  });
});

test.describe("Practice tab", () => {
  test("a user opens Practice from the sidebar, attempts a position, and loads more", async ({
    page,
  }) => {
    await logInTrainer(page, solver);
    await page.goto("/puzzles/daily");

    // the Home > Puzzles dropdown is already open on /puzzles routes
    await page.getByRole("link", { name: "Practice" }).click();
    await page.waitForURL("/puzzles/practice");

    await page.getByTestId("practice-game-tile-nim").click();

    // At least one position mined from the archive, distinct from today's puzzle.
    const card = page.getByTestId("training-card").first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("puzzle-board-nim")).toBeVisible();

    // Any legal take is a valid attempt — the reveal shows pass/fail + solution.
    await card.getByTestId("puzzle-take-1").click();
    const result = card.getByTestId("training-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Take [123]/);

    // "Load more" stays usable even when nothing new comes back.
    await page.getByTestId("training-load-more").click();
  });
});
