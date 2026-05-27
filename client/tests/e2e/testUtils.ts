import { expect, type Page } from "@playwright/test";

/**
 * Log a user in with a username and password, and wait for successful
 * post-login redirect to the home page
 *
 * @param page
 * @param username
 * @param password
 */
export async function logInUser(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  // { exact: true } is necessary here to avoid capturing the "Show Password" checkbox and "Confirm Password" button
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL("/");
}

/**
 * Set up a test of two users joining and starting a 2+ player game
 *
 * @param page1 - A Page where we will attempt to create a *new* user. That user will initiate the game.
 * @param page2 - A Page where the preexisting user2 will log in
 * @param gameId - The game id shared by the frontend and backend
 * @param gameStartsAutomatically - true if the game has a maximum of two players
 * @param doAssess - `true` adds extra expectations
 * @returns
 */
export async function createAndLoadGame(
  page1: Page,
  page2: Page,
  gameId: string,
  gameStartsAutomatically: boolean,
  doAssess: boolean,
) {
  // Create a random new user and username to give this test unique identity
  const username1 = "user" + Math.floor(Math.random() * 2_000_000);
  const password1 = "pwd_for_" + username1;
  const username2 = "user2";
  const password2 = "pwd2222";

  // Create a user for user1
  await page1.goto("/login");
  await page1.getByRole("button", { name: "Create New Account" }).click();
  await page1.getByLabel("Username").fill(username1);
  await page1.getByLabel("Password", { exact: true }).fill(password1);
  await page1.getByLabel("Confirm Password").fill(password1);
  await page1.getByRole("button", { name: "Sign Up" }).click();
  await page1.waitForURL("/");

  // User 1 creates a new game
  await page1.getByRole("button", { name: "Create New Game" }).click();
  await page1.waitForURL("/game/new");
  await page1.getByLabel("Game selection").selectOption(gameId);
  await page1.getByRole("button", { name: "Create New Game" }).click();

  // Causes Playwright to auto-wait for for game to be enabled
  await page1.getByPlaceholder("Send a message to chat").click();

  if (doAssess) {
    await expect(page1.getByText("you are player #1")).toBeVisible();

    // This is the only expectation that insists the game cannot start with one player
    await expect(page1.getByRole("button", { name: "Start Game" })).not.toBeVisible();
  }

  // Log in user2
  await logInUser(page2, username2, password2);

  // The always-on expectation here gives the page a chance to load
  await expect(page2.getByRole("listitem").filter({ hasText: username1 })).toHaveCount(1);

  if (doAssess) {
    await expect(
      page2
        .getByRole("listitem")
        .filter({ hasText: username1 })
        .getByRole("link", { name: /^A game of .+/ }),
    ).toHaveCount(1);
  }

  await page2
    .getByRole("listitem")
    .filter({ hasText: username1 })
    .getByRole("link", { name: /^A game of .+/ })
    .click();

  if (doAssess) {
    await expect(page1.getByText("waiting for game to begin")).toBeVisible();
    await expect(page2.getByText("waiting for game to begin")).toBeVisible();
  }

  await page2.getByRole("button", { name: "Join Game" }).click();

  if (doAssess) {
    await expect(page1.getByText("you are player #1")).toBeVisible();
    await expect(page2.getByText("you are player #2")).toBeVisible();

    // React's strict mode causes chat to be joined twice
    // https://react.dev/reference/react/StrictMode
    // To avoid flakiness, we merely require the entered-chat message to appear >= 1 time
    expect(await page1.getByText("Sénior Dos entered chat").count()).toBeGreaterThanOrEqual(1);
  }

  if (gameStartsAutomatically) {
    if (doAssess) {
      await expect(page1.getByRole("button", { name: "Start Game" })).not.toBeVisible();
      await expect(page2.getByRole("button", { name: "Start Game" })).not.toBeVisible();
    }
  } else {
    if (doAssess) {
      await expect(page1.getByRole("button", { name: "Start Game" })).toBeVisible();
      await expect(page2.getByRole("button", { name: "Start Game" })).toBeVisible();
    }

    await page1.getByRole("button", { name: "Start Game" }).click();
  }

  if (doAssess) {
    await expect(page1.getByText("waiting for game to begin")).not.toBeVisible();
    await expect(page2.getByText("waiting for game to begin")).not.toBeVisible();
  }

  return username1;
}
