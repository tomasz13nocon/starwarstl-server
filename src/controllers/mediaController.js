import { auth } from "../auth.js";
import { cache } from "../cache.js";
import { getDatabase } from "../db.js";
import { authenticate } from "./common.js";

let db = await getDatabase();

export const getAllMedia = async (req, res) => {
  const { bare } = req.query;

  if (bare) {
    res.json(
      await cache("media", () => {
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
            },
          )
          .toArray();
      }),
    );
  } else {
    res.json(
      await cache("media-details", () =>
        db
          .collection("media")
          .aggregate([
            {
              // TODO move this to fetch
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
          .toArray(),
      ),
    );
  }
};

export const getMedia = async (req, res) => {
  let { id } = req.params;
  id = +id;

  if (isNaN(id)) {
    res.status(400).send("Invalid ID");
    return;
  }
  let doc = db.collection("media").findOne({ _id: id });

  if (doc) {
    res.json(doc);
  } else {
    res.sendStatus(404);
  }
};

export const getMediaField = async (req, res) => {
  let { id, field } = req.params;
  id = +id;

  if (isNaN(id)) {
    res.status(400).send("Invalid ID");
    return;
  }
  let doc = await db
    .collection("media")
    .findOne({ _id: id }, { projection: { [field]: 1 } });

  if (doc) {
    if (doc[field] === undefined) {
      res.sendStatus(404);
    } else {
      res.json(doc[field]);
    }
  } else {
    res.sendStatus(404);
  }
};

export const getMediaRandom = async (req, res) => {
  res.json(
    (
      await db
        .collection("media")
        .aggregate([{ $sample: { size: 1 } }])
        .toArray()
    )[0],
  );
};

export const getAllSeries = async (req, res) => {
  // TODO only titles
  res.json(
    await cache("series", () => db.collection("series").find().toArray()),
  );
};

export const getWatched = async (req, res) => {
  let session = await authenticate(req, res);
  console.log(session);

  let result = await db
    .collection("lists")
    .aggregate([
      {
        $lookup: {
          from: "media",
          localField: "media",
          foreignField: "_id",
          as: "mediaDetails",
        },
      },
    ])
    .toArray();

  res.json(result);
};

export const addToWatched = async (req, res) => {
  let session = await authenticate(req, res);
  if (!session) {
    return res.sendStatus(401);
  }
  let { pageid } = req.body;

  //TODO validation

  await db
    .collection("lists")
    .updateOne(
      { userId: session.user.userId, name: "__watched" },
      { $addToSet: { media: pageid } },
      { upsert: true },
    );
  // TODO maybe say if already in the list (modifiedCount === 1)
  res.sendStatus(200);
};
