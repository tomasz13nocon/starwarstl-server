import express from "express";
import cors from "cors";
import { MongoClient } from  "mongodb";
import compression from "compression";

const API = "/api/";
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.use(compression());


const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true");
try {
  process.stdout.write("Connecting to the DB...");
  await client.connect();
  console.log(" Connected!");

  let db = client.db("swtimeline");
  let mediaCache, mediaTimestamp;
  let mediaDetailsCache, mediaDetailsTimestamp;
  let cacheStore = {};

  const cache = async (name, missCb) => {
    let newTimestamp = await db.collection("meta").find().toArray();
    newTimestamp = newTimestamp[0].dataUpdateTimestamp;
    if (!newTimestamp)
      console.error("UPDATE TIMESTAMP IS FALSEY!!!!");
    if (newTimestamp && newTimestamp === cacheStore[name]?.timestamp) {
      return cacheStore[name].data;
    }
    else {
      let data = await missCb();
      cacheStore[name] = {
        timestamp: newTimestamp,
        data: data,
      };
      return data;
    }
  };

  // app.get(`${API}test`, async (req, res) => {
  //   await new Promise(r => setTimeout(r, 2000));
  //   res.json({ msg: "hello" });
  // });

  app.get(`${API}media`, async (req, res) => {
    res.json(await cache("media", () => {
      return db.collection("media").find({}, { projection: { title: 1, releaseDate: 1, type: 1, fullType: 1, writer: 1, chronology: 1, date: 1, unreleased: 1, exactPlacementUnknown: 1 /* episode: 1, season: 1, series: 1, cover: 1 */ } }).toArray();
    }));
    // let media = await db.collection("media").find().limit(40).toArray();
  });

  app.get(`${API}media-details`, async (req, res) => {
    // await new Promise((resolve) => setTimeout(resolve, 2000));
    res.json(await cache("media-details", () => db.collection("media").find().toArray()));
  });

  app.get(`${API}media-random`, async (req, res) => {
    // Finn and Poe Team Up! (short story)
    res.json((await db.collection("media").aggregate([{ $sample: { size: 1 } }]).toArray())[0]);
  });

  app.get(`${API}series`, async (req, res) => {
    // TODO only titles
    res.json(await cache("series", () => db.collection("series").find().toArray()));
  });

  // app.get(`${API}tv-images`, async (req, res) => {
  //   let tvImages = await db.collection("tv-images").find().toArray();
  //   res.json(tvImages);
  // });

  // app.put("/media/:title", async (req, res) => {
  //   console.log(req.params.title);
  //   console.dir(req.body, {depth: 5});
  //   if (req.params.title !== req.body.title) {
  //     res.status(400).json({ msg: "param title must be the same as title in the body" });
  //   }
  //   let ins = await collection.findOneAndReplace({ title: req.params.title }, req.body, { upsert: true });
  //   res.json({ updatedExisting: ins.lastErrorObject.updatedExisting });
  // });


  app.listen(5000, () => {
    console.log("Server started on port 5000");
  });
}
catch (e) {
  console.error(e);
  client.close();
}

