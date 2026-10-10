import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncRecallsNow } from "@/lib/recalls.functions";
import { HAZARD_LABELS, US_STATES, type Hazard } from "@/lib/recall-parse";
import { hazardIcon } from "@/lib/illustrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecallMap } from "@/components/recall-map";
import { useRecallRadarIndex } from "@/components/recall-radar-cards";
import { recallsForState } from "@/lib/recall-geography";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Live recalls — Recall Story Cards" },
      { name: "description", content: "Explore FDA recalls on an interactive US map, filter by state, and create sourced story cards." },
      { property: "og:title", content: "Live recalls — Recall Story Cards" },
      { property: "og:description", content: "Explore FDA recall activity on an interactive map and create sourced story cards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const sync = useServerFn(syncRecallsNow);
  const [state, setState] = useState<string>("ALL");
  const [range, setRange] = useState("7");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);

  const { data: recalls, isLoading } = useQuery({
    queryKey: ["recalls", range],
    queryFn: async () => {
      const since = new Date(Date.now() - Number(range) * 86_400_000).toISOString().slice(0, 10);
      const query = supabase.from("recalls").select("*").gte("recall_date", since).order("recall_date", { ascending: false }).limit(200);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  async function refresh() {
    setSyncing(true);
    try {
      const r = await sync();
      toast.success(`Checked ${r.fetched} recalls from FDA`);
      qc.invalidateQueries({ queryKey: ["recalls"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally { setSyncing(false); }
  }

  // First visit with an empty feed: pull data once.
  useEffect(() => {
    supabase.from("recalls").select("id", { count: "exact", head: true }).then(({ count }) => { if (count === 0) refresh(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const radar = useRecallRadarIndex().data ?? {};
  const searched = (recalls ?? []).filter((r) => !q || `${r.title} ${r.firm} ${r.reason}`.toLowerCase().includes(q.toLowerCase()));
  const filtered = recallsForState(searched, state);
  const headline = state === "ALL" ? "All recalls" : `New in ${US_STATES[state]} ${range === "7" ? "this week" : range === "30" ? "this month" : ""}`;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">LIVE FEED · FDA</p>
          <h1 className="text-4xl">{headline}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All states</SelectItem>
              {Object.entries(US_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">This week</SelectItem>
              <SelectItem value="30">This month</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Search product or firm" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Button variant="outline" onClick={refresh} disabled={syncing}><RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </div>

      <RecallMap recalls={searched} state={state} onStateChange={setState} loading={isLoading} />
      <div className="mt-7 flex items-center justify-between gap-3"><h2 className="font-sans text-lg font-bold">{state === "ALL" ? "Latest recalls" : `${US_STATES[state]} recalls`}</h2><span className="font-mono text-xs text-muted-foreground">{filtered.length} RESULTS</span></div>
      {isLoading ? <p className="mt-10 font-mono text-sm">Loading recalls…</p> : filtered.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No recalls match. Try a wider date range.</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const Icon = hazardIcon(r.hazard);
            return (
              <li key={r.id} className="flex flex-col rounded-lg border-2 border-ink bg-card p-5 transition-shadow hover:shadow-stamp">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded bg-ink px-2 py-0.5 font-mono text-xs text-paper">{r.source}{r.classification ? ` · ${r.classification}` : ""}</span>
                  <span className="flex items-center gap-2">
                    {radar[r.id.split(":")[1] ?? ""] && <span className="rounded bg-caution px-2 py-0.5 font-mono text-xs">4 CARDS READY</span>}
                    <span className="font-mono text-xs text-muted-foreground">{r.recall_date}</span>
                  </span>
                </div>
                <div className="mt-3 flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-caution"><Icon className="h-6 w-6" /></span>
                  <h2 className="line-clamp-3 font-sans text-base font-bold">{r.title}</h2>
                </div>
                <p className="mt-2 text-xs font-bold uppercase text-primary">{HAZARD_LABELS[r.hazard as Hazard]}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.reason}</p>
                <p className="mt-3 font-mono text-xs">{r.nationwide && r.states.length === 0 ? "NATIONWIDE" : r.states.join(" · ") || "States not listed"}</p>
                <Button asChild className="mt-4 self-start" size="sm">
                  <Link to="/recall/$id" params={{ id: r.id }} search={{ state: state === "ALL" ? undefined : state }}>Make card</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
