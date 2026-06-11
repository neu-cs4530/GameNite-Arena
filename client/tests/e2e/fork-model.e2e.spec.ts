import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import { FIXTURE_FIRST_MODEL_ID } from "./trainerTestUtils.ts";

/**
 * Tests for `/models/:modelId/fork` (spec section "Tests the trainer test
 * agent must write" #7). The fork flow is short and focused:
 *   - Source model summary at top.
 *   - New name input (default: "Fork of <original>").
 *   - Optional initial training config inline.
 *   - "Create fork and start training" button submits, then navigates to
 *     `/trainer/jobs/:jobId`.
 */
test.describe("The fork model page", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto(`/models/${FIXTURE_FIRST_MODEL_ID}/fork`);
  });

  test("loads with the source model summary at top", async ({ page }) => {
    await expect(page.getByTestId("fork-model-page")).toBeVisible();
    const summary = page.getByTestId("fork-source-summary");
    await expect(summary).toBeVisible();
    // Owner shown (user0).
    await expect(summary).toContainText(/The Knight Of Games|user0/i);
    // Game badge shown.
    await expect(summary).toContainText(/Nim/i);
  });

  test("default new name is 'Fork of <original>'", async ({ page }) => {
    const nameInput = page.getByLabel(/New model name/i);
    await expect(nameInput).toBeVisible();
    const value = await nameInput.inputValue();
    expect(value).toMatch(/^Fork of /);
  });

  test("user can override the new name", async ({ page }) => {
    const nameInput = page.getByLabel(/New model name/i);
    await nameInput.fill("My Customized Fork");
    await expect(nameInput).toHaveValue("My Customized Fork");
  });

  test("submit calls forkModel then submitJob and navigates to /trainer/jobs/:jobId", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Create fork and start training/i }).click();
    await page.waitForURL(/\/trainer\/jobs\/[^/]+$/);
  });

  test("optional initial training config inputs are present", async ({ page }) => {
    await expect(page.getByLabel(/Episode count/i)).toBeVisible();
    await expect(page.getByLabel(/Learning rate/i)).toBeVisible();
  });

  test("episode count validation applies to the fork form too", async ({ page }) => {
    await page.getByLabel(/Episode count/i).fill("0");
    // The input validates inline and keeps the last valid value upstream;
    // its visible message is the input-level one.
    await expect(page.getByText(/Must be ≥ 1/i)).toBeVisible();
  });

  test("Cancel returns to the source model card", async ({ page }) => {
    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await page.waitForURL(`/models/${FIXTURE_FIRST_MODEL_ID}`);
  });

  test("unknown modelId on the fork route renders an error state", async ({ page }) => {
    await page.goto("/models/this-does-not-exist/fork");
    await expect(page.getByTestId("error-state")).toBeVisible();
  });
});
