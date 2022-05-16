import * as fs from "fs/promises";
import sharp from "sharp";
// import fetch from "node-fetch";
import { MongoClient } from  "mongodb";
import { decode } from "html-entities";

console.log(decode("https://qwe.com/lol#xd"));

// const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true");
// await client.connect();
// let db = client.db("swtimeline");
// await db.collection("series").updateOne({title: "Droid Tales"}, {$set: {type: "yr"}});
// await client.close();

// let resp = await fetch(`https://static.wikia.nocookie.net/starwars/images/5/5a/Epguide05.jpg/revision/latest?cb=20211005104816`);
// let buffer = await resp.buffer();
// let buffer = await fs.readFile("");
// let filename = "MonsterOfTemplePeak3 Cover.webp";
// let buffer = await fs.readFile(`../client/public/images/${filename}`);
// await sharp(buffer).webp({quality:90}).resize(220).toFile("90.webp");
// await sharp(buffer).webp({quality:95}).resize(220).toFile("95.webp");
// await sharp(buffer).webp({quality:100}).resize(220).toFile("100.webp");
// await sharp(buffer).webp({lossless:true}).resize(220).toFile("lossless.webp");
// await sharp(buffer).webp({nearLossless:true}).resize(220).toFile("nearLossless.webp");
// await sharp(buffer).webp({nearLossless:true}).resize(220).toFile("nearLossless.webp");
// await sharp(buffer).resize(220).toFile("default.webp");
// await fs.writeFile(`qwe.jpg`, buffer);
