import { getDatabase } from "./db.js";

let cacheStore = {};
let db = await getDatabase();

// Throws if meta collection is empty in DB
const getTimestamp = async () => {
  return (await db.collection("meta").find().toArray())[0].dataUpdateTimestamp;
};

// Returns data returned by awaiting `missCb`,
// and cache it for future invocations of this function with the same `name`.
// Throws if meta.dataUpdateTimestamp is not set in DB
export const cache = async (name, missCb) => {
  if (!cacheStore[name]) {
    let timestamp = await getTimestamp(name);
    let data = await missCb();
    cacheStore[name] = {
      timestamp,
      data,
    };
    return data;
  }

  // Validate cache asynchronously and return cached data
  getTimestamp(name, missCb).then((timestamp) => {
    if (!timestamp) {
      throw new Error("Update timestamp is falsey!");
    }
    if (timestamp > cacheStore[name]?.timestamp) {
      missCb().then((data) => {
        // Race conditions are fine, since updating the cache is idempotent, due to low frequency of updates
        // If DB updates become frequent this is not ok. We only update DB via the script so it's fine.
        cacheStore[name] = {
          timestamp: timestamp,
          data: data,
        };
      });
    }
  });
  return cacheStore[name].data;
};
