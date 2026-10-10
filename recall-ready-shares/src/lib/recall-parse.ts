// Pure helpers that turn raw government recall text into card-ready fields.

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

export type Hazard =
  | "allergen"
  | "bacteria"
  | "foreign_object"
  | "choking"
  | "fire"
  | "injury"
  | "chemical"
  | "drug"
  | "other";

export const HAZARD_LABELS: Record<Hazard, string> = {
  allergen: "Undeclared allergen",
  bacteria: "Bacterial contamination",
  foreign_object: "Foreign object",
  choking: "Choking hazard",
  fire: "Fire / burn hazard",
  injury: "Injury hazard",
  chemical: "Chemical / toxic exposure",
  drug: "Drug quality issue",
  other: "Safety hazard",
};

export function parseStates(text: string): { states: string[]; nationwide: boolean } {
  const t = text || "";
  const nationwide = /nation\s?wide|all\s+(50\s+)?states|throughout the (u\.?s\.?|united states)/i.test(t);
  const found = new Set<string>();
  for (const [abbr, name] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(t)) found.add(abbr);
  }
  // Two-letter codes must be uppercase and stand alone.
  for (const m of t.matchAll(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g)) {
    const code = m[1];
    if (code && US_STATES[code]) found.add(code);
  }
  return { states: [...found].sort(), nationwide };
}

export function parseLotNumbers(text: string): string[] {
  const t = text || "";
  const lots = new Set<string>();
  const re = /\blot(?:s)?(?:\s*(?:numbers?|codes?|nos?\.?|#))?\s*[:#]?\s*((?:[A-Z0-9][A-Z0-9\-\/.]*\d[A-Z0-9\-\/.]*)(?:\s*(?:,|;|and|&)\s*(?:[A-Z0-9][A-Z0-9\-\/.]*\d[A-Z0-9\-\/.]*))*)/gi;
  for (const m of t.matchAll(re)) {
    for (const piece of (m[1] ?? "").split(/\s*(?:,|;|\band\b|&)\s*/i)) {
      const clean = piece.replace(/[.]+$/, "").trim();
      if (clean.length >= 2 && clean.length <= 24) lots.add(clean.toUpperCase());
    }
  }
  return [...lots].slice(0, 12);
}

const HAZARD_RULES: [Hazard, RegExp][] = [
  ["allergen", /undeclared|allergen|peanut|tree nut|milk|egg|soy|wheat|sesame|shellfish|gluten/i],
  ["bacteria", /listeria|salmonella|e\.?\s?coli|botulin|clostridium|cronobacter|bacteria|microbial|mold|contaminat/i],
  ["foreign_object", /foreign (material|object|matter)|metal|glass|plastic (piece|fragment)|rubber|wood/i],
  ["choking", /chok|small parts|aspiration|suffocat|strangul|entrapment/i],
  ["fire", /fire|burn|overheat|flame|smoke|electrical shock|electrocut/i],
  ["chemical", /lead|toxic|poison|chemical|carbon monoxide|methanol|benzene|ingest/i],
  ["drug", /cgmp|potency|subpotent|superpotent|dissolution|sterility|impurit|nitrosamine/i],
  ["injury", /injur|laceration|fall|crash|tip.?over|pinch|crush|break|detach/i],
];

export function classifyHazard(text: string): Hazard {
  for (const [hazard, re] of HAZARD_RULES) if (re.test(text || "")) return hazard;
  return "other";
}

/** Headline like "New in California this week". */
export function targetedHeadline(stateAbbr: string | null | undefined, recallDate: string, now = new Date()): string {
  const days = (now.getTime() - new Date(recallDate).getTime()) / 86_400_000;
  const when = days <= 7 ? "this week" : days <= 31 ? "this month" : "";
  const name = stateAbbr ? US_STATES[stateAbbr] : null;
  if (name) return `New in ${name}${when ? ` ${when}` : ""}`;
  return when ? `New recall ${when}` : "Recall alert";
}
