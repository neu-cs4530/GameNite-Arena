// Redis connection config shared across the server.
// BullMQ builds its own connections from the URL 
// The WebSocket bridge still needs real clients, so we expose a factory for that.

import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("Wrong URL");
}

// after the guard above this should always a string
export const redisUrl: string = REDIS_URL;

// BullMQ takes plain connection options
// this avoids the dual-ioredis type clash.
export const bullConnection = { url: redisUrl };

// the bridge needs actual clients (pub/sub + snapshot reads), so make them here.
// maxRetriesPerRequest null keeps behaviour consistent with bullmq connections.
export function createRedisConnection(): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}