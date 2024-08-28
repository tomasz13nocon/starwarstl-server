import { cache } from "../cache.js";
import { getDatabase } from "../db.js";

let db = await getDatabase();

export async function getMetaInfo(req, res) {
  const info = await cache("meta", () => db.collection("meta").findOne());
  const mediaCount = await cache("mediaCount", () =>
    db.collection("media").countDocuments(),
  );
  const characterCount = await cache("characterCount", () =>
    db.collection("characters").countDocuments(),
  );
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
