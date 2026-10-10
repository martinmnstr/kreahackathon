// Narrative background for one recall from Cala's search endpoint — input for the media/cards step.
import * as cala from "../sources/cala.js";

/** → { summary, sources } — summary is markdown, sources are Cala's citations (shape as returned) */
export async function fetchRecallContext(r) {
  const res = await cala.search(
    `In 3-4 sentences: what happened in the ${r.company ?? r.brand} recall of ${r.product}` +
      `${r.reason ? ` (${r.reason})` : ""}, what is the health risk, what should consumers do, and has the company made a statement?`,
  );
  return {
    summary: (res.content ?? res.answer ?? res.text ?? "").trim() || null,
    sources: res.explainability ?? res.sources ?? res.citations ?? [],
  };
}
