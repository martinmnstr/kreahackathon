import type { RecallRow } from "./external.functions";

export type Store = {
  lat: number; lng: number; ref: string; name: string;
  street: string; city: string; state: string; zip: string;
};

export type Recall = { product: string; details: string; area: string };

const pick = (r: RecallRow, keys: string[]) => {
  for (const k of Object.keys(r)) {
    if (keys.some((p) => k.toLowerCase().includes(p))) {
      const v = r[k];
      if (v != null && v !== "") return Array.isArray(v) ? v.join(", ") : String(v);
    }
  }
  return "";
};

export function normalizeRecalls(rows: RecallRow[]): Recall[] {
  return rows.map((r) => {
    const product =
      pick(r, ["product", "item", "food"]) || pick(r, ["name", "title", "brand"]) ||
      String(Object.values(r)[0] ?? "Unknown product");
    const area = pick(r, ["state", "distribution", "region", "location", "area"]);
    const details = Object.entries(r)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .join(" · ");
    return { product, details, area };
  });
}

/** A recall applies to a store when it is nationwide/unspecified or mentions the store's state. */
export function recallsForStore(recalls: Recall[], state: string): Recall[] {
  return recalls.filter((r) => {
    const a = r.area.toLowerCase();
    if (!a || /nation|all states|united states|\bus\b|usa/.test(a)) return true;
    return new RegExp(`\\b${state.toLowerCase()}\\b`).test(a);
  });
}
