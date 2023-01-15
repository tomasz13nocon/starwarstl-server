import sharp from "sharp";
import * as fs from "fs/promises";
import { Size, IMAGE_PATH, fileExists, log } from "./utils.js";

for (const [key, value] of Object.entries(Size)) {
  await fs.mkdir(`${IMAGE_PATH}${value}`, { recursive: true });
}

export class FsImage {
  constructor(filename) {
    this.filename = filename;
    this.existsCache = {};
  }

  /** Returns true if any size variant is missing */
  async anyMissing() {
    let exists = {};
    for (const [key, value] of Object.entries(Size)) {
      exists[key] = await this.exists(value);
    }
    return Object.values(exists).some(e => e === false);
  }

  async exists(size = Size.FULL) {
    if (this.existsCache[size] !== undefined) {
      return this.existsCache[size];
    }
    this.existsCache[size] = await fileExists(`${IMAGE_PATH}${size}${this.filename}`);
    return this.existsCache[size];
  }

  async read(size = Size.FULL) {
    return await fs.readFile(`${IMAGE_PATH}${size}${this.filename}`);
  }

  async write(buffer, size = Size.FULL) {
    await fs.writeFile(`${IMAGE_PATH}${size}${this.filename}`, buffer);
  }

  async writeVariantsIfMissing(buffer) {
    let resized = "";
    if (!await this.exists(Size.MEDIUM)) {
      await sharp(buffer).resize(500, null, { withoutEnlargement: true }).toFile(`${IMAGE_PATH}${Size.MEDIUM}${this.filename}`);
      resized += "medium, ";
    }
    if (!await this.exists(Size.SMALL)) {
      await sharp(buffer).resize(220, null, { withoutEnlargement: true }).toFile(`${IMAGE_PATH}${Size.SMALL}${this.filename}`);
      resized += "small, ";
    }
    if (!await this.exists(Size.THUMB)) {
      await sharp(buffer).resize(55, null, { withoutEnlargement: true }).toFile(`${IMAGE_PATH}${Size.THUMB}${this.filename}`);
      resized += "thumb, ";
    }
    if (resized) {
      log.info(`Resized ${this.filename} to ${resized.slice(0, -2)}`);
    }
  }

  /** If size is undefined delete all sizes. */
  async delete(size) {
      if (size === undefined) {
        for (const s of Object.values(Size)) {
          await this.#deleteHelper(s);
        }
      }
      else {
        await this.#deleteHelper(size);
      }
  }

  async #deleteHelper(size) {
    try {
      await fs.unlink(`${IMAGE_PATH}${size}${this.filename}`);
    } catch (e) {
      // If it doesn't exist, we're chilling
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
  }
}
