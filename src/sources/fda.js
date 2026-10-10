// openFDA food enforcement reports (no key). Docs: https://open.fda.gov/apis/food/enforcement/
// Only used to fill gaps in Cala rows: official class, exact dates, distribution states.
const BASE = "https://api.fda.gov/food/enforcement.json";
const PAGE = 1000;

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const isoDate = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

// All rows reported in [from, to]. One row = one product.
export async function fetchFdaRecalls({ from, to = new Date() }) {
  const rows = [];
  for (let skip = 0; ; skip += PAGE) {
    const url = `${BASE}?search=report_date:[${ymd(from)}+TO+${ymd(to)}]&sort=report_date:desc&limit=${PAGE}&skip=${skip}`;
    const res = await fetch(url);
    if (res.status === 404) break; // openFDA's "no matches"
    if (!res.ok) throw new Error(`openFDA ${res.status}: ${await res.text()}`);
    const data = await res.json();
    rows.push(...data.results);
    if (rows.length >= data.meta.results.total) break;
  }
  return rows.map((r) => ({
    recallNumber: r.recall_number,
    eventId: r.event_id,
    firm: r.recalling_firm.trim(),
    classification: r.classification,
    status: r.status,
    product: r.product_description,
    reason: r.reason_for_recall,
    distribution: r.distribution_pattern,
    reportDate: isoDate(r.report_date),
    initiationDate: isoDate(r.recall_initiation_date),
    url: `https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=${r.event_id}`,
  }));
}
