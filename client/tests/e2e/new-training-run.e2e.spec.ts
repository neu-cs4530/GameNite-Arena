import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";
import { SAMPLE_HEURISTIC_PY } from "./trainerTestUtils.ts";

// The client tsconfig intentionally does not include `node` in its
// `types` list (see `tsconfig.json`). Playwright's `setInputFiles` types
// reference Node's `Buffer`, but at runtime these tests execute under
// Node and a real global Buffer is available. We `declare` a minimal
// shape just to satisfy TypeScript without adding `@types/node` to the
// app's resolution.
declare const Buffer: { from(input: string, encoding?: string): Uint8Array };

/**
 * Tests for `/trainer/new` (spec section "Tests the trainer test agent must
 * write" #2). The new-training-run config form has four sections:
 *   1. Heuristic source (upload / template / checkpoint picker)
 *   2. Game selection (multi-toggle, single-select)
 *   3. Hyperparam form (episode count, learning rate, optional JSON)
 *   4. Mode indicator ("self-play" or "environment-driven")
 *   5. Submit (calls submitJob, navigates to /trainer/jobs/:jobId)
 *
 * The form mirrors the design-token system; tests do not assert colors here
 * (see trainer-design-tokens.e2e.spec.ts for that).
 */
test.describe("The new training run form", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
    await page.goto("/trainer/new");
  });

  test("form renders with all required inputs", async ({ page }) => {
    // Source picker: segmented control between Upload / Template / Checkpoint.
    await expect(page.getByRole("button", { name: /Upload a .py file/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /hello world template/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /from a checkpoint/i })).toBeVisible();

    // Game multi-toggle (single-select).
    await expect(page.getByRole("button", { name: /^Nim$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Number Guesser/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Checkers/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect 4/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tic[- ]Tac[- ]Toe/i })).toBeVisible();

    // Hyperparam inputs.
    await expect(page.getByLabel(/Episode count/i)).toBeVisible();
    await expect(page.getByLabel(/Learning rate/i)).toBeVisible();
    await expect(page.getByLabel(/extra[- ]?config/i)).toBeVisible();

    // Mode indicator.
    await expect(page.getByTestId("mode-indicator")).toBeVisible();

    // Submit.
    await expect(page.getByRole("button", { name: /Launch training run/i })).toBeVisible();
  });

  test("upload zone accepts a .py file via setInputFiles", async ({ page }) => {
    await page.getByRole("button", { name: /Upload a .py file/i }).click();

    const uploadZone = page.getByTestId("upload-zone");
    await expect(uploadZone).toBeVisible();

    // The `<UploadZone>` includes a hidden `<input type="file">` so
    // setInputFiles can drive the upload directly.
    const fileInput = uploadZone.locator("input[type=file]");
    await fileInput.setInputFiles({
      name: "my-heuristic.py",
      mimeType: "text/x-python",
      buffer: Buffer.from(SAMPLE_HEURISTIC_PY, "utf-8"),
    });

    // The selected filename is now displayed and the source preview shows
    // the uploaded code.
    await expect(uploadZone.getByText("my-heuristic.py")).toBeVisible();
  });

  test("upload zone rejects a non-.py file", async ({ page }) => {
    await page.getByRole("button", { name: /Upload a .py file/i }).click();
    const fileInput = page.getByTestId("upload-zone").locator("input[type=file]");
    await fileInput.setInputFiles({
      name: "evil.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a python file"),
    });
    // The form surfaces an inline error referencing the file extension.
    await expect(page.getByText(/must be a .py file/i)).toBeVisible();
  });

  test("Number Guesser shows 'environment-driven' mode", async ({ page }) => {
    await page.getByRole("button", { name: /Number Guesser/i }).click();
    await expect(page.getByTestId("mode-indicator")).toContainText(/environment[- ]driven/i);
  });

  test("Nim shows 'self-play' mode", async ({ page }) => {
    await page.getByRole("button", { name: /^Nim$/ }).click();
    await expect(page.getByTestId("mode-indicator")).toContainText(/self[- ]play/i);
  });

  test("Connect 4 shows 'self-play' mode", async ({ page }) => {
    await page.getByRole("button", { name: /Connect 4/i }).click();
    await expect(page.getByTestId("mode-indicator")).toContainText(/self[- ]play/i);
  });

  test("episode count rejects 0 (below minimum)", async ({ page }) => {
    await page.getByLabel(/Episode count/i).fill("0");
    // Either inline error appears or submit is disabled. Either way, the
    // form surfaces an error message.
    await expect(page.getByText(/at least 1/i)).toBeVisible();
  });

  test("episode count rejects values above 10M (over maximum)", async ({ page }) => {
    await page.getByLabel(/Episode count/i).fill("20000000");
    await expect(page.getByText(/10[, ]?000[, ]?000|10M/i)).toBeVisible();
  });

  test("learning rate validates a numeric input", async ({ page }) => {
    const lr = page.getByLabel(/Learning rate/i);
    await lr.fill("not-a-number");
    await expect(page.getByText(/must be a number|invalid number/i)).toBeVisible();
  });

  test("extra-config JSON validates", async ({ page }) => {
    await page.getByLabel(/extra[- ]?config/i).fill("{not json");
    await expect(page.getByText(/invalid json/i)).toBeVisible();
  });

  test("hello world template populates the source field", async ({ page }) => {
    await page.getByRole("button", { name: /hello world template/i }).click();
    // The button reveals the template button (Story 2.12) - clicking it loads
    // the canned source from MOCK_HELLO_WORLD.
    await page.getByTestId("hello-world-template-button").click();

    // The source preview shows the canned content. The fixture's source
    // includes `def choose_move` per the contract.
    await expect(page.getByTestId("source-preview")).toContainText(/def choose_move/);
  });

  test("?fromTemplate=hello-world prefills the form from query string", async ({ page }) => {
    await page.goto("/trainer/new?fromTemplate=hello-world");
    await expect(page.getByTestId("source-preview")).toContainText(/def choose_move/);
  });

  test("checkpoint picker lists checkpoints from the mock fixture", async ({ page }) => {
    await page.getByRole("button", { name: /from a checkpoint/i }).click();
    const picker = page.getByTestId("checkpoint-picker");
    await expect(picker).toBeVisible();
    // At least one checkpoint item is rendered (mock-job-1 has one).
    const items = picker.getByTestId("checkpoint-item");
    expect(await items.count()).toBeGreaterThan(0);
  });

  test("?fromCheckpoint=<jobId> prefills the checkpoint picker", async ({ page }) => {
    await page.goto("/trainer/new?fromCheckpoint=mock-job-1");
    const picker = page.getByTestId("checkpoint-picker");
    await expect(picker).toBeVisible();
    // The matching checkpoint is selected on mount.
    const selected = picker
      .getByTestId("checkpoint-item")
      .filter({ has: page.locator(":checked") });
    expect(await selected.count()).toBeGreaterThan(0);
  });

  test("submitting the form navigates to /trainer/jobs/:jobId for a new jobId", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /hello world template/i }).click();
    await page.getByTestId("hello-world-template-button").click();

    await page.getByRole("button", { name: /^Nim$/ }).click();
    await page.getByLabel(/Episode count/i).fill("1000");

    await page.getByRole("button", { name: /Launch training run/i }).click();

    await page.waitForURL(/\/trainer\/jobs\/[^/]+$/);
  });

  test("game selection is single-select (clicking a second game replaces selection)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /^Nim$/ }).click();
    await page.getByRole("button", { name: /Connect 4/i }).click();
    // The Nim button is no longer the active selection.
    await expect(page.getByRole("button", { name: /^Nim$/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByRole("button", { name: /Connect 4/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
