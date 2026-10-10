// Builds RecallEvent[] for a retailer: Cala rows → parse → openFDA gap-fill → Cala company profile
import { createHash } from "node:crypto";
import { RETAILERS, WINDOW_DAYS, CALA_WINDOW_DAYS, COMPANY_TTL_MS, RECALLS_TTL_MS } from "../config.js";
import { cached } from "../cache.js";
import * as cala from "../sources/cala.js";
import { fetchFdaRecalls } from "../sources/fda.js";
import { STATES, parseStates, parseDate, companyKey, cleanName } from "./parse.js";

const DAY = 864e5;
const FIELDS = "name, brand, company, recall_date, states_affected, reason, lot_codes, upc";
const fmt = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// Cala returns only a handful of rows per answer, and different windows surface different
// products — so we ask for the whole window AND each sub-window, then merge.
const phrasings = [
  (R, a, b) => `Which food products sold at ${R} were recalled between ${a} and ${b}? Return ${FIELDS}`,
  (R, a, b) => `List food recalls of products sold at ${R} from ${a} to ${b}. Return ${FIELDS}`, // retry wording
];

export function calaWindows({ now = new Date() } = {}) {
  const start = new Date(now - WINDOW_DAYS * DAY);
  const windows = [[start, now]];
  for (let end = now; end > start; end = new Date(end - CALA_WINDOW_DAYS * DAY)) {
    windows.push([new Date(Math.max(end - CALA_WINDOW_DAYS * DAY, start)), end]);
  }
  return windows.map(([a, b]) => [fmt(a), fmt(b)]);
}

// Ask; if Cala calls the question "too complex", try the other wording once
async function askWindow(label, [a, b]) {
  for (const phrase of phrasings) {
    const res = await cala.query(phrase(label, a, b));
    if (res.rows.length || !res.errors.length) return res.rows;
  }
  console.warn(`Cala refused ${label} ${a} – ${b} in every wording`);
  return [];
}

// The dot-notation query from the Lovable prototype surfaces different products than the
// questions above (e.g. lettuce, nut butter) but only returns name/description/contamination —
// no company, date or states. Those come from the merge with other rows or from openFDA.
async function askRetailerList(label) {
  const { rows, errors } = await cala.query(`food_recalls.retailer=${label}.limit=50`);
  if (errors.length) console.warn(`Cala refused the ${label} list query: ${errors[0]}`);
  return rows.map(({ contamination, ...r }) => ({ ...r, reason: r.reason ?? contamination ?? null }));
}

/** @returns {Promise<import("./types.js").RecallEvent[]>} */
export async function buildRecalls(retailer, { now = new Date() } = {}) {
  const { label } = RETAILERS[retailer];
  const from = new Date(now - WINDOW_DAYS * DAY);

  const [answers, fda] = await Promise.all([
    Promise.all([...calaWindows({ now }).map((w) => askWindow(label, w)), askRetailerList(label)]),
    cached(`openfda-${WINDOW_DAYS}d`, RECALLS_TTL_MS, () => fetchFdaRecalls({ from, to: now })).then((e) => e.value),
  ]);

  const events = dedupe(answers.flat()).map((row) => toEvent(row, retailer));
  for (const e of events) fillFromFda(e, fda, now);
  await attachCompanyProfiles(events);

  return events
    .filter((e) => !e.recallDate || e.recallDate >= from.toISOString().slice(0, 10))
    .sort((a, b) => (b.recallDate ?? "").localeCompare(a.recallDate ?? ""));
}

// Same product shows up in several answers worded differently ("Great Value Frozen Organic
// Triple Berry Blend (includes…)" vs "Great Value Organic Triple Berry Blend (Frozen)").
// Same company + mostly the same words → one recall; keep the row with the most fields filled
// and fill its gaps from the other (e.g. a list-query row gains a date from a question row).
const NOISE = new Set(["frozen", "includes", "and", "with", "the", "for", "pack", "bottles", "product", "products"]);
const words = (s) => new Set((s ?? "").toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !NOISE.has(w)) ?? []);
const similar = (a, b) => {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / Math.min(a.size, b.size) >= 0.8; // one name's words are (nearly) contained in the other's
};
const filled = (x) => Object.values(x).filter((v) => v != null && v !== "").length;

function dedupe(rows) {
  const kept = [];
  for (const r of rows) {
    const w = words(r.name);
    const i = kept.findIndex((k) => {
      const sameCo = !k.row.company || !r.company || companyKey(k.row.company) === companyKey(r.company);
      return sameCo && w.size && k.words.size && similar(w, k.words);
    });
    if (i < 0) {
      kept.push({ row: r, words: w });
      continue;
    }
    const [main, extra] = filled(r) > filled(kept[i].row) ? [r, kept[i].row] : [kept[i].row, r];
    const merged = { ...main };
    for (const [k, v] of Object.entries(extra)) if (merged[k] == null || merged[k] === "") merged[k] = v;
    kept[i] = { row: merged, words: main === r ? w : kept[i].words };
  }
  return kept.map((k) => k.row);
}

function toEvent(row, retailer) {
  const { states, nationwide, complete } = parseStates(row.states_affected);
  const { date, precision } = parseDate(row.recall_date);
  const company = cleanName(row.company) || null;
  return {
    id: createHash("sha1").update(`${retailer}|${companyKey(company)}|${row.name}`).digest("hex").slice(0, 12),
    retailer,
    product: row.name,
    brand: row.brand ? cleanName(row.brand) : null,
    company,
    reason: row.reason ?? null,
    lotCodes: row.lot_codes ?? null,
    upc: row.upc ?? null,
    recallDate: date,
    datePrecision: precision,
    states,
    nationwide,
    statesComplete: complete,
    classification: null,
    fda: null,
    companyProfile: null,
    sources: { recallDate: "cala", states: "cala" },
    raw: row,
  };
}

// Match by company name; among the firm's rows prefer ones whose product text mentions our brand/product words.
// Rows without a company (list query) fall back to a strict product-text match.
function fillFromFda(e, fda, now) {
  const words = [...new Set(`${e.brand ?? ""} ${e.product}`.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
  const overlap = (r) => words.filter((w) => r.product.toLowerCase().includes(w)).length;
  const key = companyKey(e.company);
  const candidates =
    key.length >= 4
      ? fda.filter((r) => {
          const k = companyKey(r.firm);
          return k.length >= 4 && (k.includes(key) || key.includes(k));
        })
      : fda.filter((r) => overlap(r) >= 3 && overlap(r) / words.length >= 0.6);
  if (!candidates.length) return;
  const match = candidates.reduce((a, b) => (overlap(b) > overlap(a) ? b : a));

  if (!e.company) {
    e.company = cleanName(match.firm);
    e.sources.company = "openfda";
  }
  e.fda = { recallNumber: match.recallNumber, eventId: match.eventId, firm: match.firm, url: match.url };
  e.classification = match.classification;
  e.sources.classification = "openfda";

  if (!e.statesComplete) {
    const fromFda = parseStates(match.distribution);
    if (fromFda.complete) {
      Object.assign(e, { states: fromFda.states, nationwide: fromFda.nationwide, statesComplete: true });
      e.sources.states = "openfda";
    }
  }
  // Cala dates can be vague ("early October") or even in the future — prefer the FDA date then
  const future = e.recallDate && e.recallDate > now.toISOString().slice(0, 10);
  if ((!e.recallDate || e.datePrecision !== "day" || future) && match.initiationDate) {
    Object.assign(e, { recallDate: match.initiationDate, datePrecision: "day" });
    e.sources.recallDate = "openfda";
  }
}

// One Cala entity lookup per company, cached for a week. Sequential: the entity endpoints rate-limit bursts.
async function attachCompanyProfiles(events) {
  const profiles = {};
  for (const name of new Set(events.map((e) => e.company).filter(Boolean))) {
    profiles[name] = await cached(`company-${companyKey(name)}`, COMPANY_TTL_MS, () => fetchCompanyProfile(name))
      .then((c) => c.value)
      .catch((err) => (console.warn(`Company profile for ${name} failed: ${err.message}`), null));
  }
  for (const e of events) e.companyProfile = profiles[e.company] ?? null;
}

async function fetchCompanyProfile(name) {
  // Fuzzy search returns look-alikes ("Frutas y Hortalizas del Sur" → "Inmobiliaria del Sur"),
  // so only accept a hit whose name covers most of our company's words
  const { entities = [] } = await cala.searchEntities(name);
  const want = companyKey(name).split(" ");
  const coverage = (x) => want.filter((w) => companyKey(x.name).split(" ").includes(w)).length / want.length;
  const hit = entities.filter((x) => coverage(x) >= 0.75).sort((a, b) => coverage(b) - coverage(a))[0];
  if (!hit) return null;
  const p = await cala.getEntity(hit.id);
  return {
    calaId: hit.id,
    legalName: p.legal_name ?? p.name ?? hit.name,
    headquarters: p.headquarters_address ?? null,
    foundingDate: p.founding_date ?? null,
    cik: p.cik ?? null,
    lei: p.lei ?? null,
    status: p.operational_status ?? null,
  };
}

/** @returns {Record<string, import("./types.js").StateSummary>} */
export function summarizeStates(events) {
  const out = Object.fromEntries(
    Object.entries(STATES).map(([code, name]) => [code, { name, total: 0, nationwide: 0, classI: 0, recallIds: [] }]),
  );
  for (const e of events) {
    for (const code of e.nationwide ? Object.keys(STATES) : e.states) {
      const s = out[code];
      s.total++;
      if (e.nationwide) s.nationwide++;
      if (e.classification === "Class I") s.classI++;
      s.recallIds.push(e.id);
    }
  }
  return out;
}
