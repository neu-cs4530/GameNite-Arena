import { test, expect } from "@playwright/test";

test.describe("The login page", () => {
  const username = "user3";
  const password = "pwd3333";

  const randUsername = "user" + Math.floor(Math.random() * 1_000_000);
  const randPassword = "pwd_for_" + randUsername;

  test("should appear via redirect from /login in existing-user mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/login");

    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Create New Account" })).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Use Existing Account" })).not.toBeVisible();
  });

  test("should allow toggle between existing-user and new-user mode", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Create New Account" }).click();

    await expect(page.getByRole("button", { name: "Log In" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create New Account" })).not.toBeVisible();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Existing Account" })).toBeVisible();

    await page.getByRole("button", { name: "Use Existing Account" }).click();

    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Create New Account" })).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Use Existing Account" })).not.toBeVisible();
  });

  test("should allow an existing user to log in", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill(username);
    // { exact: true } is necessary here to avoid capturing the "Show Password" checkbox
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log In" }).click();

    await page.waitForURL("/");
    await expect(page.getByText("signed in as Frau Drei")).toBeVisible();
  });

  test("should reject an incorrect password with a message, and allow correction", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill(username);
    // { exact: true } is necessary here to avoid capturing the "Show Password" checkbox
    await page.getByLabel("Password", { exact: true }).fill(randPassword);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page.getByText("Invalid username or password")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.waitForURL("/");
    await expect(page.getByText("signed in as Frau Drei")).toBeVisible();
  });

  test("should reject creating an account for an existing user, and allow correction", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Create New Account" }).click();

    await page.getByLabel("Username").fill(username);
    // { exact: true } is necessary here to avoid capturing the "Show Password" checkbox and "Confirm Password" button
    await page.getByLabel("Password", { exact: true }).fill(randPassword);
    await page.getByLabel("Confirm Password").fill(randPassword);
    await page.getByRole("button", { name: "Sign Up" }).click();

    await expect(page.getByText("User already exists")).toBeVisible();

    await page.getByLabel("Username", { exact: true }).fill(randUsername);
    await page.getByRole("button", { name: "Sign Up" }).click();
    await page.waitForURL("/");
    await expect(page.getByText(`signed in as ${randUsername}`)).toBeVisible();
  });
});
