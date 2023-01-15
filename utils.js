import * as fs from "fs/promises";
import logWithStatusbar from "log-with-statusbar";

export const IMAGE_PATH = process.env.IMAGE_PATH ?? "../client/public/img/covers/";
export const S3_IMAGE_PATH = "img/covers/";
export const TV_IMAGE_PATH = `../client/public/img/tv-images/thumb/`;

export const Size = Object.freeze({
  THUMB: "thumb/",
  MEDIUM: "medium/",
  SMALL: "small/",
  FULL: "full/",
});

export const buildTvImagePath = (seriesTitle) => TV_IMAGE_PATH + seriesTitle.replaceAll(" ", "_") + ".webp";

export async function fileExists(filename) {
  try {
    await fs.stat(filename);
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return false;
    }
    throw e;
  }
  return true;
}

export const log = logWithStatusbar();
log.setStatusBarText([""]);

