// What the API (server.js) and the CLI scripts call. Everything here is cached (see cache.js).
import { RETAILERS, RECALLS_TTL_MS, CONTEXT_TTL_MS } from "./config.js";
import { cached } from "./cache.js";
import { buildRecalls, summarizeStates } from "./recalls/build.js";
import { fetchRecallContext } from "./recalls/context.js";

export function assertRetailer(retailer) {
  if (!RETAILERS[retailer]) throw Object.assign(new Error(`Unknown retailer "${retailer}"`), { status: 404 });
}

/** → { savedAt, stale, recalls: RecallEvent[] } */
export async function getRecalls(retailer, { force = false } = {}) {
  assertRetailer(retailer);
  const { savedAt, stale, value } = await cached(`recalls-${retailer}`, RECALLS_TTL_MS, () => buildRecalls(retailer), { force });
  return { retailer, savedAt, stale, recalls: value };
}

export async function getStates(retailer) {
  const { savedAt, stale, recalls } = await getRecalls(retailer);
  return { retailer, savedAt, stale, states: summarizeStates(recalls) };
}

export async function getRecall(retailer, id) {
  const recall = (await getRecalls(retailer)).recalls.find((r) => r.id === id);
  if (!recall) throw Object.assign(new Error(`No recall ${id} for ${retailer}`), { status: 404 });
  return recall;
}

// Background story for the recall the user picked (the media subset is chosen in the UI).
// ~20–60s on first call, then cached.
export async function getContext(retailer, id, { force = false } = {}) {
  const recall = await getRecall(retailer, id);
  const { savedAt, value } = await cached(`context-${id}`, CONTEXT_TTL_MS, () => fetchRecallContext(recall), { force });
  return { recallId: id, savedAt, ...value };
}
