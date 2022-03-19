import wtf from "wtf_wikipedia";
import _ from "lodash";
import * as fs from "fs/promises";
import sharp from "sharp";
import { decode } from "html-entities";
import { MongoClient } from  "mongodb";
import logWithStatusbar from "log-with-statusbar";
const log = logWithStatusbar();
//import { default as fetchCache } from "node-fetch-cache";
import { fetchBuilder, FileSystemCache } from "node-fetch-cache";
import md5 from "md5";
const fetchCache = fetchBuilder.withCache(new FileSystemCache());

const IMAGE_PATH = "../client/public/images/";
const NUMBERS = {
  'one': 1,
  'two': 2,
  'three': 3,
  'four': 4,
  'five': 5,
  'six': 6,
  'seven': 7,
  'eight': 8,
  'nine': 9,
  'ten': 10,
  'eleven': 11,
  'twelve': 12,
  'thirteen': 13,
  'fourteen': 14,
  'fifteen': 15,
  'sixteen': 16,
  'seventeen': 17,
  'eighteen': 18,
  'nineteen': 19,
  'twenty': 20,
};
const seasonReg = new RegExp("^(?:season )?(" + Object.keys(NUMBERS).reduce((acc, n) => `${acc}|${n}`) + ")$");
const seasonRegWordBoundaries = new RegExp("(?:season )?\\b(" + Object.keys(NUMBERS).reduce((acc, n) => `${acc}|${n}`) + ")\\b");

(() => {
  wtf.extend((models, templates) => {
    let parse = models.parse;

    templates.c = (tmpl, list) => {
      let x = parse(tmpl, ["value"]);
      list.push({ template: "C", value: x.value });
      return `((${x.value}))`;
    };

    templates.circa = (tmpl, list) => {
      let x = parse(tmpl, ["value"]);
      list.push({ template: "C", value: x.value });
      return `((Approximate date))`;
    };

    // Ignore quotes found at the begining of articles so that the first paragraph is the actual article
    templates.quote = (tmpl, list) => {
      list.push(parse(tmpl, ["text", "author"]));
      return "";
    };

    templates["scroll box"] = (tmpl, list) => {
      // TODO
      // console.log(parse(tmpl));
      //list.push({ template: "Scroll Box", value: wtf(tmpl) });
      return tmpl;
    };
  });
})();

const toCamelCase = str => {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
};

// keys is an array of:
// - strings representing infobox key
// - objects where:
// -- aliases: array of strings, where the first element is an infobox key (this is used for DB key) and the rest are aliases
// -- details: boolean wheter to add "Details" to the key name
// returns object mapping camelCased key for DB to infobox value
const getInfoboxData = (infobox, keys) => {
  let ret = {};
  for (let key of keys) {
    if (typeof key === "string")
      key = { aliases: [key] };
    let value;

    for (let alias of key.aliases) {
      value = infobox.get(alias);
      if (value.text() !== "")
        break;
    }
    let dbKey = toCamelCase(key.aliases[0]);
    if (key.details)
      dbKey += "Details";
    ret[dbKey] = value;
  }
  return ret;
};

const toHumanReadable = (n) => {
  if (n < 1000) return `${n} B`;
  else if (n < 1000000) return `${n / 1000} KB`;
  else if (n < 1000000000) return `${n / 1000000} MB`;
  else if (n < 1000000000000) return `${n / 1000000000} GB`;
}

// Code extracted to use in fetchWookiee and fetchImageInfo
const fetchWookieeHelper = async function* (titles, apiParams = {}) {
  if (typeof titles === "string") titles = [titles];
  // Fandom allows up to 50 titles per request
  for (let i = 0; i < titles.length; i+=50) {
    let titlesStr = titles.slice(i, i+50).reduce((acc, t) => acc += t + "|", "").slice(0, -1);
    const apiUrl = `https://starwars.fandom.com/api.php?\
action=query&\
format=json&\
origin=*&\
maxlag=1&\
maxage=604800&\
titles=${encodeURIComponent(titlesStr)}\
${Object.entries(apiParams).reduce((acc, [key, value]) => acc += `&${key}=${value}`, "")}`;
    const resp = await fetchCache(apiUrl); // TODO switch to normal fetch
    if (!resp.ok) {
      throw "Non 2xx response status! Response:\n" + JSON.stringify(resp);
    }
    log.info(`Recieved ${toHumanReadable((await resp.clone().blob()).size)} of ${apiParams.prop}`);
    const json = await resp.json();
    let pages = Object.values(json.query.pages);
    // If there's random symbols or underscores in the title it gets normalized,
    // so we make the normalized version part of the return value
    let normalizations = {};
    if (json.query.normalized) {
      // log.info("Normalized: ", json.query.normalized);
      // log.info("Normalized ", json.query.normalized.length, " items");
      for (let normalization of json.query.normalized) {
        normalizations[normalization.to] = normalization.from;
      }
    }
    for (let page of pages) {
      page.normalizedFrom = normalizations[page.title];
      yield page;
    }
  }
}

// yields objects containing title, pageid and wikitext
// number of yields will be the same as the amount of valid titles provided (ones that have an article on Wookieepedia)
// titles needs to be a string (single title) or a non empty array of strings
const fetchWookiee = async function* (titles) {
  for await (let page of fetchWookieeHelper(titles, { prop: "revisions", rvprop: "content|timestamp", rvslots: "main" })) {
    if (page.missing !== undefined) {
      yield {
        title: page.title,
        missing: true,
      };
    }
    yield {
      title: page.title,
      pageid: page.pageid,
      wikitext: page.revisions?.[0].slots.main["*"],
      timestamp: page.revisions?.[0].timestamp,
      // If there's no normalization for this title this field is just undefined
      normalizedFrom: page.normalizedFrom,
    };
  }
};

const fetchImageInfo = async function* (titles) {
  for await (let page of fetchWookieeHelper(titles, { prop: "imageinfo", iiprop: "url|sha1|timestamp" })) {
    if (page.missing !== undefined) {
      yield {
        title: page.title,
        missing: true,
      };
    }
    yield {
      title: page.title,
      pageid: page.pageid,
      sha1: page.imageinfo?.[0].sha1,
      timestamp: page.imageinfo?.[0].timestamp,
      url: page.imageinfo?.[0].url,
      // If there's no normalization for this title this field is just undefined
      normalizedFrom: page.normalizedFrom,
    };
  }
};

/**
 * If article doesn't exist returns null
 */
const docFromTitle = async (title) => {
  let page = (await fetchWookiee(title).next()).value;
  if (page.missing)
    return null;
  return wtf(page.wikitext);
}

// Returns a promise resolving to a target audience string from wtf doc
const getAudience = async (doc) => {
  // We can't rely on books.disney.com even though it's the most official source,
  // because a lot of books are aribitrarily not there
  // TODO: categories properly (nested categories etc.)
  let categories = doc.categories();
  if (categories.includes("Canon adult novels")) return "a";
  if (categories.includes("Canon young-adult novels")) return "ya";
  if (categories.includes("Canon Young Readers")) return "yr";
  // TODO: audio dramas
  // if (categories.includes("Canon audio dramas")) return "ad";
  let sentence = doc.sentence(0).text();
  //let mediaType = doc.infobox().get("media type").text();
  const reg = (str) => {
    let jr = /junior|middle[ -]grade|young[ -]reader/i;
    let ya = /young[ -]adult/i;
    let a = /adult|canon novel/i;
    if (jr.test(str)) return "jr";
    if (ya.test(str)) return "ya";
    if (a.test(str)) return "a";
    return null;
  };
  let regSentence = reg(sentence);
  if (regSentence) return regSentence;
  let seriesTitle;
  try {
    seriesTitle = doc.infobox().get("series").links()[0].json().page;
  } catch (e) {
    log.warn(
      `Couldn't get a 'series' from infobox. title: ${doc.title()}, series: ${seriesTitle}, error: `,
      e.name + ":",
      e.message
    );
    return null;
  }
  log.info(`Getting series: ${seriesTitle} for ${doc.title()}`);
  let seriesDoc = await docFromTitle(seriesTitle);
  log.info(`title: ${seriesDoc.title()} (fetched: ${seriesTitle})`);
  log.info(`sentence: ${seriesDoc.sentence(0)}, text: ${seriesDoc.sentence(0).text()}`);
  let seriesSentence = seriesDoc.sentence(0).text();
  return reg(seriesSentence);
};

// Returns "yyyy-mm-dd" from a date string
const normalizeDate = (str) => {
  let date = new Date(str);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
};

// Takes a text node, returns an array of text and note nodes. Also removes italics/bold... (I really need a new parser...)
// If no notes in text, the array contains just the text node.
// If text node has an empty note and nothing else: "(())" returns empty array
const processNotes = (textNode) => {
  textNode.text = textNode.text.replace(/'{2,}/g, "");
  let nodes = [];
  let matches = textNode.text.split(/\(\((.*?)\)\)/);
  for (let [i, match] of matches.entries()) {
    if (match) {
      // note
      if (i % 2) {
        nodes.push({ ...textNode, type: "note", text: match });
      }
      // text
      else if (match) {
        nodes.push({ ...textNode, text: match });
      }
    }
  }
  return nodes;
};

// I'm not proud of this code but it just werks™
const processAst = (sentence) => {
  if (!sentence) return sentence;

  // What follows is a rather nasty code that reads lists from the sentence's ast.
  // Ideally we would get this from the parser, but doing this in wtf_wikipedia would be even harder and nastier.
  let newAst = [],
    list = [],
    listItem = [],
    current = newAst; // What we're pushing to (the new AST or a list item inside of it)
  for (let [i, astNode] of sentence.ast().entries()) {
    astNode = _.mapValues(astNode, (e) =>
      typeof e === "string" ? decode(e) : e
    );
    // If it's not a text node, just push
    if (astNode.type !== "text") {
      // TODO delete unwanted properties. Like "raw" on links
      delete astNode.raw;
      current.push(astNode);
      continue;
    }

    // PSEUDO CODE
    /*
        Special case for first line starting with a star
            open list

        Loop through \n occurences
            If followed by *
                add preceding text to current
                If current is list
                    add new list item to list
                Else
                    open list
            Else // not followed by *
                If current is list
                    add preceding text to current
                    close list
                Else // current is not list
                    concat preceding text with compunding text
                    */

    // When a list is at the beginning the star isn't preceded by \n
    if (i === 0 && astNode.text.startsWith("*")) {
      // Start a list
      listItem = [];
      list = [listItem];
      current = listItem;
      newAst.push({ type: "list", data: list });
      astNode.text = astNode.text.replace(/^\*+/, "");
    }

    let lines = astNode.text.split(/\n/);
    // No newlines, just push and go next
    if (lines.length === 1) {
      //if (astNode.text)
      current.push(...processNotes(astNode));
      continue;
    }
    let preceding;
    for (let line of lines) {
      // Skip the first iteration, since we need to operate on data from 2 consecutive iterations
      if (preceding) {
        //if (preceding.text)
        current.push(...processNotes(preceding));

        if (line.startsWith("*")) {
          if (current === listItem) {
            // Append new list item
            listItem = [];
            current = listItem;
            list.push(listItem);
          } else {
            // Start a list
            listItem = [];
            current = listItem;
            list = [listItem];
            newAst.push({ type: "list", data: list });
          }
        } else {
          // line doesn't start with a *
          if (current === listItem) {
            // current = astNode;
            current = newAst;
          } else {
            // Concatenate consecutive text nodes (not absolutely necessary, we can just have them next to each other)
            // log.error("Not implemented");
          }
        }
      }
      // remove the leading stars (and spaces)
      preceding = { ...astNode, text: line.replace(/^\*+ */, "") };
    }
    // Add the last line
    //if (preceding.text)
    current.push(...processNotes(preceding));
  }

  // If there's just one text node return its text.
  return newAst.length === 1 && newAst[0].type === "text"
    ? newAst[0].text
    : newAst;
};



log.info("Fetching timeline...");
//let timelineDoc = wtf(timelineString);
// let timelineDoc = wtf(await fs.readFile("../client/sample_wikitext/timeline", "utf-8"));
let timelineDoc = wtf((await fetchWookiee("Timeline of canon media").next()).value.wikitext);
//let timelineDoc = await fetchWookiee("Timeline_of_Legends_media");
let data = timelineDoc.tables()[1].json();
// data = data.slice(0,50);

const types = {
  C: "comic",
  N: "book",
  SS: "short story",
  YR: "yr",
  JR: "book",
  TV: "tv",
  F: "film",
  VG: "game",
}


let operations = [];
let drafts = {};
let nopageDrafts = [];
let tvTypes = {};

log.info("Processing timeline...");
for (let [i, item] of data.entries()) {
  // TODO: validation to check wheter we're getting the right table
  let draft = {
    title: decode(item.Title.links?.[0].page),
    type: types[item.col2.text],
    releaseDate: item.Released.text,
    writer: item["Writer(s)"].links?.map((e) => decode(e.page)) || null,
    date: decode(item.Year.text) || null,
    chronology: i,
  };
  if (item.col2.text === "JR")
    draft.audience = "jr";
  if (draft.type === undefined) {
    if (item.col2.text !== "P")
      log.warn("Timeline parsing warning: Unknown type, skipping. type: " + item.col2.text);
    continue;
  }
  // TODO: uncomment?
  // if (isNaN(new Date(draft.releaseDate)))
    // delete draft.releaseDate;

  // This usually happens for some yet to be release media like tv episodes
  if (!draft.title) {
    log.warn("Timeline parsing warning: Title is empty! setting nopage to true. Title cell:\n\"" + item.Title.text + '"');
    draft.title = item.Title.text.replace("†", "").trim().replace(/^"(.*)"$/, "$1");
    draft.nopage = true;
    nopageDrafts.push(draft);
    continue;
  }
  //log.info(draft.title, JSON.stringify(item.Title));
  drafts[draft.title] = draft;
}

log.info("Fetching articles...");
let progress = 0;
let outOf = Object.keys(drafts).length;
log.setStatusBarText([`Article: ${progress}/${outOf}`]);

let pages = fetchWookiee(Object.keys(drafts));

// while (!(page = await pages.next()).done && !(imageinfo = await imageinfos.next()).done) {
for await (let page of pages) {
  if (page.missing) 
    throw `Page missing! "${page.title}" is not a valid wookieepedia article.`;

  if (page.normalizedFrom) {
    drafts[page.title] = drafts[page.normalizedFrom];
    delete drafts[page.normalizedFrom];
  }
  let draft = drafts[page.title];
  draft.title = page.title;
  draft.wookieepediaId = page.pageid;
  draft.revisionTimestamp = page.timestamp;
  // This should never happen with all the checks before
  if (draft === undefined) {
    throw `Mismatch between timeline title and the title received from the server for: "${page.title}"`;
  }

  ///////////////////////////////////
  // Getting data from the article //
  ///////////////////////////////////
  let doc = wtf(page.wikitext);
  if (draft.type === "book" && !draft.audience)
    draft.audience = await getAudience(doc);

  let infobox = doc.infobox();
  if (!infobox) {
    throw `NO INFOBOX!! title: ${draft.title}`;
  }

  let type, subtype;
  // It hurts the eyes a little to see capitalized and non capitalized values next to each other but the reason for this is the filter structure explained in home.js `createState` function.
  // log.info(infobox._type);
  switch (infobox._type) {
    case "book":
      type = "book";
      break;
    case "book series":
      type = "book";
      subtype = "Series";
      break;
    case "audiobook":
      type = "audiobook";
      break;
    case "comic book":
    case "comic strip":
    case "webstrip":
    case "comic story":
      type = "comic";
      subtype = "Single issue";
      break;
    case "comic story arc":
      type = "comic";
      subtype = "Story arc";
      break;
    case "comic series":
      type = "comic";
      subtype = "Series";
      break;
    case "trade paperback":
      type = "comic";
      subtype = "Trade paperback";
      break;
    case "short story":
      type = "short story";
      break;
    case "reference book":
      type = "reference book";
      break;
    case "video game":
      type = "video game";
      break;
    case "movie":
      type = "movie";
      break;
    case "television series":
      type = "tv";
      subtype = "series";
      break;
    case "television season":
      type = "tv";
      subtype = "season";
      break;
    case "television episode":
      type = "tv";
      subtype = "episode";
      break;
      //case "media":
  }

  draft.coverWook = infobox
    .get("image")
    ?.text()
    .match(/\[\[(File:.*)\]\]/)?.[1];
  // .match(/\[\[File:(.*)\]\]/)?.[1];

  for (const [key, value] of Object.entries(
    getInfoboxData(infobox, [
      { aliases: ["release date", "airdate", "publication date", "released", "first aired"], details: true },
      "closed",
      "author",
      { aliases: ["writer", "writers"], details: true },
      "developer",
      { aliases: ["season"], details: true },
      "episode",
      "production",
      "guests",
      { aliases: ["director", "directors"] },
      "producer",
      "starring",
      "music",
      "runtime",
      "budget",
      "penciller",
      "inker",
      "letterer",
      "colorist",
      "editor",
      "language",
      { aliases: ["publisher"], details: true },
      "pages",
      "cover artist",
      { aliases: ["dateDetails", "timeline"] },
      "illustrator",
      "editor",
      "media type",
      "published in",
      "engine",
      "genre",
      "modes",
      "ratings",
      "platforms",
      { aliases: ["series"], details: true },
      "basegame",
      "expansions",
      "designer",
      "programmer",
      "artist",
      "composer",
      "issue",
      "num episodes",
      "num seasons",
      "network",
      // "last aired", // TODO process like we do release date, also do first aired as a column in frontend instead of release date
      "creators",
      "executive producers",
      "prev",
      "next",
      "preceded by",
      "followed by",
      "upc",
      "isbn"
    ])
  )) {
    draft[key] = processAst(value);
  }

  draft.publisher = infobox.get("publisher").links()?.map(e => decode(e.page())) || null;
  draft.series = infobox.get("series").links()?.map(e => decode(e.page())) || null;
  let seasonText = infobox.get("season").text();
  if (seasonText) {
    let seasonTextClean = seasonText.toLowerCase().trim();
    draft.season = NUMBERS[seasonTextClean.match(seasonReg)?.[1]] ?? seasonTextClean.match(/^(?:season )?(\d+)$/)?.[1];
    if (draft.season === undefined) {
      // We use word boundaries as last resort (and log it) in order to avoid false positives.
      // log.warn(`Using word boundary regex to match season of "${draft.title}". Season text: ${seasonText}`);
      draft.season = NUMBERS[seasonTextClean.match(seasonRegWordBoundaries)?.[1]] ?? seasonTextClean.match(/(?:season )?\b(\d+)\b/)?.[1];
      if (draft.season && (seasonTextClean.search(/shorts/i) !== -1))
        draft.seasonNote = "shorts";

      if (draft.season === undefined) {
        log.error(`Couldn't get season of "${draft.title}". Season text: ${seasonText}`);
      }
    }
  }

  // Full types
  if (draft.type === "book") {
    if (type === "audiobook")
      // TODO: determine audio drama from categories
      draft.fullType = "book-audio";
    else
      draft.fullType = `book-${draft.audience}`;
  }
  else if (draft.type === "tv" && draft.series?.length) {
    if (tvTypes[draft.series])
      draft.fullType = tvTypes[draft.series];
    else {
      let seriesDoc = await docFromTitle(draft.series);
      if (!seriesDoc) {
        log.error(`Tried to fetch series "${draft.series}" for tv item "${draft.title}" but it failed.`);
      }
      else {
        // If problematic, change sentence(0) to paragraph(0)
        if (seriesDoc.sentence(0).text().search(/micro[- ]series/i) !== -1)
          draft.fullType = "tv-micro-series";
        else if (seriesDoc.categories().includes("Canon animated television series"))
          draft.fullType = "tv-animated";
        else if (seriesDoc.categories().includes("Canon live-action television series"))
          draft.fullType = "tv-live-action";
        else
          log.error(`Tv series neither live action nor animated nor micro series. Series: "${draft.series}", categories: ${seriesDoc.categories()}`);
        tvTypes[draft.series] = draft.fullType;
      }
    }
  }

  // Delete empty values
  for (const [key, value] of Object.entries(draft)) {
    if ((Array.isArray(value) && !value.length) || !value)
      delete draft[key];
  }

  // let rawDate = draft.releaseDateDetails;
  // if (rawDate) {
  //   if (typeof rawDate === "string") { // This happens only when the date is all plain text (without links, notes) which doesn't seem to be the case ever
  //     draft.releaseDateDetails = { date: normalizeDate(rawDate) };
  //   } else if (Array.isArray(rawDate)) { // This should always be the case
  //     const processDate = (item) => {
  //       let text = item
  //         .filter((e) => e.type === "text" || e.type.includes("link"))
  //         .reduce((acc, e) => (acc += e.text || e.page), "");
  //       let obj = { date: normalizeDate(text) };
  //       let note = item.find((e) => e.type === "note");
  //       if (note) obj.note = note.text;
  //       return obj;
  //     };
  //     if (rawDate[0]) {
  //       draft.releaseDateDetails =
  //         rawDate[0].type === "list"
  //         ? rawDate[0].data.map((e) => processDate(e))
  //         : processDate(rawDate);
  //     }
  //   }
  // }

  ///////////////////////////////////
  ///////////////////////////////////
  ///////////////////////////////////

    operations.push({ replaceOne: {
      filter: { title: draft.title },
      replacement: draft,
      upsert: true,
    }});
  log.setStatusBarText([`Article: ${++progress}/${outOf}`]);
}

for (let draft of nopageDrafts) {
  operations.push({ replaceOne: {
    filter: { title: draft.title },
    replacement: draft,
    upsert: true,
  }})
}

log(`Article: ${progress}/${outOf}`);

///// COVERS /////
const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true");
await client.connect();
let db = client.db("swtimeline");
let collection = db.collection("media");

// TODO use a title index once I set it up
let docs = await collection.find({}, {projection:{title: 1, cover: 1, coverTimestamp: 1}}).toArray();
let currentCovers = {};
for (let doc of docs) {
  currentCovers[doc.title] = doc;
}

log.info("Fetching imageinfo...");
progress = 0;
log.setStatusBarText([`Image: ${progress}/${outOf}`]);

// We need a map of cover filenames to article titles in order to check for existing covers
let titlesDict = {};
for (let v of Object.values(drafts)) {
  titlesDict[v.coverWook] = v.title;
}

let covers = Object.values(drafts).map(draft => draft.coverWook).filter(s => s); // filter out entires with no covers
outOf = covers.length;
let imageinfos = fetchImageInfo(covers);

const fileExists = async (path) => {
  try {
    await fs.stat(path);
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return false;
    }
    throw e;
  }
  return true;
};

const Size = Object.freeze({
  THUMB: "thumb/",
  MEDIUM: "medium/",
  SMALL: "small/",
  FULL: "",
});

const anyMissing = async (exists, filename) => {
  for (const [key, value] of Object.entries(Size)) {
    exists[key] = await fileExists(`${IMAGE_PATH}${value}${filename}`);
  }
  return Object.values(exists).some(e => e === false);
}

for await (let imageinfo of imageinfos) {
  // Keep in mind imageinfo.title is a filename of the image, not the article title
  let articleTitle = titlesDict[imageinfo.normalizedFrom ?? imageinfo.title];
  let current = currentCovers[articleTitle];
  let exists = {};

  if (
    !current || // new media (not in DB yet)
    !current.cover || // cover got added
    current.coverTimestamp < imageinfo.timestamp || // cover got updated
    await anyMissing(exists, current.cover) // any cover size doesn't exist (mostly due to me deleting files during testing) TODO remove?
  ) {
    if (!imageinfo.title.startsWith("File:")) // Just to make sure. Should never happen. TODO remove
      log.error(`${articleTitle}'s cover does not start with "File:". Filename: ${imageinfo.title}`);
    // remove leading "File:"
    let myFilename = imageinfo.title.slice(5);
    let buffer;

    // code to pick up from incomplete fetches
    /*let pos = myFilename.lastIndexOf(".");
    myFilename = myFilename.substr(0, pos < 0 ? myFilename.length : pos) + ".webp";
// We got the cover but it's not in the db (due to previous incomplete fetch)
    if (!current && !(await anyMissing(exists, myFilename))) {
      buffer = await fs.readFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`);
    }
    else*/ if (!exists.FULL) {
      let resp = await fetchCache(imageinfo.url, { headers: { Accept: "image/webp,*/*;0.9" } });
      if (!resp.ok) {
        throw "Non 2xx response status! Response:\n" + JSON.stringify(resp);
      }
      if (resp.headers.get("Content-Type") === "image/webp") {
        let pos = myFilename.lastIndexOf(".");
        myFilename = myFilename.substr(0, pos < 0 ? myFilename.length : pos) + ".webp";
      }
      else {
        log.warn(`Image in non webp. article: ${articleTitle}, filename: ${myFilename}`);
      }
      log.info(`Recieved ${toHumanReadable((await resp.clone().blob()).size)} of image "${imageinfo.title}"`);
      buffer = await resp.buffer();
    }
    else {
      myFilename = current.cover;
      buffer = await fs.readFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`);
    }
    log.info(`Writing cover for "${articleTitle}" named "${myFilename}"`);
    if (!exists.FULL) await fs.writeFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`, buffer);
    if (!exists.MEDIUM) await sharp(buffer).webp({ nearLossless: true }).resize(500).toFile(`${IMAGE_PATH}${Size.MEDIUM}${myFilename}`);
    if (!exists.SMALL) await sharp(buffer).webp({ nearLossless: true }).resize(220).toFile(`${IMAGE_PATH}${Size.SMALL}${myFilename}`);
    if (!exists.THUMB) await sharp(buffer).webp({ nearLossless: true }).resize(55).toFile(`${IMAGE_PATH}${Size.THUMB}${myFilename}`);
    drafts[articleTitle].cover = myFilename;
    drafts[articleTitle].coverTimestamp = imageinfo.timestamp;
    drafts[articleTitle].coverSha1 = imageinfo.sha1;

    // If we had a cover already and it didn't get overwritten, delete it
    if (current?.cover && current.cover !== myFilename) {
      log.info(`Deleteing old cover: ${current.cover} in favor of ${myFilename}`);
      try {
        await fs.unlink(`${IMAGE_PATH}${current.cover}`);
      } catch (e) {
        if (!e.code === "ENOENT") // It's already deleted
          throw e;
      }
    }
  }
  else {
    // log.info(`Up to date cover exists for ${articleTitle}`);
    drafts[articleTitle].cover = current.cover;
    drafts[articleTitle].coverTimestamp = current.coverTimestamp;
    drafts[articleTitle].coverSha1 = current.coverSha1;
  }
  log.setStatusBarText([`Image: ${++progress}/${outOf}`]);
} 

// log.info("Checking covers...")
// let filenameHash = md5(draft.coverWook);
// let wookImgUrl = `https://static.wikia.nocookie.net/starwars/images/${
//     filenameHash[0]
//   }/${filenameHash.slice(0, 2)}/${filename}`;
// let resp = await fetch(wookImgUrl);
// let buffer = await resp.buffer();
// let imgHash = md5(buffer);
// fs.writeFile(`${IMAGE_PATH}${wookImgUrl}`, buffer);

log.info("Clearing DB...");
collection.deleteMany({});
log.info("Writing to DB...");
// TODO: We should probably do some overwriting based on timeline entries to remove stale/orphaned documents
await collection.bulkWrite(operations);

let tvShowsNew = await collection.distinct("series", {type: "tv"});
let tvShowsOld = await db.collection("tv-images").find({}, {series: 1}).toArray();
tvShowsOld = tvShowsOld.map(o => o.series);
for (let show of tvShowsNew) {
  if (!tvShowsOld.includes(show)) {
    log.error("New tv series! Its thumbnail has to be uploaded manually. title: " + show);
  }
}

await client.close();
log.info("Done!");