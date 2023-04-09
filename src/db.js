import { MongoClient } from "mongodb";

let connected = false;
console.log(connected);
const client = new MongoClient(
  "mongodb://127.0.0.1:27017/?directConnection=true"
);

export const getDatabase = async () => {
  if (!connected) {
    process.stdout.write("Connecting to the DB...");
    await client.connect();
    console.log(" Connected!");
    connected = true;
  }
  return client.db("starwarstl");
};
