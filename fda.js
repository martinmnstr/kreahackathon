// Latest food recall from openFDA (no key needed)
// Docs: https://open.fda.gov/apis/food/enforcement/
export async function getLatestRecall() {
  const res = await fetch("https://api.fda.gov/food/enforcement.json?sort=report_date:desc&limit=1");
  const data = await res.json();
  return data.results[0];
}
