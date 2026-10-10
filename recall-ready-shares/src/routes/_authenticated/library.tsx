import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { US_STATES } from "@/lib/recall-parse";
import { Button } from "@/components/ui/button";
import { CRISIS_PACK_FORMAT } from "@/components/recall-radar-cards";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "My library — Recall Story Cards" },
      { name: "description", content: "Every recall card and clip you've made, ready to reopen." },
      { property: "og:title", content: "My library — Recall Story Cards" },
      { property: "og:description", content: "Every recall card and clip you've made." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Library,
});

function Library() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("*, recalls(title, source, recall_date)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function remove(id: string) {
    await supabase.from("cards").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["cards"] });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-4xl">My library</h1>
      {isLoading ? <p className="mt-6 font-mono text-sm">Loading…</p> : !data?.length ? (
        <p className="mt-6 text-muted-foreground">No cards yet. <Link to="/dashboard" className="underline">Pick a recall</Link> to make your first one.</p>
      ) : (
        <ul className="mt-6 divide-y-2 divide-ink/10 rounded-lg border-2 border-ink bg-card">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-4 p-4">
              <span className="w-20 rounded bg-ink px-2 py-1 text-center font-mono text-xs text-paper">{c.kind === "clip" ? "CLIP" : c.format === CRISIS_PACK_FORMAT ? "CRISIS" : "CARD"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.recalls?.title}</p>
                <p className="text-xs text-muted-foreground">
                  {c.format === "tiktok" ? "TikTok 9:16" : c.format === CRISIS_PACK_FORMAT ? "Crisis cards 1:1" : "Instagram 4:5"} · {c.headline}
                  {c.target_state ? ` · ${US_STATES[c.target_state] ?? c.target_state}` : ""} · {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/recall/$id" params={{ id: c.recall_id }} search={{ state: c.target_state ?? undefined, format: c.format === "tiktok" ? "tiktok" : "instagram", headline: c.headline }}>Reopen</Link>
              </Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
