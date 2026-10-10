// Rebuild the recall snapshot for every retailer (or one: npm run refresh -- walmart) and print a summary.
// Run this before a demo so the API answers instantly instead of waiting ~1 min on Cala.
import { RETAILERS } from "../src/config.js";
import { getRecalls, getStates } from "../src/service.js";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(RETAILERS);
for (const id of ids) {
  const t = Date.now();
  const { recalls } = await getRecalls(id, { force: true });
  const { states } = await getStates(id);
  const by = (src) => (field) => recalls.filter((r) => r.sources[field] === src).length;
  const fda = by("openfda");
  console.log(`\n${RETAILERS[id].label}: ${recalls.length} recalls in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  console.log(`  states: ${recalls.filter((r) => r.statesComplete).length} complete (${fda("states")} filled by openFDA), ${recalls.filter((r) => r.nationwide).length} nationwide`);
  console.log(`  FDA match: ${recalls.filter((r) => r.fda).length}, dates from openFDA: ${fda("recallDate")}, company profiles: ${recalls.filter((r) => r.companyProfile).length}`);
  console.log(`  top states: ${Object.entries(states).sort((a, b) => b[1].total - a[1].total).slice(0, 8).map(([c, s]) => `${c}:${s.total}`).join(" ")}`);
  for (const r of recalls) {
    const where = r.nationwide ? "nationwide" : r.states.length ? r.states.join(",") : "states unknown";
    console.log(`  - ${r.recallDate ?? "????-??-??"} ${(r.classification ?? "").padEnd(9)} ${r.product.slice(0, 55).padEnd(55)} ${where.slice(0, 40)}`);
  }
}
