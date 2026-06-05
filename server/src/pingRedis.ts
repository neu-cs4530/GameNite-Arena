/* eslint no-console: "off" */

//Test File to check Connection to the Upstash Server
import "dotenv/config";
import { createRedisConnection } from "./services/redis.ts";

const redis = createRedisConnection();
const REPLY = await redis.ping();
console.log("Redis says:", REPLY);
await redis.quit();
