import * as fs from "fs/promises";
import sharp from "sharp";
// import fetch from "node-fetch";

fs.close();
// let resp = await fetch(`https://static.wikia.nocookie.net/starwars/images/5/5a/Epguide05.jpg/revision/latest?cb=20211005104816`);
// let buffer = await resp.buffer();
let buffer = await fs.readFile("");
await sharp("../client/public/images/Light of the Jedi cover.webp").resize(100).toFile("qwe.webp");
// await fs.writeFile(`qwe.jpg`, buffer);
