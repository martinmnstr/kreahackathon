// Reads from the Recall Radar data service (repo root, `npm start` → :8787) and maps
// its RecallEvent (see ../../src/recalls/types.js) to the row shape the UI renders.
import { classifyHazard } from "@/lib/recall-parse";
import type { CardRecall } from "@/lib/card-render";

const API = import.meta.env["VITE_API_URL"] ?? "http://localhost:8787";
const RETAILER = "walmart";

type RecallEvent = {
  id: string; product: string; brand: string | null; company: string | null; reason: string | null;
  lotCodes: string | null; recallDate: string | null; states: string[]; nationwide: boolean;
  classification: string | null; fda: { recallNumber: string; url: string } | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api/${RETAILER}${path}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `API ${res.status}`);
  return body as T;
}

function toRow(r: RecallEvent): CardRecall {
  return {
    id: r.id,
    source: r.fda ? "FDA" : "Cala",
    recall_number: r.fda?.recallNumber ?? null,
    title: r.product,
    product: r.product,
    firm: r.company ?? r.brand ?? "",
    reason: r.reason ?? "",
    hazard: classifyHazard(`${r.reason ?? ""} ${r.product}`),
    classification: r.classification,
    states: r.states,
    nationwide: r.nationwide,
    lot_numbers: r.lotCodes ? r.lotCodes.split(/\s*[,;]\s*/).filter(Boolean) : [],
    recall_date: r.recallDate ?? "",
    source_url: r.fda?.url ?? "",
  };
}

export async function fetchRecalls({ refresh = false } = {}): Promise<CardRecall[]> {
  const { recalls } = await get<{ recalls: RecallEvent[] }>(`/recalls${refresh ? "?refresh=1" : ""}`);
  return recalls.map(toRow).sort((a, b) => b.recall_date.localeCompare(a.recall_date));
}

export async function fetchRecall(id: string): Promise<CardRecall> {
  return toRow(await get<RecallEvent>(`/recalls/${id}`));
}
