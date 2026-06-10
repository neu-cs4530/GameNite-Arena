import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAndLoadGame } from "./testUtils.ts";

/**
 * Full-stack proof that gameplay produces a watchable replay with NO mocked
 * data anywhere in the path:
 *
 *   two real users (two browser contexts) play a complete game of nim over
 *   sockets → the server's MatchRecorder archives it → the replay endpoints
 *   serve it → the replay viewer plays it back → the view counter increments
 *   through the real POST /api/replay/:id/view endpoint.
 *
 * Every assertion against /api/replay here hits the express server; the
 * client mock fixture contains none of the ids this test generates, so a
 * silent fall-back to mocks would fail the test.
 */

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

/**
 * Plays a full game of misère nim (21 tokens, both players always taking 3).
 * Move order: p1,p2,p1,p2,p1,p2,p1 — player 1 takes the last token and LOSES,
 * so player 2 wins. Returns the gameId parsed from the game page URL.
 */
async function playFullNimGame(): Promise<string> {
  await createAndLoadGame(page1, page2, "nim", true, false);

  const gameUrl = page1.url();
  const gameId = gameUrl.substring(gameUrl.lastIndexOf("/") + 1);
  expect(gameId.length).toBeGreaterThan(0);

  const pages = [page1, page2];
  for (let move = 0; move < 7; move++) {
    const mover = pages[move % 2];
    const takeThree = mover.getByRole("button", { name: "Take three" });
    await expect(takeThree).toBeEnabled();
    await takeThree.click();
  }

  // Misère: player 1 took the last token and lost; player 2 won.
  await expect(page1.getByText(/The game is over/)).toBeVisible();
  await expect(page2.getByText(/The game is over/)).toBeVisible();
  return gameId;
}

test.describe("two players' game becomes a real watchable replay", () => {
  test("archives the match, plays it back in the viewer, and counts views for real @smoke", async () => {
    const gameId = await playFullNimGame();

    /* ----------------------------------------------------------------
     * 1. The archive is served by the real API with full fidelity.
     * ---------------------------------------------------------------- */
    const detailRes = await page1.request.get(`/api/replay/${gameId}`);
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as {
      matchId: string;
      gameKey: string;
      moveCount: number;
      watchCount: number;
      moves: { notation: string; move: unknown }[];
      participants: { username?: string; displayName: string; type: string }[];
      result: { outcome: string; winnerId?: string };
      initialState?: { remaining?: number };
    };
    expect(detail.matchId).toBe(gameId);
    expect(detail.gameKey).toBe("nim");
    expect(detail.moveCount).toBe(7);
    expect(detail.moves).toHaveLength(7);
    expect(detail.moves.every((m) => m.notation === "Take 3")).toBe(true);
    expect(detail.initialState?.remaining).toBe(21);
    expect(detail.participants).toHaveLength(2);
    expect(detail.participants.every((p) => p.type === "human")).toBe(true);
    const startingWatchCount = detail.watchCount;

    // Misère nim: the second player wins (player 1 took the last token).
    expect(detail.result.outcome).toBe("win");
    expect(detail.result.winnerId).toBeDefined();

    // The real list endpoint includes the fresh match.
    const listRes = await page1.request.get(`/api/replay/list?games=nim&pageSize=100`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as { replays: { matchId: string }[] };
    expect(list.replays.map((r) => r.matchId)).toContain(gameId);

    /* ----------------------------------------------------------------
     * 2. The replay viewer renders and plays back the real match.
     * ---------------------------------------------------------------- */
    await page1.goto(`/replays/${gameId}`);
    await expect(page1.getByTestId("replay-viewer")).toBeVisible();

    // Header: both (human) participants and a result badge.
    await expect(page1.getByTestId("match-header-participants")).toBeVisible();
    await expect(page1.getByTestId("match-header-result")).not.toBeEmpty();

    // Move list: all 7 moves with human notation.
    const moveItems = page1
      .getByTestId("move-list")
      .locator('[data-testid="move-list-item"], [data-testid="move-list-item-active"]');
    await expect(moveItems).toHaveCount(8); // "Start" row + 7 moves
    await expect(page1.getByTestId("move-list").getByText("Take 3").first()).toBeVisible();

    // Playback: board starts at the full pile, ends empty after seeking to
    // the last move.
    const board = page1.getByTestId("game-board-nim");
    await expect(board).toBeVisible();
    await expect(board).toContainText("21");
    await page1.getByRole("button", { name: "Jump to last move" }).click();
    await expect(page1.getByTestId("current-move-index")).toHaveText("7");
    await expect(board).toContainText("0");
    // And scrubbing back to the start restores the full pile.
    await page1.getByRole("button", { name: "Jump to first move" }).click();
    await expect(page1.getByTestId("current-move-index")).toHaveText("0");
    await expect(board).toContainText("21");

    /* ----------------------------------------------------------------
     * 3. View counting is real: opening the viewer bumped the counter on
     *    the server, and a second visitor bumps it again.
     * ---------------------------------------------------------------- */
    await expect
      .poll(async () => {
        const res = await page1.request.get(`/api/replay/${gameId}`);
        return ((await res.json()) as { watchCount: number }).watchCount;
      })
      .toBe(startingWatchCount + 1);

    // Second user opens the same replay — server-side counter, not a
    // client-local mock, so the count rises across users.
    await page2.goto(`/replays/${gameId}`);
    await expect(page2.getByTestId("replay-viewer")).toBeVisible();
    await expect
      .poll(async () => {
        const res = await page2.request.get(`/api/replay/${gameId}`);
        return ((await res.json()) as { watchCount: number }).watchCount;
      })
      .toBe(startingWatchCount + 2);

    // The header shows the live server-side count.
    await expect(page2.getByTestId("match-header-watch-count")).toHaveText(
      String(startingWatchCount + 2),
    );

    /* ----------------------------------------------------------------
     * 4. Live presence is real: with both users on the replay page the
     *    socket presence room has two members, and both headers show it.
     *    When one leaves, the count drops for the viewer who stayed.
     * ---------------------------------------------------------------- */
    await expect(page1.getByTestId("live-watching")).toContainText("2");
    await expect(page2.getByTestId("live-watching")).toContainText("2");

    await page1.goto("/replays");
    await expect(page2.getByTestId("live-watching")).toContainText("1");
  });
});
