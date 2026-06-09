import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";

/**
 * Trainer design-tokens smoke (spec section "Tests the trainer test agent
 * must write" #8).
 *
 * Asserts at least one trainer-surface component reads a token-driven
 * background-color matching `--color-bg-elevated`, ensuring the trainer
 * surface inherits the same design token system used by the replay surface.
 *
 * If a component hardcodes a hex / rgb / oklch value, the computed style
 * will not match the variable read from `:root`, and the test will fail
 * with a clear diff.
 */

async function getRootVar(page: import("@playwright/test").Page, name: string): Promise<string> {
  return await page.evaluate(
    (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    name,
  );
}

function normalizeColor(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function resolveTokenToComputed(
  page: import("@playwright/test").Page,
  tokenValue: string,
): Promise<string> {
  return await page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = token;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, tokenValue);
}

test.describe("Trainer surface design tokens", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("at least one trainer component's bg matches --color-bg-elevated", async ({ page }) => {
    await page.goto("/trainer");

    // The dashboard's training job cards are rendered on the elevated
    // surface. We sample the first card's computed background-color.
    const card = page.getByTestId("training-job-card").first();
    await expect(card).toBeVisible();

    const [computed, tokenValue] = await Promise.all([
      card.evaluate((el) => getComputedStyle(el).backgroundColor),
      getRootVar(page, "--color-bg-elevated"),
    ]);
    expect(tokenValue, "expected --color-bg-elevated to be defined").not.toBe("");

    const resolved = await resolveTokenToComputed(page, tokenValue);
    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });

  test("a job status pill resolves color from a status token", async ({ page }) => {
    await page.goto("/trainer");
    const pill = page.getByTestId("job-status-pill").first();
    await expect(pill).toBeVisible();

    // The pill maps each status to a token: completed -> --color-success,
    // failed -> --color-danger, running -> --color-primary, etc. We
    // verify the computed background matches one of those, asserting no
    // hardcoded color was used.
    const computed = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);

    const candidates = [
      "--color-success",
      "--color-warning",
      "--color-danger",
      "--color-primary",
      "--color-surface",
    ];
    const resolved = await Promise.all(
      candidates.map(async (name) => {
        const value = await getRootVar(page, name);
        if (!value) return "";
        return await resolveTokenToComputed(page, value);
      }),
    );

    const norm = (s: string) => normalizeColor(s);
    expect(
      resolved.map(norm),
      `pill bg ${computed} should match one of ${candidates.join(", ")}`,
    ).toContain(norm(computed));
  });

  test("a slot capacity indicator's progress bar color is token-driven", async ({ page }) => {
    await page.goto("/trainer");
    const indicator = page.getByTestId("slot-capacity-indicator").first();
    await expect(indicator).toBeVisible();
    // The slot bar carries an inner `<div data-testid="slot-bar-fill">`.
    const fill = indicator.getByTestId("slot-bar-fill");
    await expect(fill).toBeVisible();

    const computed = await fill.evaluate((el) => getComputedStyle(el).backgroundColor);
    const tokenValue = await getRootVar(page, "--color-primary");
    const resolved = await resolveTokenToComputed(page, tokenValue);
    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });

  test("model card background uses --color-bg-elevated", async ({ page }) => {
    await page.goto("/models");
    const card = page.getByTestId("model-card").first();
    await expect(card).toBeVisible();

    const [computed, tokenValue] = await Promise.all([
      card.evaluate((el) => getComputedStyle(el).backgroundColor),
      getRootVar(page, "--color-bg-elevated"),
    ]);
    const resolved = await resolveTokenToComputed(page, tokenValue);
    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });
});
