import { cache } from "../cache.js";
import { getDatabase } from "../db.js";

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
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  let doc = db.collection("media").findOne({ _id: id });

  if (doc) {
    res.json(doc);
  } else {
    res.status(404).json({});
  }
};

export const getMediaField = async (req, res) => {
  let { id, field } = req.params;
  id = +id;

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  let doc = await db
    .collection("media")
    .findOne({ _id: id }, { projection: { [field]: 1 } });

  if (doc) {
    if (doc[field] === undefined) {
      res.status(404).json({});
    } else {
      res.json(doc[field]);
    }
  } else {
    res.status(404).json({});
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
