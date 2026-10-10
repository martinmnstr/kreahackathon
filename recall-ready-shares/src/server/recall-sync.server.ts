import { classifyHazard, parseLotNumbers, parseStates } from "@/lib/recall-parse";

type RecallRow = {
  id: string; source: string; title: string; product: string; firm: string; reason: string;
  hazard: string; classification: string | null; states: string[]; nationwide: boolean;
  lot_numbers: string[]; recall_date: string; source_url: string;
};

const FDA_KINDS = [
  { path: "food", label: "FDA" },
  { path: "drug", label: "FDA" },
  { path: "device", label: "FDA" },
] as const;

type FdaRecord = Partial<Record<"recall_number" | "product_description" | "distribution_pattern" | "recalling_firm" | "reason_for_recall" | "classification" | "code_info" | "more_code_info" | "report_date" | "recall_initiation_date", string>>;

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

async function fetchFda(): Promise<RecallRow[]> {
  const rows: RecallRow[] = [];
  for (const kind of FDA_KINDS) {
    const res = await fetch(`https://api.fda.gov/${kind.path}/enforcement.json?limit=100&sort=report_date:desc`);
    if (!res.ok) { console.error(`openFDA ${kind.path} ${res.status}`); continue; }
    const json = (await res.json()) as { results?: FdaRecord[] };
    for (const r of json.results ?? []) {
      if (!r.recall_number) continue;
      const product = (r.product_description ?? "").slice(0, 400);
      const { states, nationwide } = parseStates(r.distribution_pattern ?? "");
      rows.push({
        id: `fda:${r.recall_number}`,
        source: "FDA",
        title: product.split(/[,.;]/)[0]?.slice(0, 120) || "FDA recall",
        product,
        firm: r.recalling_firm ?? "",
        reason: r.reason_for_recall ?? "",
        hazard: classifyHazard(`${r.reason_for_recall} ${product}`),
        classification: r.classification ?? null,
        states, nationwide,
        lot_numbers: parseLotNumbers(`${r.code_info ?? ""} ${r.more_code_info ?? ""} ${product}`),
        recall_date: ymd(r.report_date ?? r.recall_initiation_date ?? "20260101"),
        source_url: `https://api.fda.gov/${kind.path}/enforcement.json?search=recall_number:%22${encodeURIComponent(r.recall_number)}%22`,
      });
    }
  }
  return rows;
}

/** Pulls the latest recalls from FDA and upserts them. Idempotent. */
export async function syncRecalls(): Promise<{ fetched: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await fetchFda();
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  for (let i = 0; i < unique.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("recalls")
      .upsert(unique.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Recall upsert failed: ${error.message}`);
  }
  return { fetched: unique.length };
}
