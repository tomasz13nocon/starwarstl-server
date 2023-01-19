export class UnsupportedDateFormat extends Error {
  constructor(...args) {
    super(...args);
    this.name = "UnsupportedDateFormat";
  }
}

/**
 * Parse all dates or ranges of dates from a Wookieepedia string
 * @param {string | null | undefined} date - If null or undefined or empty string, undefined is returned.
 * Supported formats:
 *   - 41 BBY
 *   - 32 BBY–4 ABY
 *   - 4–5 ABY
 *   - c. 40 BBY
 *   - c. 21 BBY–34 ABY
 *   - c. 15–2 BBY
 *   - c. 231 BBY–c. 230 BBY
 *   - During or prior to 146 BBY
 *   - During or after 5 ABY
 *   - Between 44–32 BBY
 *   - Between 20 BBY and 19 BBY
 *   - 9 BBY or 8 BBY
 *   - 3 BBY & 4 ABY
 * @throws {UnsupportedDateFormat} if date cannot be parsed
 * @returns {{
 *   date1: number,
 *   date2?: number,
 * }[] | undefined}
 */
export const parseWookieepediaDate = (date) => {
  if (date === null || date === undefined || date === "") {
    return undefined;
  }
  let founds = date.toLowerCase().matchAll(/(?:c\.)?\s*(?<date1>\d+)\s*(?:(?<era1>[ab])by)?\s*(?:[–\-&]|and|or)?(?:c\.)?\s*(?<date2>\d+)?\s*(?:(?<era2>[ab])by)?/g);
  let ret = [];
  for (let found of founds) {
    let toPush = {
      date1: +found.groups.date1,
      date2: +found.groups.date2,
    };
    if (isNaN(toPush.date2)) {
      delete toPush.date2;
    }
    if (found.groups.era1 === "b" || (found.groups.era1 === undefined && found.groups.era2 === "b")) {
      toPush.date1 = -toPush.date1;
    }
    if (found.groups.era2 === "b") {
      toPush.date2 = -toPush.date2;
    }
    ret.push(toPush);
  }
  if (ret.length === 0) {
    throw new UnsupportedDateFormat(`Cannot parse Wookieepedia date string: ${date}`);
  }
  return ret;
};
