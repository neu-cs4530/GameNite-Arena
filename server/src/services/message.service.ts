import { type MessageInfo } from "@gamenite/shared";
import { populateSafeUserInfo } from "./user.service.ts";
import { type UserWithId } from "../types.ts";
import { MessageRepo } from "../repository.ts";

/**
 * Expand a stored message
 *
 * @param messageId - Valid message id
 * @returns the expanded message info object
 */
async function populateMessageInfo(messageId: string): Promise<MessageInfo> {
  const message = await MessageRepo.get(messageId);
  return {
    messageId,
    text: message.text,
    createdAt: new Date(message.createdAt),
    createdBy: await populateSafeUserInfo(message.createdBy),
  };
}

/**
 * Creates and stores a new message
 *
 * @param user - a valid user
 * @param text - the message's text
 * @param createdAt - the time of message creation
 * @returns the message's info object
 */
export async function createMessage(
  user: UserWithId,
  text: string,
  createdAt: Date,
): Promise<MessageInfo> {
  const messageId = await MessageRepo.add({
    text,
    createdAt: createdAt.toISOString(),
    createdBy: user.userId,
  });
  return populateMessageInfo(messageId);
}

/**
 * Retrieves a list of message ids from the database
 *
 * @param ids - A list of valid message ids
 * @returns the MessageInfo objects corresponding to those ids
 * @throws if any of the ids are not valid
 */
export async function getMessagesById(ids: string[]): Promise<MessageInfo[]> {
  return Promise.all(ids.map(populateMessageInfo));
}
