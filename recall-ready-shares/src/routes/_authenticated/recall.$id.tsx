import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Film, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { US_STATES, targetedHeadline } from "@/lib/recall-parse";
import { FORMAT_SIZE, downloadBlob, renderCardPng, renderCardToCanvas, renderClip, type CardFormat, type CardRecall } from "@/lib/card-render";
import { Button } from "@/components/ui/button";
import { RecallRadarCards } from "@/components/recall-radar-cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Search = { state?: string | undefined; format?: CardFormat | undefined; headline?: string | undefined };

export const Route = createFileRoute("/_authenticated/recall/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    state: typeof s["state"] === "string" ? s["state"] : undefined,
    format: s["format"] === "tiktok" || s["format"] === "instagram" ? s["format"] : undefined,
    headline: typeof s["headline"] === "string" ? s["headline"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Card studio — Recall Story Cards" },
      { name: "description", content: "Design a sourced recall card or clip for Instagram and TikTok." },
      { property: "og:title", content: "Card studio — Recall Story Cards" },
      { property: "og:description", content: "Design a sourced recall card or clip." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Studio,
});

function Studio() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<CardFormat>(search.format ?? "instagram");
  const [state, setState] = useState<string>(search.state ?? "NONE");
  const [headline, setHeadline] = useState(search.headline ?? "");
  const [clipProgress, setClipProgress] = useState<number | null>(null);

  const { data: recall } = useQuery({
    queryKey: ["recall", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("recalls").select("*").eq("id", id).single();
      if (error) throw error;
      return data as CardRecall;
    },
  });

  useEffect(() => {
    if (recall && !search.headline) setHeadline(targetedHeadline(state === "NONE" ? null : state, recall.recall_date));
  }, [recall, state, search.headline]);

  const input = recall ? { recall, format, headline, highlightState: state === "NONE" ? null : state } : null;

  useEffect(() => {
    if (input && canvasRef.current) renderCardToCanvas(canvasRef.current, input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recall, format, headline, state]);

  async function save(kind: "image" | "clip") {
    if (!recall) return;
    await supabase.from("cards").insert({ recall_id: recall.id, format, kind, headline, target_state: state === "NONE" ? null : state });
  }

  const slug = recall ? `${recall.id.replace(/[^a-z0-9]+/gi, "-")}-${format}` : "card";

  async function downloadPng() {
    if (!input) return;
    downloadBlob(await renderCardPng(input), `${slug}.png`);
    await save("image");
    toast.success("Card downloaded and saved to your library");
  }

  async function downloadClip() {
    if (!input) return;
    setClipProgress(0);
    try {
      const { blob, ext } = await renderClip(input, setClipProgress);
      downloadBlob(blob, `${slug}.${ext}`);
      await save("clip");
      toast.success("Clip downloaded and saved to your library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clip export failed");
    } finally { setClipProgress(null); }
  }

  if (!recall) return <p className="p-10 font-mono text-sm">Loading recall…</p>;
  const stateOptions = recall.states.length ? recall.states : Object.keys(US_STATES);

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_380px]">
      <div>
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Back to recalls</Link>
        <div className="flex justify-center rounded-lg border-2 border-ink bg-muted p-6">
          <canvas
            ref={canvasRef}
            className="stamp h-auto rounded"
            style={{ width: format === "tiktok" ? 360 : 440, aspectRatio: `${FORMAT_SIZE[format].w}/${FORMAT_SIZE[format].h}` }}
          />
        </div>
        <RecallRadarCards recallId={recall.id} />
      </div>
      <aside className="space-y-5">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{recall.source} · {recall.id.split(":")[1]}</p>
          <h1 className="mt-1 text-2xl leading-tight">{recall.title}</h1>
          <a href={recall.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm underline">View official source <ExternalLink className="h-3 w-3" /></a>
        </div>
        <div className="space-y-2">
          <Label>Format</Label>
          <ToggleGroup type="single" value={format} onValueChange={(v) => v && setFormat(v as CardFormat)} className="justify-start">
            <ToggleGroupItem value="instagram">Instagram 4:5</ToggleGroupItem>
            <ToggleGroupItem value="tiktok">TikTok 9:16</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label>Target state</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No targeting</SelectItem>
              {stateOptions.map((s) => <SelectItem key={s} value={s}>{US_STATES[s] ?? s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="headline">Headline</Label>
          <Input id="headline" value={headline} maxLength={40} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div className="rounded-lg border-2 border-ink bg-card p-4 text-sm">
          <p className="font-semibold">Lot numbers found</p>
          <p className="mt-1 font-mono text-xs">{recall.lot_numbers.join(", ") || "None detected — card points to the source."}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={downloadPng} className="stamp"><Download className="mr-2 h-4 w-4" />Download card (PNG)</Button>
          <Button variant="outline" onClick={downloadClip} disabled={clipProgress !== null}><Film className="mr-2 h-4 w-4" />{clipProgress !== null ? "Recording clip…" : "Download 7s clip"}</Button>
          {clipProgress !== null && <Progress value={clipProgress * 100} />}
        </div>
      </aside>
    </main>
  );
}
