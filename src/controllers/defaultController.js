import { getDatabase } from "../db.js";

let db = await getDatabase();

export async function getMetaInfo(req, res) {
  const info = await db.collection("meta").findOne();
  const mediaCount = await db.collection("media").countDocuments();
  const characterCount = await db.collection("characters").countDocuments();
  const randomCharacter = (
    await db
      .collection("characters")
      .aggregate([{ $sample: { size: 1 } }])
      .toArray()
  )[0].name;

  res.json({
    dataUpdatedAt: info.dataUpdateTimestamp,
    mediaCount,
    characterCount,
    randomCharacter,
  });
}
