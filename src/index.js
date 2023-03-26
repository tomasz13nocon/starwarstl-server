import express from "express";
import cors from "cors";
import compression from "compression";

import { cache } from "./cache.js";
import { getDatabase } from "./db.js";

const API = "/api/";
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.use(compression());

let db = await getDatabase();

const getMedia = () => {
  return db
    .collection("media")
    .find(
      {},
      {
        projection: {
          title: 1,
          releaseDate: 1,
          type: 1,
          fullType: 1,
          writer: 1,
          chronology: 1,
          date: 1,
          unreleased: 1,
          exactPlacementUnknown: 1,
        },
      }
    )
    .toArray();
};

app.get(`${API}media`, async (req, res) => {
  res.json(await cache("media", getMedia));
});

app.get(`${API}media-details`, async (req, res) => {
  // await new Promise((resolve) => setTimeout(resolve, 2000)); // Test long response time
  res.json(
    await cache("media-details", () => db.collection("media").find().toArray())
  );
});

app.get(`${API}media-random`, async (req, res) => {
  res.json(
    (
      await db
        .collection("media")
        .aggregate([{ $sample: { size: 1 } }])
        .toArray()
    )[0]
  );
});

app.get(`${API}series`, async (req, res) => {
  // TODO only titles
  res.json(
    await cache("series", () => db.collection("series").find().toArray())
  );
});

app.listen(5000, () => {
  console.log("Server started on port 5000");
});
