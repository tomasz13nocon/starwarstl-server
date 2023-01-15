import * as fs from "fs/promises";
import sharp from "sharp";

let dir = "../client/public/img/tv-images/"
let filesRaw = await fs.readdir(dir);
let files = [];
for (let f of filesRaw)
  if (!(await fs.stat(dir + f)).isDirectory())
    files.push(f);
for (let f of files)
  await sharp(dir + f).webp({ nearLossless: true }).resize(null, 32).toFile(`${dir}thumb/${f}`);
