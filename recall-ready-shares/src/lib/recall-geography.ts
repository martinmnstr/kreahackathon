import { US_STATES } from "@/lib/recall-parse";

export type GeographicRecall = { id: string; states: string[]; nationwide: boolean };

export function recallsForState<T extends GeographicRecall>(recalls: T[], state: string): T[] {
  return state === "ALL" ? recalls : recalls.filter((recall) => recall.nationwide || recall.states.includes(state));
}

export function stateRecallCounts(recalls: GeographicRecall[]): Record<string, number> {
  const counts = Object.fromEntries(Object.keys(US_STATES).map((code) => [code, 0]));
  const seen = new Set<string>();
  for (const recall of recalls) {
    if (seen.has(recall.id)) continue;
    seen.add(recall.id);
    const affected = recall.nationwide ? Object.keys(US_STATES) : [...new Set(recall.states)];
    for (const code of affected) if (code in counts) counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}