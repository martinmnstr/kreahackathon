// TODO (Cala team): news, financials, lawsuits for the recalling company
// Key: https://console.cala.ai  (process.env.CALA_API_KEY)
export async function getCompanyContext(companyName) {
  return { name: companyName, summary: "TODO", news: [], lawsuits: [] };
}
