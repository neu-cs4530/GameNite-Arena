import { test, expect } from "@playwright/test";
import { logIn } from "./replayTestUtils.ts";

/**
 * Design-tokens smoke tests (spec section #5).
 *
 * The spec demands a real CSS-custom-property design token system on :root in
 * `main.css`. These tests sample a handful of tokens at runtime and assert
 * that representative UI elements are driven from them, catching regressions
 * where someone hardcodes a hex / rgb / oklch value in a component.
 *
 * If a value is hardcoded in a component, the computed style of the element
 * will NOT match the value of the CSS variable read from :root, and the test
 * will fail with a clear "computed background color does not match
 * --color-primary" message.
 */

async function getRootVar(page: import("@playwright/test").Page, name: string): Promise<string> {
  return await page.evaluate(
    (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    name,
  );
}

/** Normalise a CSS color value to lowercase + collapsed spaces for comparison. */
function normalizeColor(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

test.describe("Design tokens", () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test("root exposes the full design token set", async ({ page }) => {
    await page.goto("/");
    // Sample a representative token from each category to catch a missing
    // declaration; not exhaustive.
    const tokens = [
      "--color-bg",
      "--color-bg-elevated",
      "--color-surface",
      "--color-border",
      "--color-fg",
      "--color-fg-muted",
      "--color-primary",
      "--color-primary-hover",
      "--color-success",
      "--color-warning",
      "--color-danger",
      "--color-human",
      "--color-ai",
      "--color-tier-bronze",
      "--color-tier-silver",
      "--color-tier-gold",
      "--color-tier-platinum",
      "--color-tier-diamond",
      "--color-focus",
      "--space-1",
      "--space-2",
      "--space-4",
      "--space-8",
      "--radius-sm",
      "--radius-md",
      "--radius-pill",
      "--text-display",
      "--text-h1",
      "--text-body",
      "--text-small",
      "--shadow-md",
      "--duration-base",
    ];

    for (const name of tokens) {
      const value = await getRootVar(page, name);
      expect(value, `expected ${name} to be defined on :root`).not.toBe("");
    }
  });

  test("a primary button's computed background-color matches --color-primary", async ({ page }) => {
    await page.goto("/replays");

    // We use the "Clear all" button on the filter bar because the spec
    // mandates the FilterBar primitive renders a primary-styled CTA. If the
    // code agent prefers a different button, it's free to use any other
    // primary-styled button; either way the assertion is the same: the
    // computed color must match the CSS variable.
    const button = page.getByRole("button", { name: "Clear all" });
    await expect(button).toBeVisible();

    const [computed, tokenValue] = await Promise.all([
      button.evaluate((el) => getComputedStyle(el).backgroundColor),
      getRootVar(page, "--color-primary"),
    ]);

    // Use a temporary element to resolve the token value to a computed color
    // (e.g. so an `oklch(...)` token is compared against the browser-resolved
    // form). This is more robust than substring matching.
    const resolved = await page.evaluate((token) => {
      const probe = document.createElement("div");
      probe.style.color = token;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, tokenValue);

    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });

  test("body text uses --color-fg as its computed color", async ({ page }) => {
    await page.goto("/replays");
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();

    const [computed, tokenValue] = await Promise.all([
      heading.evaluate((el) => getComputedStyle(el).color),
      getRootVar(page, "--color-fg"),
    ]);

    const resolved = await page.evaluate((token) => {
      const probe = document.createElement("div");
      probe.style.color = token;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, tokenValue);

    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });

  test("a tier badge uses its --color-tier-* token", async ({ page }) => {
    await page.goto("/replays");

    // The MatchCard renders a TierBadge somewhere. Pick the first one.
    const tierBadge = page.getByTestId(/tier-badge-/).first();
    await expect(tierBadge).toBeVisible();

    // We don't know which tier this match falls into, so we resolve the
    // testid suffix and check against that token.
    const testId = await tierBadge.getAttribute("data-testid");
    expect(testId).toMatch(/^tier-badge-(bronze|silver|gold|platinum|diamond)$/);
    const tier = testId!.replace("tier-badge-", "");

    const [computed, tokenValue] = await Promise.all([
      tierBadge.evaluate((el) => getComputedStyle(el).backgroundColor),
      getRootVar(page, `--color-tier-${tier}`),
    ]);
    const resolved = await page.evaluate((token) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = token;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    }, tokenValue);

    expect(normalizeColor(computed)).toBe(normalizeColor(resolved));
  });

  test("dark mode tokens activate under prefers-color-scheme: dark", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await logIn(page);
    await page.goto("/");

    const bgLight = await getRootVar(page, "--color-bg");
    expect(bgLight).not.toBe("");

    // Then re-open under "light" and compare. The two backgrounds MUST
    // differ (otherwise there is no theme support).
    const lightContext = await browser.newContext({ colorScheme: "light" });
    const lightPage = await lightContext.newPage();
    await logIn(lightPage);
    await lightPage.goto("/");
    const bgDark = await getRootVar(lightPage, "--color-bg");

    expect(bgLight).not.toBe(bgDark);
    await context.close();
    await lightContext.close();
  });
});
