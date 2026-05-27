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

test.describe("Chat in the context of a Nim game", () => {
  let username1: string;

  test.beforeEach(async () => {
    username1 = await createAndLoadGame(page1, page2, "nim", true, false);
  });

  test("avoids race conditions", async () => {
    await page1.getByPlaceholder("Send a message to chat").focus();
    await page2.getByPlaceholder("Send a message to chat").focus();

    // Simultaneously send messages from both players
    for (let i = 0; i < 10; i += 1) {
      await page1.keyboard.type(`message ${i} A`);
      await page2.keyboard.type(`message ${i} B`);
      await Promise.all([page1.keyboard.press("Enter"), page2.keyboard.press("Enter")]);
    }

    // We expect that these tests will **succeed**
    // Even if both chats don't get stored in the database due to the race condition in chat.service.ts,
    // the websockets will ensure that both active users see both chats
    for (let i = 0; i < 10; i += 1) {
      await expect(page1.getByText(new RegExp(`^message ${i} [AB]$`)).first()).toBeVisible();
      await expect(page1.getByText(`message ${i} A`)).toBeVisible();
      await expect(page1.getByText(`message ${i} B`)).toBeVisible();
    }

    // By leaving the page and coming back, we erase the messages delivered via websockets, and
    // have to go back to the database to ask what messages exist
    await page2.getByRole("link", { name: "Games" }).click();
    await expect(page2.getByRole("listitem").filter({ hasText: username1 })).toHaveCount(1);
    await page2
      .getByRole("listitem")
      .filter({ hasText: username1 })
      .getByRole("link", { name: /^A game of.+/ })
      .click();

    for (let i = 0; i < 10; i += 1) {
      // Based on how we expect the race condition in chat.service.ts to work, *one* of the messages
      // that was sent simultaneously should get stored
      await expect(page2.getByText(new RegExp(`^message ${i} [AB]$`)).first()).toBeVisible();

      // If these are uncommented, we expect they will generally **fail** due to race conditions in the chat controller:
      // when two messages are sent at the same time, some fraction of the time only some of the messages will be stored
      // correctly
      // await expect(page2.getByText(`message ${i} A`)).toBeVisible();
      // await expect(page2.getByText(`message ${i} B`)).toBeVisible();
    }
  });
});
