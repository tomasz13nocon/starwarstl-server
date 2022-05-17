import wtf from "wtf_wikipedia";
import _ from "lodash";
import * as fs from "fs/promises";
import sharp from "sharp";
import sizeOf from "image-size";
import { decode } from "html-entities";
import { MongoClient } from  "mongodb";
import logWithStatusbar from "log-with-statusbar";
const log = logWithStatusbar();
//import { default as fetchCache } from "node-fetch-cache";
import { fetchBuilder, FileSystemCache } from "node-fetch-cache";
const fetchCache = fetchBuilder.withCache(new FileSystemCache());

const debug = {
  // Write a list of distinct infobox templates to file
  distinctInfoboxes: true,
  // Warn on bad, yet recoverable wikitext
  badWikitext: false, // not implemented
  // Warn on redlinks
  redlinks: false,
  normalizations: true,
  normalizationsImages: false,
};

const CACHE_PAGES = true;
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
const seriesTypes = { // TODO full types
  "book series": "book",
  "comic series": "comic",
  "movie": "film",
  "television series": "tv",
  "comic story arc": "comic",
  "magazine": "comic",
};
// Latter ones have higher priority, as they overwrite
const seriesRegexes = {
  "multimedia": /multimedia project/i,
  "comic": /((comic([ -]book)?|manga|graphic novel) (mini-?)?series|series of( young readers?)? (comic([ -]book)?s|mangas|graphic novels))/i, // TODO subtypes/full types
  "short-story": /short stor(y|ies)/i,
  "game": /video game/i,
  // "yr": /((series of books|book series).*?young children|young[- ]reader.*?(book series|series of books))/i,
};
let tvTypes = {};
let redirectNum = 0;
let bytesRecieved = 0;
let imageBytesRecieved = 0;
let requestNum = 0;

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

// `keys` is an array of (possibly mixed):
// - strings representing infobox key
// - objects where:
// -- aliases: array of strings, where the elements are possible names for the infobox key
//    the first element is used for DB key, unless `name` is specified
// -- details: boolean wheter to add "Details" to the key name
// -- name: string to use as DB key instead of aliases[0]
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
    let dbKey = toCamelCase(key.name || key.aliases[0]);
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
const fetchWookieeHelper = async function* (titles, apiParams = {}, cache = true) {
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
    const resp = cache ? await fetchCache(apiUrl) : await fetch(apiUrl); // TODO switch to normal fetch
    requestNum++;
    if (!resp.ok) {
      throw "Non 2xx response status! Response:\n" + JSON.stringify(resp);
    }
    let respSize = (await resp.clone().blob()).size;
    bytesRecieved += respSize;
    log.info(`Recieved ${toHumanReadable(respSize)} of ${apiParams.prop}`); //  for titles: ${titles.slice(i, i+50)}
    const json = await resp.json();
    if (json.query === undefined) {
      log.error(apiUrl);
      log.error(json);
      log.error(resp);
      throw "Response Invalid";
    }
    let pages = Object.values(json.query.pages);
    // If there's random symbols or underscores in the title it gets normalized,
    // so we make the normalized version part of the return value
    let normalizations = {};
    if (json.query.normalized) {
      if (apiParams.prop === "imageinfo") {
        if (debug.normalizationsImages) {
          log.info("Normalized: ", json.query.normalized);
        }
      }
      else if (debug.normalizations) {
        log.info("Normalized: ", json.query.normalized);
      }
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
// number of yields will be the same as the amount of titles provided
// titles needs to be a string (single title) or a non empty array of strings
const fetchWookiee = async function* (titles, cache = true) {
  for await (let page of fetchWookieeHelper(titles, { prop: "revisions", rvprop: "content|timestamp", rvslots: "main" }, cache)) {
    if (page.missing !== undefined) {
      yield {
        title: page.title,
        missing: true,
      };
    }
    else {
      yield {
        title: page.title,
        pageid: page.pageid,
        wikitext: page.revisions?.[0].slots.main["*"],
        timestamp: page.revisions?.[0].timestamp,
        // If there's no normalization for this title this field is just undefined
        normalizedFrom: page.normalizedFrom,
      };
    }
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
    else {
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

const reg = (str, title) => {
  const jr = /junior|middle[ -]grade|chapter book|young[ -]reader|young children/i;
  const ya = /young[ -]adult/i;
  const a = /adult|canon novel/i;
  const aLow = /novels/i;
  if (jr.test(str)) return "jr";
  if (ya.test(str)) return "ya";
  if (a.test(str)) return "a";
  if (aLow.test(str)) {
    log.warn(`Low confidence guess of adult novel type for ${title} from sentence: ${str}`);
    return "a";
  }
  return null;
};

// Returns a promise resolving to a target audience string from wtf doc or null if it can't figure it out
const getAudience = async (doc) => {
  // We can't rely on books.disney.com even though it's the most official source,
  // because a lot of books are aribitrarily not there
  // TODO: categories properly (nested categories etc.)
  let categories = doc.categories();
  if (categories.includes("Canon adult novels")) return "a";
  if (categories.includes("Canon young-adult novels")) return "ya";
  if (categories.includes("Canon Young Readers")) return "jr";
  let sentence = doc.sentence(0).text();
  //let mediaType = doc.infobox().get("media type").text();
  let regSentence = reg(sentence, doc.title());
  if (regSentence) return regSentence;
  let seriesTitle;
  try {
    seriesTitle = doc.infobox().get("series").links()[0].json().page; // TODO: ??????
  } catch (e) {
    log.warn(
      `Couldn't get a 'series' from infobox. title: ${doc.title()}, series: ${seriesTitle}, error: `,
      e.name + ":",
      e.message
    );
    log.warn(`Can't figure out target audience for ${doc.title()} from sentence: ${sentence}`);
    return null;
  }
  log.info(`Getting series: ${seriesTitle} for ${doc.title()}`);
  let seriesDoc = await docFromTitle(seriesTitle);
  if (seriesDoc === null)
    throw `${seriesTitle} is not a valid wookieepedia article.`;
  log.info(`title: ${seriesDoc.title()} (fetched: ${seriesTitle})`);
  log.info(`sentence: ${seriesDoc.sentence(0)}, text: ${seriesDoc.sentence(0).text()}`);
  let seriesSentence = seriesDoc.sentence(0).text();
  let regSeries = reg(seriesSentence, doc.title());
  if (!regSeries)
    log.warn(`Can't figure out target audience for ${doc.title()} from sentence: ${sentence}\n nor its series' sentence: ${seriesSentence}`);
  return regSeries;
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

const getPageWithAnchor = link => {
  return link.page() + (link.anchor() ? "#" + link.anchor() : "");
}

const fillDraftWithInfoboxData = (draft, infobox) => {
  for (const [key, value] of Object.entries(
    getInfoboxData(infobox, [
      { aliases: ["release date", "airdate", "publication date", "released", "first aired"], details: true },
      "closed",
      "author",
      { aliases: ["writer", "writers"], details: true },
      "narrator",
      "developer",
      { aliases: ["season"], details: true },
      "episode",
      "production",
      "guests",
      { aliases: ["director", "directors"] },
      "producer",
      "starring",
      "music",
      { aliases: ["runtime", "run time"] },
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
      { name: "dateDetails", aliases: ["timeline"] },
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
      "last aired",
      "creators",
      "executive producers",
      "prev",
      "next",
      "preceded by",
      "followed by",
      "upc",
      "isbn",
      // { name: "coverWook", aliases: ["image"] },
    ])
  )) {
    draft[key] = processAst(value);
  }

  // draft.coverWook = infobox.get("image").wikitext().match(/\[\[(.*)\]\]/)?.[1];
  draft.coverWook = infobox.get("image").wikitext().replaceAll(/(\[\[|File:|\]\]|\|.*)/g, "");
  
  // if (draft.coverWook === undefined && infobox.get("image").text() !== "") {
  //   log.error(`Unexpected cover filename format! title: "${draft.title}", cover field in infobox: "${infobox.get("image").wikitext()}"`);
  // }

  // no comment...
  if (draft.isbn === "none")
    delete draft.isbn;

  draft.publisher = infobox.get("publisher").links()?.map(e => decode(e.page())) || null;
  draft.series = infobox.get("series").links()?.map(e => decode(getPageWithAnchor(e))) || null;
  let seasonText = infobox.get("season").text();
  if (seasonText) {
    let seasonTextClean = seasonText.toLowerCase().trim();
    draft.season = NUMBERS[seasonTextClean.match(seasonReg)?.[1]] ?? seasonTextClean.match(/^(?:season )?(\d+)$/)?.[1];
    if (draft.season === undefined) {
      // We use word boundaries as last resort (and log it) in order to avoid false positives.
      // log.warn(`Using word boundary regex to match season of "${draft.title}". Season text: ${seasonText}`);
      draft.season = NUMBERS[seasonTextClean.match(seasonRegWordBoundaries)?.[1]] ?? seasonTextClean.match(/(?:season )?\b(\d+)\b/)?.[1];
      if (draft.season && /shorts/i.test(seasonTextClean))
        draft.seasonNote = "shorts";

      if (draft.season === undefined) {
        log.warn(`Couldn't get season of "${draft.title}". Season text: ${seasonText}`);
      }
    }
  }

  // Delete empty values
  for (const [key, value] of Object.entries(draft)) {
    if ((Array.isArray(value) && !value.length) || value === undefined || value === null || value === "")
      delete draft[key];
  }
};

// series - wheter the draft is for a series
const figureOutFullTypes = async (draft, doc, series, seriesDrafts = {}) => {
  if (draft.type === "book") {
    if (doc.categories().includes("Canon audio dramas")) {
      draft.type = "audio-drama";
      draft.audiobook = false;
    }
    else {
      if (!draft.fullType) {
        let audience = await getAudience(doc);
        if (audience)
          draft.fullType = `book-${audience}`;
      }
    }
  }
  else if (draft.type === "tv" && (draft.series?.length || series)) {
    let seriesTitle = series ? draft.title : draft.series.find(e => seriesDrafts[e]?.type === "tv");
    if (tvTypes[seriesTitle])
      draft.fullType = tvTypes[seriesTitle];
    else {
      if (!series) // This should theoretically never happen
        throw `NO SERIES TYPE FOR EPISODE!!! Episode ${draft.title} is part of a series, for which we don't have the full type. Series title: ${seriesTitle} (${draft.series})`;
      let seriesDoc = doc;
      // If problematic, change sentence(0) to paragraph(0)
      if (/micro[- ]series/i.test(seriesDoc.sentence(0).text()))
        draft.fullType = "tv-micro-series";
      else if (seriesDoc.categories().includes("Canon animated television series"))
        draft.fullType = "tv-animated";
      else if (seriesDoc.categories().includes("Canon live-action television series"))
        draft.fullType = "tv-live-action";
      else
        log.error(`Tv series neither live action nor animated nor micro series. Series: "${seriesTitle}", categories: ${seriesDoc.categories()}`);

      tvTypes[seriesTitle] = draft.fullType;
    }
  }
  else if (draft.type === "game") {
    if (doc.categories().includes("Canon mobile games"))
      draft.fullType = "game-mobile";
    else if (doc.categories().includes("Web-based games"))
      draft.fullType = "game-browser";
    else if (doc.categories().includes("Virtual reality") || doc.categories().includes("Virtual reality attractions") || doc.categories().includes("Virtual reality games") || /virtual[ -]reality/i.test(doc.sentence(0).text()))
      draft.fullType = "game-vr";
    else
      draft.fullType = "game";
  }
}

log.info("Fetching timeline...");
//let timelineDoc = wtf(timelineString);
// let timelineDoc = wtf(await fs.readFile("../client/sample_wikitext/timeline", "utf-8"));
let timelineDoc = wtf((await fetchWookiee("Timeline of canon media", CACHE_PAGES).next()).value.wikitext);
//let timelineDoc = await fetchWookiee("Timeline_of_Legends_media");
let data = timelineDoc.tables()[1].json();
// data = data.slice(0,50);

const types = {
  C: "comic",
  N: "book",
  SS: "short-story",
  YR: "yr",
  JR: "book",
  TV: "tv",
  F: "film",
  VG: "game",
}


let drafts = {};
let nopageDrafts = [];
let seriesDrafts = {};

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
    draft.fullType = "book-jr";
  if (draft.type === undefined) {
    if (item.col2.text !== "P")
      log.warn("Timeline parsing warning: Unknown type, skipping. type: " + item.col2.text);
    continue;
  }
  let notes = item.Title.text.split("*");
  if (notes.length > 1) {
    draft.timelineNotes = [{ type: "list", data: notes.slice(1).map(s => ([{ type: "text", text: s.trim() }])) }]; // TODO:parser get links and such, not just text
    for (let s of draft.timelineNotes[0].data) {
      if (s[0].text.toLowerCase().includes("adaptation"))
        draft.adaptation = true;
    };
  }
  if (item.Title.text.includes("†"))
    draft.exactPlacementUnknown = true;

  // TODO: uncomment? "2022-??-??" is NaN tho..
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

let pages = fetchWookiee(Object.keys(drafts), CACHE_PAGES);
let infoboxes = [], seriesInfoboxes = [];

const docFromPage = async (page, drafts) => {
  if (page.missing) {
    // log.warn(`Page missing! "${page.title}" is not a valid wookieepedia article.`);
    return [null, drafts[page.title]]; // what about title normalization? potential super rare super hard to track bug.
  }

  if (page.normalizedFrom) {
    if (page.normalizedFrom.includes("#")) {
      page.title += page.normalizedFrom.slice(page.normalizedFrom.indexOf("#")).replace("_", " ");
    }
    drafts[page.title] = drafts[page.normalizedFrom];
    if (page.title !== page.normalizedFrom)
      delete drafts[page.normalizedFrom];
  }
  let draft = drafts[page.title];
  // This should never happen with all the checks before
  if (draft === undefined) {
    throw `Mismatch between timeline title and the title received from the server for: "${page.title}"`;
  }
  draft.title = page.title;
  // In case of a redirect, the fields below describe the redirect page
  draft.wookieepediaId = page.pageid;
  draft.revisionTimestamp = page.timestamp;

  let doc = wtf(page.wikitext);
  while (doc.isRedirect()) {
    log.info(`Article ${draft.title} is a redirect to ${doc.redirectTo().page}. Fetching...`)
    redirectNum++;
    draft.redirect = true;
    doc = await docFromTitle(doc.redirectTo().page);
    if (doc === null)
      throw `Not a valid wookieepedia article!`;
  }
  return [doc, draft];
}

// while (!(page = await pages.next()).done && !(imageinfo = await imageinfos.next()).done) {
for await (let page of pages) {
  let [doc, draft] = await docFromPage(page, drafts);
  if (doc === null)
    throw `${page.title} is a redlink in the timeline!`; // TODO: handle?
  draft.doc = doc; // We need this for the second iteration
  let infobox = doc.infobox();
  if (!infobox) {
    log.error(page.wikitext.slice(0, 1500));
    throw `No infobox! title: ${draft.title}`;
  }

  if (debug.distinctInfoboxes && !infoboxes.includes(infobox._type))
    infoboxes.push(infobox._type, "\n")

  if (infobox._type ==="audiobook")
    draft.audiobook === true;

  fillDraftWithInfoboxData(draft, infobox);

  if (draft.series) {
    for (let seriesTitle of draft.series) {
      if (!(seriesTitle in seriesDrafts))
        seriesDrafts[seriesTitle] = { title: seriesTitle };
    }
  }

  log.setStatusBarText([`Article: ${++progress}/${outOf}`]);
}

progress = 0;
outOf = Object.keys(seriesDrafts).length;

// Series handling
let seriesPages = fetchWookiee(Object.keys(seriesDrafts), CACHE_PAGES);
// for (let [seriesTitle, seriesDraft] of Object.entries(seriesDrafts)) {
for await (let page of seriesPages) {
  let [seriesDoc, seriesDraft] = await docFromPage(page, seriesDrafts);
  if (seriesDoc === null) {
    if (debug.redlinks) {
      log.warn(`Series ${seriesDraft.title} is a redlink!`);
    }
    // infer series type from episodes
    log.info(`Inferring series type from episodes of a redlink series: ${seriesDraft.title}`)
    let episodes = Object.values(drafts).filter(e => e.series?.includes(seriesDraft.title));
    let epType;
    if (episodes.every((e, index) => index === 0 ? epType = e.type : epType === e.type)) {
      seriesDraft.type = epType;
      log.info(`Inferred type: ${epType}`);
      if (episodes.every((e, index) => index === 0 ? epType = e.fullType : epType === e.fullType)) {
        seriesDraft.fullType = epType;
        log.info(`Inferred full type: ${epType}`);
      }
    }
    else {
      seriesDraft.type = "unknown";
      log.warn("Failed to infer type. Setting 'unknown'. Consider adding 'unkown' entry to the legend.");
    }
    progress++;
    continue;
  }
  let seriesTitle = seriesDraft.title;
  if (seriesTitle.includes("#")) {
    seriesDraft.displayTitle = seriesTitle.replaceAll("#", " ");
  }
  let seriesInfobox = seriesDoc.infobox();
  let firstSentence = seriesDoc.sentence(0).text();
  // Figure out type from categories ...
  if (seriesDoc.categories().includes("Multimedia projects")) {
    seriesDraft.type = "multimedia";
  }
  // ... or from the first sentence of the article
  else {
    for (let [type, re] of Object.entries(seriesRegexes)) {
      if (re.test(firstSentence)) {
        if (seriesDraft.type)
          log.info(`Multiple regex matches in first sentence of series article: ${seriesTitle} when looking for type. Matched for: ${seriesDraft.type} and ${type} (latter takes priority). Sentence: ${firstSentence}`);
        seriesDraft.type = type;
      }
    }
  }
  if (seriesInfobox !== null) {
    if (!seriesDraft.type) {
      seriesDraft.type = seriesTypes[seriesInfobox._type];
      if (seriesDraft.type === undefined)
        throw `Series ${seriesTitle} has unknown infobox: ${seriesInfobox._type}! Can't infer type.`;
      if (debug.distinctInfoboxes && seriesInfobox && !(seriesInfoboxes.includes(seriesInfobox._type))) {
        seriesInfoboxes.push(seriesInfobox._type, "\n");
      }
    }
    fillDraftWithInfoboxData(seriesDraft, seriesInfobox);
    figureOutFullTypes(seriesDraft, seriesDoc, true);
  }
  else if(!seriesDraft.type) {
    throw `No infobox and failed to infer series type from article!! series: ${seriesTitle} sentence: ${firstSentence}`;
  }
  log.setStatusBarText([`Series article: ${++progress}/${outOf}`]);
}

progress = 0;
outOf = Object.keys(drafts).length;
log.setStatusBarText([`Second iteration (full types). Article: ${progress}/${outOf}`]);

// Second iteration over media to get full types, for which we need series data.
// Second iteration because we want to batch series fetching.
for (let draft of Object.values(drafts)) {
  figureOutFullTypes(draft, draft.doc, false, seriesDrafts);
  delete draft.doc;
}

// log(`Article: ${progress}/${outOf}`);

// Setup DB
const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true");
await client.connect();
let db = client.db("swtimeline");
let media = db.collection("media");
let series = db.collection("series");

// Problem: Junior series are referred to as "young reader" by wookieepedia, so we have to infer yr type by looking at entries of the series
// If all entries of a book series are yr then the series is yr
let bookSeriesArr = Object.values(seriesDrafts).filter(e => e.type === "book").map(e => e.title);
for (let bookSeries of bookSeriesArr) {
  let entries = Object.values(drafts).filter(e => e.series?.includes(bookSeries));
  if (entries.every(e => e.type === "yr")) {
    seriesDrafts[bookSeries].type = "yr";
    delete seriesDrafts[bookSeries].fullType;
    log.info(`Series ${bookSeries} has only yr entries, therefore it is yr.`);
  }
}

///// COVERS /////

// TODO use a title index once I set it up
let docs = await media.find({}, {projection:{title: 1, cover: 1, coverTimestamp: 1}}).toArray();

let currentCovers = {};
for (let doc of docs) {
  currentCovers[doc.title] = doc;
}

// We need a map of cover filenames to article titles in order to check for existing covers
let titlesDict = {};
for (let v of Object.values(drafts)) {
  titlesDict[v.coverWook] = v.title;
}

let covers = Object.values(drafts).filter(o => o.coverWook).map(draft => "File:" + draft.coverWook);

log.info("Fetching imageinfo...");
progress = 0;
outOf = covers.length;
log.setStatusBarText([`Image: ${progress}/${outOf}`]);

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
  let articleTitle = titlesDict[(imageinfo.normalizedFrom ?? imageinfo.title).slice(5)];
  let current = currentCovers[articleTitle];
  let exists = {};

  if (
    !current || // new media (not in DB yet)
    !current.cover || // cover got added
    current.coverTimestamp < imageinfo.timestamp || // cover got updated
    await anyMissing(exists, current.cover) // any cover size doesn't exist (mostly due to me deleting files during testing) TODO remove?
  ) {
    // if (!imageinfo.title.startsWith("File:")) {
    //   log.error(`${articleTitle}'s cover does not start with "File:". Filename: ${imageinfo.title}`);
    // }
    // remove leading "File:"
    let myFilename = imageinfo.title.slice(5);
    let buffer;

    // code to pick up from incomplete fetches
    let pos = myFilename.lastIndexOf(".");
    myFilename = myFilename.substr(0, pos < 0 ? myFilename.length : pos) + ".webp";
    // We got the cover but it's not in the db (due to previous incomplete fetch)
    if (!current && !(await anyMissing(exists, myFilename))) {
      buffer = await fs.readFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`);
    }
    else if (!exists.FULL) {
      let resp = await fetchCache(imageinfo.url, { headers: { Accept: "image/webp,*/*;0.9" } });
      requestNum++;
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
      let respSize = (await resp.clone().blob()).size;
      imageBytesRecieved += respSize;
      log.info(`Recieved ${toHumanReadable(respSize)} of image "${imageinfo.title}"`);
      buffer = await resp.buffer();
    }
    else {
      myFilename = current.cover;
      buffer = await fs.readFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`);
    }
    log.info(`Writing cover for "${articleTitle}" named "${myFilename}"`);
    if (!exists.FULL) await fs.writeFile(`${IMAGE_PATH}${Size.FULL}${myFilename}`, buffer);
    // TODO don't resize up??
    if (!exists.MEDIUM) await sharp(buffer).webp({ nearLossless: true }).resize(500).toFile(`${IMAGE_PATH}${Size.MEDIUM}${myFilename}`);
    if (!exists.SMALL) await sharp(buffer).webp({ nearLossless: true }).resize(220).toFile(`${IMAGE_PATH}${Size.SMALL}${myFilename}`);
    if (!exists.THUMB) await sharp(buffer).webp({ nearLossless: true }).resize(55).toFile(`${IMAGE_PATH}${Size.THUMB}${myFilename}`);
    drafts[articleTitle].cover = myFilename;
    const dimensions = sizeOf(buffer);
    drafts[articleTitle].coverWidth = dimensions.width;
    drafts[articleTitle].coverHeight = dimensions.height;
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
    drafts[articleTitle].coverWidth = current.coverWidth;
    drafts[articleTitle].coverHeight = current.coverHeight;
    drafts[articleTitle].coverTimestamp = current.coverTimestamp;
    drafts[articleTitle].coverSha1 = current.coverSha1;
  }
  log.setStatusBarText([`Image: ${++progress}/${outOf}`]);
} 

log.info("Clearing DB...");
media.deleteMany({});
series.deleteMany({});
log.info("Writing to DB...");
await media.insertMany(Object.values(drafts));
if (nopageDrafts.length)
  await media.insertMany(nopageDrafts);
await series.insertMany(Object.values(seriesDrafts));

let tvShowsNew = await media.distinct("series", {type: "tv"});
let tvShowsOld = await db.collection("tv-images").find({}, {series: 1}).toArray();
tvShowsOld = tvShowsOld.map(o => o.series);
for (let show of tvShowsNew) {
  if (!tvShowsOld.includes(show)) {
    log.error("New tv series! Its thumbnail has to be uploaded manually. title: " + show);
  }
}

await client.close();
if (debug.distinctInfoboxes) {
  await fs.writeFile("infoboxes.txt", infoboxes);
  await fs.writeFile("seriesInfoboxes.txt", seriesInfoboxes);
}
log.info(`Done!
Number of redirects encountered: ${redirectNum}
Total API data recieved: ${toHumanReadable(bytesRecieved)}
Total image data recieved: ${toHumanReadable(imageBytesRecieved)}
Number of HTTP requests made: ${requestNum}`);

