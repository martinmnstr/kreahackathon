// Cala knowledge API (process.env.CALA_API_KEY). Docs: https://docs.cala.ai/llms.txt
// Learned the hard way:
// - Plain-English questions that name the fields ("Return name, brand, …") give the richest rows.
//   Dot-notation with filters/return() mostly answers "too complex".
// - New questions take ~1 min; identical questions are cached by Cala and come back fast.
// - Rows are LLM-synthesized: dates/states are free text and need parsing (see recalls/parse.js).
const BASE = "https://api.cala.ai/v1";
const MIN_GAP_MS = 1200; // Cala rate-limits bursts (429), so requests start at least this far apart
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextSlot = 0;
async function throttle() {
  const wait = nextSlot - Date.now();
  nextSlot = Math.max(nextSlot, Date.now()) + MIN_GAP_MS;
  if (wait > 0) await sleep(wait);
}

async function cala(path, { method = "GET", body } = {}) {
  const key = process.env.CALA_API_KEY;
  if (!key) throw new Error("CALA_API_KEY missing in .env");
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", "X-API-KEY": key },
      body: body && JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 5000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`Cala ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

// Structured rows + entities. Rows with an "error" field mean Cala refused the question.
export async function query(input) {
  const { results = [], entities = [] } = await cala("/knowledge/query", { method: "POST", body: { input } });
  const errors = results.filter((r) => r.error).map((r) => r.error);
  return { rows: results.filter((r) => !r.error), entities, errors };
}

// Natural-language answer with citations
export const search = (input) => cala("/knowledge/search", { method: "POST", body: { input } });

export const searchEntities = (name, { types = "Company", limit = 5 } = {}) =>
  cala(`/entities?${new URLSearchParams({ name, entity_types: types, limit: String(limit) })}`);

// Properties come back as { value, sources }; flatten to plain values
export async function getEntity(id) {
  const { properties = {} } = await cala(`/entities/${id}`, { method: "POST", body: {} });
  return Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, v?.value ?? null]));
}
