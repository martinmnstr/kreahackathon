// Central knobs. Add a retailer here and everything else (queries, API, cache) picks it up.
export const RETAILERS = {
  walmart: { label: "Walmart" },
  // kroger: { label: "Kroger" },
  // costco: { label: "Costco" },
};

export const WINDOW_DAYS = 60; // how far back we look for recalls
export const CALA_WINDOW_DAYS = 15; // Cala returns ~3–6 rows per question, so we ask per sub-window
export const RECALLS_TTL_MS = 60 * 60 * 1000; // serve cached recalls for 1h, then refresh in background
export const COMPANY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // company profiles barely change
export const CONTEXT_TTL_MS = 24 * 60 * 60 * 1000; // per-recall Cala background story
export const PORT = Number(process.env.PORT ?? 8787);
