import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAndLoadGame } from "./testUtils.ts";

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

test.describe("The game selection infrastructure", () => {
  test("should support creating a new Number Guesser game and having a second user join it", async () => {
    await createAndLoadGame(page1, page2, "guess", false, true);
  });
});

test.describe("The game of Number Guesser", () => {
  test.beforeEach(async () => {
    await createAndLoadGame(page1, page2, "guess", false, false);
  });

  test("should show two winners when both guesses are the same", async () => {
    await expect(page1.getByRole("button", { name: "Submit Guess" })).toBeVisible();
    await expect(page2.getByRole("button", { name: "Submit Guess", exact: true })).toBeVisible();
    await page1.getByRole("button", { name: "Submit Guess", exact: true }).click();
    await page2.getByRole("button", { name: "Submit Guess", exact: true }).click();

    await expect(page1.getByText("Game over!")).toBeVisible();
    await expect(page2.getByText("Game over!")).toBeVisible();
    expect(await page1.getByText("👑").count()).toBe(2);
    expect(await page2.getByText("👑").count()).toBe(2);
  });
});
