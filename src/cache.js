import { createClient } from "redis";
import { redisURI } from "./global.js";

const redis = createClient({
  url: redisURI,
});
redis.on("error", (err) => console.error("Redis Client Error", err));
await redis.connect();

// Returns data returned by awaiting `missCb`,
// and cache it for future invocations of this function with the same `name`.
export const cache = async (name, missCb) => {
  let value = await redis.get(name);

  if (value !== null) return JSON.parse(value);

  let data = await missCb();
  await redis.set(name, JSON.stringify(data));
  return data;
};
