// Redis connection config shared across the server.
// BullMQ builds its own connections from the URL
// The WebSocket bridge still needs real clients, so we expose a factory for that.

import { Redis, type RedisOptions } from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("Wrong URL");
}

// after the guard above this should always a string
export const REDISURL: string = REDIS_URL;

/**
 * Extra ioredis TLS options for the configured URL.
 *
 * Our self-hosted Redis terminates TLS with a SELF-SIGNED certificate, so a
 * `rediss://` URL needs `rejectUnauthorized: false` — otherwise ioredis (and
 * therefore BullMQ's blocking queue reads) refuses the unverified cert and
 * every connection dies. Plaintext `redis://` and publicly-CA-signed
 * `rediss://` endpoints need nothing extra. The connection is still encrypted
 * in transit; access control is the Redis password (`requirepass`). To harden
 * later, pin the server's cert via `tls.ca` instead of disabling verification.
 */
export function redisTlsOptions(url: string): Pick<RedisOptions, "tls"> {
  return url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
}

// BullMQ takes plain connection options. This connection runs the blocking
// queue reads (bzpopmin), so it MUST carry the TLS option for a self-signed
// rediss:// endpoint too — not just the bridge client below.
export const bullConnection = { url: REDISURL, ...redisTlsOptions(REDISURL) };

// the bridge needs actual clients (pub/sub + snapshot reads), so make them here.
// maxRetriesPerRequest null keeps behaviour consistent with bullmq connections.
export function createRedisConnection(): Redis {
  return new Redis(REDISURL, { maxRetriesPerRequest: null, ...redisTlsOptions(REDISURL) });
}
