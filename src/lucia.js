import { lucia } from "lucia";
import { express } from "lucia/middleware";
import { mongodb } from "./adapter-mongodb.js";
import { getDatabase } from "./db.js";

let db = await getDatabase();

export const auth = lucia({
  env: process.env.NODE_ENV === "development" ? "DEV" : "PROD",
  middleware: express(),
  adapter: mongodb(db),

  getUserAttributes: (user) => {
    return { username: user.username, createdAt: user.createdAt };
  },
});
