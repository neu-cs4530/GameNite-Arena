import { test, expect } from "@playwright/test";
import { DEFAULT_USER, logIn } from "./replayTestUtils.ts";

/**
 * Tests for `SideBarNav` (spec section #4).
 *
 * After this change, the sidebar contains, in order:
 *   Home / Games / Forum / Replays / Profile
 */
test.describe("The sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("contains a 'Replays' link that navigates to /replays @smoke", async ({ page }) => {
    const replays = page.getByRole("link", { name: "Replays" });
    await expect(replays).toBeVisible();

    await replays.click();
    await page.waitForURL("/replays");
    await expect(page.getByTestId("browse-grid")).toBeVisible();
  });

  test("preserves Home / Games / Forum / Profile links and they still work", async ({ page }) => {
    await page.getByRole("link", { name: "Games" }).click();
    await page.waitForURL("/games");

    await page.getByRole("link", { name: "Forum" }).click();
    await page.waitForURL("/forum");

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");

    await page.getByRole("link", { name: "Profile" }).click();
    await page.waitForURL(`/profile/${DEFAULT_USER}`);
  });

  test("links render in the spec-mandated order", async ({ page }) => {
    const sidebar = page.locator(".sideBarNav");
    const labels = await sidebar.getByRole("link").allInnerTexts();
    const cleaned = labels.map((s) => s.trim());

    // Original spec order plus the surfaces added later: Puzzles (after
    // Games, its gameplay sibling) and the trainer-platform pages (Trainer,
    // Models) ahead of Profile.
    expect(cleaned).toEqual([
      "Home",
      "Games",
      "Puzzles",
      "Forum",
      "Replays",
      "Trainer",
      "Models",
      "Profile",
    ]);
  });

  test("the 'Replays' link is highlighted when on the /replays route", async ({ page }) => {
    await page.goto("/replays");
    const replays = page.getByRole("link", { name: "Replays" });
    await expect(replays).toHaveClass(/menu_selected/);
  });
});
