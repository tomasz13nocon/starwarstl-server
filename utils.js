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

export let log;
if (process.stdout.isTTY) {
  log = logWithStatusbar();
  log.setStatusBarText([""]);
}
else {
  console.setStatusBarText = () => {};
  log = console;
}

// For dates in format yyyy-mm-dd that lack a month or day, or have question marks in their place
// return the latest possible date e.g. 2022-??-?? => 2022-12-31
export const unscuffDate = (date) => {
  date = date.replaceAll('–', '-'); // endash
  if (/^\d{4}[-?]*$/.test(date)) return `${date.slice(0, 4)}-12-31`;
  if (/^\d{4}-\d{2}[-?]*$/.test(date)) {
    let d = new Date(date.slice(0, 4), parseInt(date.slice(5, 7)), 0);
    return `${d.getFullYear()}-${(d.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  }
  return date;
};

