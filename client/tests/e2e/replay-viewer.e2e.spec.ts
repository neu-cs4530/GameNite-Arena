import { test, expect, type Page } from "@playwright/test";
import {
  FIXTURE_FIRST_MATCH_ID,
  FIXTURE_FIRST_MATCH_MOVE_COUNT,
  logIn,
} from "./replayTestUtils.ts";

/**
 * Tests for `/replays/:matchId` (spec section #2). The first fixture match
 * (`FIXTURE_FIRST_MATCH_ID`) is a Nim Human-vs-AI match with exactly
 * `FIXTURE_FIRST_MATCH_MOVE_COUNT` moves.
 *
 * Keyboard shortcut behaviour mandated by the spec:
 *   ArrowLeft / ArrowRight - prev / next move
 *   Space                  - toggle play/pause
 *   J / L                  - rewind / forward 5 moves
 *   K                      - pause
 *   Home / End             - jump to first / last move
 *   0-9                    - jump to that 10% of the timeline
 *   Shortcuts MUST be ignored while focus is in the annotation text input.
 */

const VIEWER_URL = `/replays/${FIXTURE_FIRST_MATCH_ID}`;

async function gotoViewer(page: Page, queryString = "") {
  await page.goto(`${VIEWER_URL}${queryString}`);
  // Wait for the viewer skeleton to be replaced by real content.
  await expect(page.getByTestId("replay-viewer")).toBeVisible();
}

test.describe("The replay viewer", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("loads with a skeleton, then renders the board and controls", async ({ page }) => {
    await page.goto(VIEWER_URL);

    // Skeleton on mount.
    await expect(page.getByTestId("replay-viewer-skeleton")).toBeVisible();

    // After data load, the real viewer renders.
    await expect(page.getByTestId("replay-viewer")).toBeVisible();
    await expect(page.getByTestId("replay-board")).toBeVisible();
    await expect(page.getByTestId("playback-controls")).toBeVisible();
    await expect(page.getByTestId("move-list")).toBeVisible();
    await expect(page.getByTestId("annotation-panel")).toBeVisible();

    // Skeleton has been removed.
    await expect(page.getByTestId("replay-viewer-skeleton")).toHaveCount(0);
  });

  test("header shows participants, result, date, and watch count", async ({ page }) => {
    await gotoViewer(page);
    const header = page.getByTestId("match-header");
    await expect(header).toBeVisible();
    await expect(header.getByTestId("match-header-participants")).toContainText(" vs ");
    await expect(header.getByTestId("match-header-result")).toBeVisible();
    await expect(header.getByTestId("match-header-date")).toBeVisible();
    await expect(header.getByTestId("match-header-watch-count")).toBeVisible();
  });

  test("playback controls (prev / next / play / pause) work and update the UI", async ({
    page,
  }) => {
    await gotoViewer(page);

    // Initial state: at move 0, Play visible.
    await expect(page.getByTestId("current-move-index")).toHaveText("0");

    // Next.
    await page.getByRole("button", { name: "Next move" }).click();
    await expect(page.getByTestId("current-move-index")).toHaveText("1");

    // Prev.
    await page.getByRole("button", { name: "Previous move" }).click();
    await expect(page.getByTestId("current-move-index")).toHaveText("0");

    // Play -> the play button transitions to pause.
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    // Pause via the same control.
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("playback speed selector updates the displayed speed", async ({ page }) => {
    await gotoViewer(page);
    await page.getByLabel("Playback speed").selectOption("2");
    await expect(page.getByTestId("playback-speed")).toContainText("2");
  });

  test("move list renders, highlights the current move, and clicking jumps to it", async ({
    page,
  }) => {
    await gotoViewer(page);
    const moveList = page.getByTestId("move-list");
    await expect(moveList).toBeVisible();

    // The fixture has FIXTURE_FIRST_MATCH_MOVE_COUNT moves; the move list
    // should render at least that many entries (plus possibly an "initial"
    // row).
    expect(await moveList.getByRole("button").count()).toBeGreaterThanOrEqual(
      FIXTURE_FIRST_MATCH_MOVE_COUNT,
    );

    // The currently selected move has data-active="true".
    await expect(page.getByTestId("move-list-item-active")).toHaveCount(1);

    // Click move 3.
    await moveList.getByRole("button").nth(3).click();
    await expect(page.getByTestId("current-move-index")).toHaveText("3");
  });

  test("keyboard left / right jumps moves", async ({ page }) => {
    await gotoViewer(page);
    // Focus the viewer surface so keyboard handlers attach.
    await page.getByTestId("replay-viewer").click();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("current-move-index")).toHaveText("1");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("current-move-index")).toHaveText("2");

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("current-move-index")).toHaveText("1");
  });

  test("keyboard space toggles play/pause", async ({ page }) => {
    await gotoViewer(page);
    await page.getByTestId("replay-viewer").click();
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("keyboard J / K / L jump 5 / pause / forward 5", async ({ page }) => {
    await gotoViewer(page);
    await page.getByTestId("replay-viewer").click();

    // L jumps forward 5.
    await page.keyboard.press("l");
    await expect(page.getByTestId("current-move-index")).toHaveText("5");

    // J jumps back 5 (capped at 0).
    await page.keyboard.press("j");
    await expect(page.getByTestId("current-move-index")).toHaveText("0");

    // Start playing then K pauses.
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.keyboard.press("k");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("Home and End jump to first and last moves", async ({ page }) => {
    await gotoViewer(page);
    await page.getByTestId("replay-viewer").click();

    await page.keyboard.press("End");
    await expect(page.getByTestId("current-move-index")).toHaveText(
      String(FIXTURE_FIRST_MATCH_MOVE_COUNT),
    );

    await page.keyboard.press("Home");
    await expect(page.getByTestId("current-move-index")).toHaveText("0");
  });

  test("number keys 0-9 jump to that 10% of the timeline", async ({ page }) => {
    await gotoViewer(page);
    await page.getByTestId("replay-viewer").click();

    // 5 = 50% of FIXTURE_FIRST_MATCH_MOVE_COUNT moves. We use Math.round to
    // mirror the expected rounding in the implementation.
    await page.keyboard.press("5");
    const expected = Math.round((FIXTURE_FIRST_MATCH_MOVE_COUNT * 5) / 10);
    await expect(page.getByTestId("current-move-index")).toHaveText(String(expected));

    await page.keyboard.press("0");
    await expect(page.getByTestId("current-move-index")).toHaveText("0");
  });

  test("keyboard shortcuts are ignored while typing in the annotation input", async ({ page }) => {
    await gotoViewer(page);

    // Focus the annotation input and type "right" (the actual key, not the
    // arrow). Then check ArrowRight key press does NOT advance the move.
    const input = page.getByLabel("Annotation text");
    await input.click();
    await input.fill("");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("current-move-index")).toHaveText("0");

    // Same for Space.
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("create an annotation with each marker type", async ({ page }) => {
    await gotoViewer(page);
    const markers = ["good", "interesting", "questionable", "bad", "winning"] as const;
    for (const marker of markers) {
      await page.getByLabel(`Marker ${marker}`).check();
      await page.getByLabel("Annotation text").fill(`note: ${marker}`);
      await page.getByRole("button", { name: "Save annotation" }).click();
      await expect(
        page.getByTestId("annotation-list").getByText(`note: ${marker}`).first(),
      ).toBeVisible();
    }
  });

  test("edit an existing annotation", async ({ page }) => {
    await gotoViewer(page);
    // The fixture should pre-load at least one annotation on move 0.
    const annotation = page.getByTestId("annotation-item").first();
    await expect(annotation).toBeVisible();

    await annotation.getByRole("button", { name: "Edit" }).click();
    // Scoped to the annotation item: the create-new form below renders its
    // own "Annotation text" textarea at the same time.
    await annotation.getByLabel("Annotation text").fill("updated text");
    await annotation.getByRole("button", { name: "Save annotation" }).click();

    await expect(page.getByTestId("annotation-list").getByText("updated text")).toBeVisible();
  });

  test("delete an annotation", async ({ page }) => {
    await gotoViewer(page);
    // Annotations load through the real-first service; wait for the list
    // before taking a count snapshot.
    await expect(page.getByTestId("annotation-item").first()).toBeVisible();
    const initialCount = await page.getByTestId("annotation-item").count();
    expect(initialCount).toBeGreaterThan(0);

    await page
      .getByTestId("annotation-item")
      .first()
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("button", { name: "Confirm delete" }).click();

    await expect.poll(() => page.getByTestId("annotation-item").count()).toBe(initialCount - 1);
  });

  test("annotations attached to the current move are displayed", async ({ page }) => {
    await gotoViewer(page);
    // The fixture seeds annotations on move 0; the panel renders them.
    await expect(page.getByTestId("annotation-item").first()).toBeVisible();

    // Click move 3 - if there are no fixture annotations for move 3, the
    // panel shows an empty state. We don't bind to text; just verify the
    // panel updates without errors.
    await page.getByTestId("move-list").getByRole("button").nth(3).click();
    await expect(page.getByTestId("annotation-panel")).toBeVisible();
  });

  test("'Analyze with engine' triggers a mocked analysis and shows inline results", async ({
    page,
  }) => {
    await gotoViewer(page);
    await page.getByRole("button", { name: "Analyze with engine" }).click();

    // While running, a loading indicator is visible.
    await expect(page.getByTestId("analysis-loading")).toBeVisible();

    // Once done, the move list shows engine markers on ~2-3 moves.
    await expect(page.getByTestId("analysis-loading")).toHaveCount(0);
    await expect(page.getByTestId("analysis-marker").first()).toBeVisible();
  });

  test("'Download .gnreplay' triggers a download", async ({ page }) => {
    await gotoViewer(page);
    const downloadPromise = page.waitForEvent("download");
    // Click by visible text: the button's accessible name is overridden to
    // avoid the "play"-substring collision with the transport's Play button
    // (any name containing ".gnreplay" contains "play").
    await page.getByText("Download .gnreplay").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.gnreplay$/);
  });

  test("'Share study link' generates a /study/<token> URL and shows it", async ({ page }) => {
    await gotoViewer(page);
    await page.getByRole("button", { name: "Share study link" }).click();
    const shareInput = page.getByLabel("Share link");
    await expect(shareInput).toBeVisible();
    await expect(shareInput).toHaveValue(/\/study\/.+/);
  });

  test("watch count increments on viewer mount", async ({ page }) => {
    await gotoViewer(page);
    const firstCount = Number(await page.getByTestId("match-header-watch-count").innerText());

    // Navigate away and back.
    await page.goto("/replays");
    await gotoViewer(page);
    const secondCount = Number(await page.getByTestId("match-header-watch-count").innerText());

    expect(secondCount).toBeGreaterThan(firstCount);
  });

  test("deep-link ?move=N loads at that move", async ({ page }) => {
    await gotoViewer(page, "?move=4");
    await expect(page.getByTestId("current-move-index")).toHaveText("4");
  });

  test("/study/:shareToken renders read-only annotated view", async ({ page }) => {
    // The token format is opaque; the test just navigates to a known-good
    // value the code agent must accept. We use "demo" because the spec says
    // mock services should mint deterministic short tokens.
    await page.goto("/study/demo");

    await expect(page.getByTestId("replay-viewer")).toBeVisible();
    // Annotations visible, but edit controls hidden.
    await expect(page.getByTestId("annotation-item").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save annotation" })).not.toBeVisible();
    await expect(page.getByLabel("Annotation text")).not.toBeVisible();
  });

  test("unknown replay id renders an error state", async ({ page }) => {
    await page.goto("/replays/this-replay-does-not-exist");
    await expect(page.getByTestId("error-state")).toBeVisible();
    await expect(page.getByText(/replay not found/i)).toBeVisible();
    // A "Browse all replays" button per spec.
    await expect(page.getByRole("button", { name: /Browse all replays/i })).toBeVisible();
  });
});
