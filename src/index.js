import express from "express";
import cors from "cors";
import compression from "compression";

import { cache } from "./cache.js";
import { getDatabase } from "./db.js";
import { ObjectId } from "mongodb";

const API = "/api/";
const MEDIA = "media/";
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
  res.json(
    await cache("media-details", () =>
      db
        .collection("media")
        .aggregate([
          {
            $set: {
              hasAppearances: {
                $cond: [{ $not: ["$appearances"] }, false, true],
              },
            },
          },
          {
            $project: {
              appearances: 0,
            },
          },
        ])
        .toArray()
    )
  );
});

app.get(`${API}${MEDIA}:id`, async (req, res) => {
  let oid;
  try {
    oid = ObjectId(req.params.id);
  } catch (e) {
    res.status(400).send("Invalid ID");
    return;
  }
  let doc = await cache(`${MEDIA}${req.params.id}`, () =>
    db.collection("media").findOne(oid)
  );

  if (doc) {
    res.json(doc);
  } else {
    res.sendStatus(404);
  }
});

app.get(`${API}${MEDIA}:id/:field`, async (req, res) => {
  // let oid;
  // try {
  //   oid = ObjectId(req.params.id);
  // } catch (e) {
  //   res.status(400).send("Invalid ID");
  //   return;
  // }
  if (isNaN(+req.params.id)) {
    res.status(400).send("Invalid ID");
    return;
  }
  let doc = await cache(`${MEDIA}${req.params.id}${req.params.field}`, () =>
    db
      .collection("media")
      .findOne(
        { _id: +req.params.id },
        { projection: { [req.params.field]: 1 } }
      )
  );

  if (doc) {
    if (doc[req.params.field] === undefined) {
      res.sendStatus(404);
    } else {
      res.json(doc[req.params.field]);
    }
  } else {
    res.sendStatus(404);
  }
});

app.get(`${API}appearances/:type`, async (req, res) => {
  let colls = await db
    .listCollections({ name: req.params.type }, { nameOnly: true })
    .toArray();
  if (!colls.length) {
    console.log(`Invalid collection ${req.params.type}`);
    res.sendStatus(404);
    return;
  }

  if (req.query.s) {
    let appearances = await db
      .collection(req.params.type)
      .find({ $text: { $search: req.query.s } })
      .toArray();

    res.json(appearances);
    return;
  }

  res.json(
    await cache(`appearances-${req.params.type}`, () =>
      db
        .collection(req.params.type)
        .find({}, { projection: { _id: 0 } })
        .toArray()
    )
  );
});

app.get(`${API}appearances/:type/:name`, async (req, res) => {
  let colls = await db
    .listCollections({ name: req.params.type }, { nameOnly: true })
    .toArray();
  if (!colls.length) {
    console.log(`Invalid collection ${req.params.type}`);
    res.sendStatus(404);
    return;
  }

  let appearances = await db
    .collection(req.params.type)
    .findOne({ name: req.params.name });

  if (!appearances) {
    res.sendStatus(404);
    return;
  }

  res.json(appearances.media);
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
