import { MongoClient } from "mongodb";
import { dbName, mongoURI } from "./global.js";

const client = new MongoClient(mongoURI);

let initPromise;

const init = async () => {
  process.stdout.write("Connecting to the DB...");
  await client.connect();
  console.log(" Connected!");

  const db = client.db(dbName);

  // Indexes
  await db.collection("media").createIndex(
    { pageid: 1 },
    {
      unique: true,
      partialFilterExpression: {
        notUnique: { $in: [false, null] },
        pageid: { $exists: true },
      },
    },
  );
  await db.collection("missingMedia").createIndex(
    { pageid: 1 },
    {
      unique: true,
      partialFilterExpression: {
        notUnique: { $in: [false, null] },
        pageid: { $exists: true },
      },
    },
  );
  await db.collection("lists").createIndex(
    { userId: 1, name: 1 },
    {
      unique: true,
      collation: {
        locale: "en",
        strength: 2,
      },
    },
  );
  await db
    .collection("users")
    .createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { authType: "email" } },
    );
  await db
    .collection("users")
    .createIndex(
      { oauthId: 1 },
      { unique: true, partialFilterExpression: { authType: "google" } },
    );
  await db.collection("users").createIndex({ name: 1 }, { unique: true });
};

async function ensureInit() {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;
}

export const getDatabase = async () => {
  await ensureInit();
  return client.db(dbName);
};

export const startSession = async () => {
  await ensureInit();
  return client.startSession();
};
