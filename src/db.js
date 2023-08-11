import { MongoClient } from "mongodb";

let connected = false;
const client = new MongoClient(
  "mongodb://127.0.0.1:27017/?directConnection=true"
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
  return client.db("starwarstl");
};

export const startSession = async () => {
  await connect();
  return client.startSession();
};
