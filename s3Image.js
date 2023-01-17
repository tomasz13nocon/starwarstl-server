import "./env.js";
import sharp from "sharp";
import { Size, S3_IMAGE_PATH, log } from "./utils.js";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
const AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
const BUCKET = "starwarstl";
const s3client = new S3Client({ region: "us-east-1", credentials: { accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY } });

export class S3Image {
  static #existsCache = {};
  static s3requests = {
    read: 0,
    write: 0,
  };

  constructor(filename) {
    this.filename = filename;
  }

  /** Returns true if any size variant is missing */
  async anyMissing() {
    // only check full size because S3 requests cost money 🤷
    // return await this.exists();
    let exists = {};
    for (const [key, value] of Object.entries(Size)) {
      exists[key] = await this.exists(value);
    }
    return Object.values(exists).some(e => e === false);
  }

  async exists(size = Size.FULL) {
    if (S3Image.#existsCache[size] !== undefined) {
      return S3Image.#existsCache[size][this.filename];
    }

    let truncated = true;
    let continuationToken;
    S3Image.#existsCache[size] = {};
    while (truncated) {
      const response = await s3client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${S3_IMAGE_PATH}${size}`, ContinuationToken: continuationToken }));
      S3Image.s3requests.read++;

      for (let item of response.Contents) {
        S3Image.#existsCache[size][item.Key] = true;
      }

      truncated = response.IsTruncated;
      if (truncated) {
        continuationToken = response.NextContinuationToken;
      }
    }

    // if (this.existsCache[size] !== undefined) {
    //   return this.existsCache[size];
    // }
    // try {
    //   await s3client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `${S3_IMAGE_PATH}${size}${this.filename}` }));
    //   S3Image.s3requests.read++;
    // }
    // catch (e) {
    //   if (e.$metadata.httpStatusCode === 404) {
    //     this.existsCache[size] = false;
    //     return false;
    //   }
    //   throw e;
    // }
    // this.existsCache[size] = true;
    // return true;
  }

  async read(size = Size.FULL) {
    let data = (await s3client.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${S3_IMAGE_PATH}${size}${this.filename}`}))).Body;
    S3Image.s3requests.read++;
    return new Promise((resolve, reject) => {
      const chunks = [];
      data.on('data', chunk => chunks.push(chunk));
      data.once('end', () => resolve(Buffer.concat(chunks)));
      data.once('error', reject);
    });
  }

  async write(buffer, size = Size.FULL) {
    await s3client.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${S3_IMAGE_PATH}${size}${this.filename}`, Body: buffer, ContentType: "image/webp" }));
    S3Image.s3requests.write++;
  }

  async writeVariantsIfMissing(buffer) {
    let b;
    let resized = "";
    if (!await this.exists(Size.MEDIUM)) {
      b = await sharp(buffer).resize(500, null, { withoutEnlargement: true }).toBuffer();
      await this.write(b, Size.MEDIUM);
      resized += "medium, ";
    }
    if (!await this.exists(Size.SMALL)) {
      b = await sharp(buffer).resize(220, null, { withoutEnlargement: true }).toBuffer();
      await this.write(b, Size.SMALL);
      resized += "small, ";
    }
    if (!await this.exists(Size.THUMB)) {
      b = await sharp(buffer).resize(55, null, { withoutEnlargement: true }).toBuffer();
      await this.write(b, Size.THUMB);
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
    await s3client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `${S3_IMAGE_PATH}${size}${this.filename}` }));
    S3Image.s3requests.write++;
  }
}

