import { cache } from "../cache.js";
import { getDatabase } from "../db.js";

let db = await getDatabase();

export const getAppearances = async (req, res) => {
  const { type } = req.params;

  let colls = await db
    .listCollections({ name: type }, { nameOnly: true })
    .toArray();
  if (!colls.length) {
    console.log(`Invalid collection ${type}`);
    res.sendStatus(404);
    return;
  }

  if (req.query.s) {
    let appearances = await db
      .collection(type)
      .find({ $text: { $search: req.query.s } })
      .toArray();

    res.json(appearances);
    return;
  }

  res.json(
    await cache(`appearances-${type}`, () =>
      db
        .collection(type)
        .find({}, { projection: { _id: 0 } })
        .toArray()
    )
  );
};

export const getAppearance = async (req, res) => {
  const { type, name } = req.params;

  let colls = await db
    .listCollections({ name: type }, { nameOnly: true })
    .toArray();
  if (!colls.length) {
    console.log(`Invalid collection ${type}`);
    res.sendStatus(404);
    return;
  }

  let appearances = await db.collection(type).findOne({ name: name });

  if (!appearances) {
    res.sendStatus(404);
    return;
  }

  res.json(appearances.media);
};
