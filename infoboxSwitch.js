  let type, subtype;
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
      type = "short-story";
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
