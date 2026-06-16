import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";

/**
 * Tests for `SideBarNav` (nav/IA restructure).
 *
 * The sidebar now has just two top-level groups, Home and AI. Both headers
 * are a link to the group's hub page ("/" and "/ai") plus a separate expand
 * toggle. Home contains (in order): Matchmaking, Puzzles (nested dropdown:
 * Daily Puzzle, Practice), Watch Games (nested dropdown: Replays, Live Games,
 * Highlights), Leaderboards, Forums. AI's submenu has Trainer and Models.
 * Profile and Following are gone (Profile moved to the header's profile menu).
 */
test.describe("The sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("Home, Matchmaking, Leaderboards, and Forums links work", async ({ page }) => {
    await page.getByRole("link", { name: "Matchmaking" }).click();
    await page.waitForURL("/games");

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");

    await page.getByRole("link", { name: "Leaderboards" }).click();
    await page.waitForURL("/leaderboards");

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");

    await page.getByRole("link", { name: "Forums" }).click();
    await page.waitForURL("/forum");
  });

  test("does not render Profile or Following links", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Following" })).toHaveCount(0);
  });

  test("the 'Home' header is both a link to / and a separate expand toggle", async ({ page }) => {
    await page.goto("/trainer");
    await expect(page.getByTestId("home-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Matchmaking" })).not.toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");
  });

  test("Home's children render in the spec-mandated order @smoke", async ({ page }) => {
    await page.getByTestId("puzzles-menu-toggle").click();
    await page.getByTestId("watch-menu-toggle").click();

    const sidebar = page.locator(".sideBarNav");
    const labels = await sidebar.getByRole("link").allInnerTexts();
    expect(labels.map((s) => s.trim())).toEqual([
      "Home",
      "Matchmaking",
      "Puzzles",
      "Daily Puzzle",
      "Practice",
      "Watch Games",
      "Replays",
      "Live Games",
      "Highlights",
      "Leaderboards",
      "Forums",
      "AI",
    ]);
  });

  test("the 'Replays' link navigates to /replays and is highlighted there @smoke", async ({
    page,
  }) => {
    await page.goto("/replays");
    const replays = page.getByRole("link", { name: "Replays" });
    await expect(replays).toHaveClass(/menu_selected/);
    await expect(page.getByTestId("browse-grid")).toBeVisible();
  });

  test("the 'Puzzles' header expands a submenu with Daily Puzzle and Practice @smoke", async ({
    page,
  }) => {
    const toggle = page.getByTestId("puzzles-menu-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("link", { name: "Daily Puzzle" }).click();
    await page.waitForURL("/puzzles/daily");

    await page.getByRole("link", { name: "Practice" }).click();
    await page.waitForURL("/puzzles/practice");
  });

  test("the 'Watch Games' header expands a submenu with Replays, Live Games, and Highlights", async ({
    page,
  }) => {
    const toggle = page.getByTestId("watch-menu-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("link", { name: "Live Games" }).click();
    await page.waitForURL("/live");

    await page.getByRole("link", { name: "Highlights" }).click();
    await page.waitForURL("/highlights");
  });

  test("the 'AI' header is both a link to /ai and expands a submenu with Trainer and Models", async ({
    page,
  }) => {
    const toggle = page.getByTestId("ai-menu-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("link", { name: "Trainer" }).click();
    await page.waitForURL("/trainer");

    await page.getByRole("link", { name: "Models" }).click();
    await page.waitForURL("/models");

    await page.getByRole("link", { name: "AI", exact: true }).click();
    await page.waitForURL("/ai");
    await expect(page.getByTestId("ai-hub-page")).toBeVisible();
  });
});
