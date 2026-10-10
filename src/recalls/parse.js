// Free-text → structured: states, dates, company names. Used for both Cala and openFDA text.
export const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

// Codes that are also English words: trust them in mixed-case text ("only in OR."), or in
// all-caps text only inside a list ("IL, IN, KY" / "TX AND OK") — not "SOLD IN STORES"
const AMBIGUOUS = new Set(["IN", "OR", "ME", "OK", "HI", "PA", "DE", "MA", "AL", "CO", "LA"]);
const NATIONWIDE = /nation\s*-?\s*wide|all (50 |fifty )?(U\.?S\.? )?states|throughout the (U\.?S\.?|United States)|across the (U\.?S\.?|United States)|sold in the (U\.?S\.?|United States)|online|internet|website/i;
// "37 states (see …)", "31 U.S. states": Cala knows a count but not the list
const COUNT_ONLY = /\b\d{1,2}\s+(U\.?S\.?\s+)?states\b/i;

// Longest names first so "West Virginia" is consumed before "Virginia"
const NAMES = Object.entries(STATES).sort((a, b) => b[1].length - a[1].length);

// → { states: ["AR", …], nationwide, complete } — complete=false means "there are more we couldn't name"
export function parseStates(text) {
  let rest = text ?? "";
  const states = new Set();
  for (const [code, name] of NAMES) {
    const re = new RegExp(`\\b${name}\\b`, "gi");
    if (re.test(rest)) {
      states.add(code);
      rest = rest.replace(re, " ");
    }
  }
  const mixedCase = /[a-z]/.test(rest);
  const inList = (code) => new RegExp(`(^|[,;:/(]|\\band\\b)\\s*${code}\\s*([,;/).]|\\band\\b|$)`, "i").test(rest);
  for (const [, code] of rest.matchAll(/\b([A-Z]{2})\b/g)) {
    if (STATES[code] && (!AMBIGUOUS.has(code) || mixedCase || inList(code))) states.add(code);
  }
  const nationwide = NATIONWIDE.test(text ?? "");
  const complete = nationwide || (states.size > 0 && !COUNT_ONLY.test(text ?? ""));
  return { states: [...states].sort(), nationwide, complete };
}

const MONTHS = "january february march april may june july august september october november december".split(" ");
const MONTH_RE = new RegExp(`\\b(${MONTHS.map((m) => m.slice(0, 3)).join("|")})[a-z]*\\.?\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?[,\\s–-]*(?:\\d{1,2})?,?\\s*)?(\\d{4})`, "i");

// Cala dates: "Oct 2 2026", "August 12–13, 2026", "early October 2026", "~October 2026",
// "Initially September 15, 2026 (…)", "2026-09-25" → { date: "YYYY-MM-DD", precision: "day"|"month" }
export function parseDate(text) {
  if (!text) return { date: null, precision: null };
  const iso = String(text).match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: iso[0], precision: "day" };
  const m = String(text).match(MONTH_RE);
  if (!m) return { date: null, precision: null };
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase())) + 1;
  const day = m[2] ? Number(m[2]) : 1;
  return {
    date: `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    precision: m[2] ? "day" : "month",
  };
}

// "Flowers Foods, Inc. (Thomasville, GA)" → "flowers foods" — for matching Cala ↔ openFDA ↔ entities
const SUFFIXES = /\b(inc|incorporated|llc|l\.?l\.?c|ltd|limited|corp|corporation|co|company|lp|l\.?p|s\.?a|plc|gmbh|dba|usa|us|na|north america)\b\.?/gi;
export function companyKey(name) {
  return (name ?? "")
    .replace(/\(.*?\)/g, " ")
    .split(/—| - |;/)[0]
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Display name without Cala's parenthetical notes: "Gias Foods, Inc. (New York, NY)" → "Gias Foods, Inc."
export const cleanName = (name) => (name ?? "").replace(/\s*\(.*?\)/g, "").split(/\s+—\s+/)[0].trim();
