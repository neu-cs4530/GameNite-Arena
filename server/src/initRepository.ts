import { randomUUID } from "node:crypto";
import { getUserByUsername } from "./services/auth.service.ts";
import {
  AuthRepo,
  ChatRepo,
  CommentRepo,
  GameRepo,
  MessageRepo,
  ThreadRepo,
  UserRepo,
} from "./repository.ts";
import type { GameRecord, ThreadRecord } from "./models.ts";
import { createChat } from "./services/chat.service.ts";
import { createUser, updateUser } from "./services/user.service.ts";

/** Reset stored games with example data. */
async function resetStoredGames() {
  const user0id = (await getUserByUsername("user0"))!.userId;
  const user1id = (await getUserByUsername("user1"))!.userId;
  const user2id = (await getUserByUsername("user2"))!.userId;
  const user3id = (await getUserByUsername("user3"))!.userId;

  const recently = new Date(new Date().getTime() - 6 * 60 * 60 * 1000);
  const storedGames: { [key: string]: GameRecord } = {
    [randomUUID().toString()]: {
      type: "nim",
      state: { remaining: 0, nextPlayer: 1 },
      done: true,
      chat: (await createChat(new Date("2025-04-21"))).chatId,
      players: [user2id, user3id],
      createdAt: new Date("2025-04-21").toISOString(),
      createdBy: user2id,
    },
    [randomUUID().toString()]: {
      type: "guess",
      state: { secret: 43, guesses: [null, 2, 99, null] },
      done: false,
      chat: (await createChat(recently)).chatId,
      players: [user1id, user0id, user3id, user2id],
      createdAt: recently.toISOString(),
      createdBy: user1id,
    },
    [randomUUID().toString()]: {
      type: "nim",
      done: false,
      chat: (await createChat(new Date())).chatId,
      players: [user1id],
      createdAt: new Date().toISOString(),
      createdBy: user1id,
    },
  };

  await Promise.all(Object.entries(storedGames).map(([id, entry]) => GameRepo.set(id, entry)));
}

/** Reset stored threads with example data */
async function resetStoredThreads() {
  const user0id = (await getUserByUsername("user0"))!.userId;
  const user1id = (await getUserByUsername("user1"))!.userId;
  const user2id = (await getUserByUsername("user2"))!.userId;
  const user3id = (await getUserByUsername("user3"))!.userId;

  const storedThreads: { [key: string]: ThreadRecord } = {
    abadcafeabadcafeabadcafe: {
      createdBy: user1id,
      createdAt: new Date().toISOString(),
      title: "Nim?",
      text: "Is anyone around that wants to play Nim? I'll be here for the next hour or so.",
      comments: [],
    },
    deadbeefdeadbeefdeadbeef: {
      createdBy: user1id,
      createdAt: new Date("2025-04-02").toISOString(),
      title: "Hello game knights",
      text: "I'm a big Nim buff and am excited to join this community.",
      comments: [],
    },
    [randomUUID().toString()]: {
      createdBy: user3id,
      createdAt: new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      title: "Other games?",
      text: "Nim is great, but I'm hoping some new strategy games will get introduced soon.",
      comments: [],
    },
    [randomUUID().toString()]: {
      createdBy: user2id,
      createdAt: new Date("2025-04-04").toISOString(),
      title: "Strategy guide?",
      text: "I'm pretty confused about the right strategy for Nim, is there anyone around who can help explain this?",
      comments: [],
    },
    [randomUUID().toString()]: {
      createdBy: user0id,
      createdAt: new Date(new Date().getTime() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
      title: "New game: multiplayer number guesser!",
      text: "Strategy.town now has an exciting new game: guess! Try it out today: multiple people can join this exciting game, and guess a number between 1 and 100!",
      comments: [],
    },
  };
  await Promise.all(Object.entries(storedThreads).map(([id, entry]) => ThreadRepo.set(id, entry)));
}

/** Reset stored users with example data */
async function resetStoredUsers() {
  await createUser("user0", "pwd0000", new Date());
  await createUser("user1", "pwd1111", new Date());
  await createUser("user2", "pwd2222", new Date());
  await createUser("user3", "pwd3333", new Date());

  await updateUser("user0", { display: "The Knight Of Games" });
  await updateUser("user1", { display: "Yāo" });
  await updateUser("user2", { display: "Sénior Dos" });
  await updateUser("user3", { display: "Frau Drei" });
}

export async function resetEverythingToDefaults() {
  await AuthRepo.clear();
  await ChatRepo.clear();
  await CommentRepo.clear();
  await GameRepo.clear();
  await MessageRepo.clear();
  await ThreadRepo.clear();
  await UserRepo.clear();

  await resetStoredUsers();
  await resetStoredThreads();
  await resetStoredGames();
}
