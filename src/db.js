import { MongoClient } from "mongodb";
import { dbName } from "./global";

let connected = false;
const client = new MongoClient(
  "mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0",
);

const connect = async () => {
  if (!connected) {
    process.stdout.write("Connecting to the DB...");
    await client.connect();
    console.log(" Connected!");
    connected = true;
  }
};

export const getDatabase = async () => {
  await connect();
  return client.db(dbName);
};

export const startSession = async () => {
  await connect();
  return client.startSession();
};
