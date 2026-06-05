//Test File to check Connection to the Upstash Server
import "dotenv/config";
import { createRedisConnection } from "./services/redis.ts";

const redis = createRedisConnection();
const reply = await redis.ping();
console.log("Redis says:", reply);
await redis.quit();