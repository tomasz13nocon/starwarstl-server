import { auth } from "../auth.js";
import { cache } from "../cache.js";
import { getDatabase, watchedName, watchlistName } from "../db.js";
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

export const getUserLists = async (req, res) => {
  let session = await authenticate(req, res);
  if (!session) {
    return res.sendStatus(401);
  }

  let lists = await db
    .collection("lists")
    .find({ userId: session.user.userId })
    .toArray();
  console.log(lists);
  res.json(lists);
};

export const getWatched = async (req, res) => {
  let session = await authenticate(req, res);
  console.log(session);

  let result = await db
    .collection("lists")
    .findOne({ userId: session.user.userId, name: watchedName });

  res.json(result);
};

export const addToWatched = async (req, res) => {
  addToList(req, res, watchedName);
};

export const addToWatchlist = async (req, res) => {
  addToList(req, res, watchlistName);
};

export const addToList = async (req, res, name) => {
  let session = await authenticate(req, res);
  if (!session) {
    return res.status(401).json({ error: "Not logged in" });
  }
  let { pageid } = req.body;

  //TODO validation

  await db
    .collection("lists")
    .updateOne(
      { userId: session.user.userId, name },
      { $addToSet: { items: pageid } },
      { upsert: true },
    );
  // TODO maybe detec if already was in the list (modifiedCount === 1)
  res.status(200).json({});
};

export const removeFromWatched = async (req, res) => {
  removeFromList(req, res, watchedName);
};

export const removeFromWatchlist = async (req, res) => {
  removeFromList(req, res, watchlistName);
};

export const removeFromList = async (req, res, name) => {
  let session = await authenticate(req, res);
  if (!session) {
    return res.status(401).json({ error: "Not logged in" });
  }
  let { id } = req.params;
  id = +id;

  //TODO validation

  let result = await db
    .collection("lists")
    .updateOne({ userId: session.user.userId, name }, { $pull: { items: id } });
  res.status(200).json({});
};
