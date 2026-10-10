import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Pack = {
  eventId: string; product: string; firm: string; hazard: string; classification: string; cards: string[];
};

export const CRISIS_PACK_FORMAT = "crisis-pack";
const LABELS = ["Recall alert", "Check your kitchen", "What to do", "Official statement"];

// Cards are generated offline by Recall Radar (openFDA → Cala → Krea). They're served from this app's
// /public when present, otherwise straight from the public team repo, so the app only needs this file.
const SOURCES = [
  "/recall-radar",
  "https://raw.githubusercontent.com/martinmnstr/kreahackathon/dain/cards-in-lovable/recall-ready-shares/public/recall-radar",
];

/** Index of crisis card packs, keyed by FDA recall number. */
export function useRecallRadarIndex() {
  return useQuery({
    queryKey: ["recall-radar-index"],
    queryFn: async () => {
      for (const base of SOURCES) {
        try {
          const res = await fetch(`${base}/index.json`);
          if (!res.ok) continue;
          const index = (await res.json()) as Record<string, Pack>;
          for (const pack of Object.values(index)) pack.cards = pack.cards.map((c) => (c.startsWith("http") ? c : `${base}/${c}`));
          return index;
        } catch { /* try next source */ }
      }
      return {} as Record<string, Pack>;
    },
    staleTime: Infinity,
  });
}

export function RecallRadarCards({ recallId }: { recallId: string }) {
  const qc = useQueryClient();
  const pack = useRecallRadarIndex().data?.[recallId.split(":")[1] ?? ""];

  if (!pack) return null;

  // Fetch as a blob: the download attribute is ignored for cross-origin URLs.
  async function save(srcs: string[]) {
    for (const src of srcs) {
      const blob = await (await fetch(src)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${pack!.eventId}-${src.split("/").pop()}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    await supabase.from("cards").insert({
      recall_id: recallId, format: CRISIS_PACK_FORMAT, kind: "image",
      headline: srcs.length > 1 ? "Crisis response cards (4)" : `Crisis card · ${LABELS[pack!.cards.indexOf(srcs[0]!)]}`,
    });
    qc.invalidateQueries({ queryKey: ["cards"] });
    toast.success("Downloaded and saved to your library");
  }

  return (
    <section className="mt-8 rounded-lg border-2 border-ink bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-block bg-caution px-2 py-0.5 font-mono text-xs">AUTO-GENERATED · NO HUMAN EDITING</p>
          <h2 className="mt-2 text-2xl leading-tight">Crisis response cards</h2>
          <p className="text-sm text-muted-foreground">
            {pack.hazard} · {pack.classification} · FDA data + Cala context + Krea visuals
          </p>
        </div>
        <Button className="stamp" onClick={() => save(pack.cards)}>
          <Download className="mr-2 h-4 w-4" />Download all 4
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pack.cards.map((src, i) => (
          <figure key={src} className="overflow-hidden rounded border-2 border-ink">
            <img src={src} alt={`${LABELS[i]} — ${pack.product}`} className="block aspect-square w-full" loading="lazy" />
            <figcaption className="flex items-center justify-between bg-ink px-3 py-2 font-mono text-xs text-paper">
              <span>{i + 1} · {LABELS[i]}</span>
              <button onClick={() => save([src])} className="inline-flex items-center gap-1 underline">
                <Download className="h-3 w-3" />PNG
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
