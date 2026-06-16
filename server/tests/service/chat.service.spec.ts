import { beforeEach, describe, expect, it } from "vitest";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { addMessageToChat, createChat, forceChatById } from "../../src/services/chat.service.ts";
import { createMessage } from "../../src/services/message.service.ts";
import type { UserWithId } from "../../src/types.ts";

let user0: UserWithId;

beforeEach(async () => {
  const u0 = await getUserByUsername("user0");
  if (!u0) throw new Error("seeded user missing");
  user0 = u0;
});

describe("chat.service", () => {
  it("creates an empty chat", async () => {
    const chat = await createChat(new Date("2026-06-01T00:00:00Z"));
    expect(chat.chatId).toBeDefined();
    expect(chat.messages).toEqual([]);
  });

  it("forceChatById returns an existing chat", async () => {
    const created = await createChat(new Date());
    const found = await forceChatById(created.chatId, user0);
    expect(found.chatId).toBe(created.chatId);
  });

  it("forceChatById throws on an unknown chat id", async () => {
    await expect(forceChatById("nope", user0)).rejects.toThrow(/invalid chat id/i);
  });

  it("addMessageToChat appends a message to the chat", async () => {
    const chat = await createChat(new Date());
    const message = await createMessage(user0, "hello", new Date());

    const updated = await addMessageToChat(chat.chatId, user0, message.messageId);
    expect(updated.messages.map((m) => m.messageId)).toContain(message.messageId);
  });

  it("addMessageToChat throws when the chat id is invalid", async () => {
    const message = await createMessage(user0, "hi", new Date());
    await expect(addMessageToChat("nope", user0, message.messageId)).rejects.toThrow(
      /invalid chat id/i,
    );
  });
});
