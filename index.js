import express from "express";
import cors from "cors";
import { MongoClient } from  "mongodb";

const API = "/api/"
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true");
try {
  process.stdout.write("Connecting to the DB...");
  await client.connect();
  console.log(" Connected!");

  let db = client.db("swtimeline");
  // let collection = db.collection("media");

  app.get(`${API}test`, async (req, res) => {
    await new Promise(r => setTimeout(r, 2000));
    res.json({ msg: "hello" });
  });

  app.get(`${API}media`, async (req, res) => {
    // TODO cache?
    let media = await db.collection("media").find().toArray();
    res.json(media);
  });

  app.get(`${API}tv-images`, async (req, res) => {
    let tvImages = await db.collection("tv-images").find().toArray();
    res.json(tvImages);
  });

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

