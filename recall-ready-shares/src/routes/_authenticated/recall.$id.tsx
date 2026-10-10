import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Clapperboard, Download, Film, ExternalLink, Image as ImageIcon, ImagePlus, LayoutGrid, Send } from "lucide-react";
import { fetchRecall } from "@/lib/api";
import { US_STATES, targetedHeadline } from "@/lib/recall-parse";
import { FORMAT_SIZE, downloadBlob, loadImage, renderCardPng, renderCardToCanvas, renderClip, type CardFormat } from "@/lib/card-render";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RecallRadarCards, useRecallRadarIndex } from "@/components/recall-radar-cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VideoFormats } from "@/components/video-formats";

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

const PHOTO_KEY = "rsc-presenter-photo";
const NAME_KEY = "rsc-presenter-name";

async function shrinkPhoto(file: File): Promise<string> {
  const img = await loadImage(URL.createObjectURL(file));
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = c.height = 320;
  c.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 320, 320);
  return c.toDataURL("image/jpeg", 0.85);
}

function Studio() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<CardFormat>(search.format ?? "instagram");
  const [state, setState] = useState<string>(search.state ?? "NONE");
  const [headline, setHeadline] = useState(search.headline ?? "");
  const [clipProgress, setClipProgress] = useState<number | null>(null);
  const [style, setStyle] = useState<"product" | "me">("product");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("");
  const [clip, setClip] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [expandStates, setExpandStates] = useState(false);

  useEffect(() => {
    setPhotoUrl(localStorage.getItem(PHOTO_KEY));
    setName(localStorage.getItem(NAME_KEY) ?? "");
  }, []);
  useEffect(() => {
    if (!photoUrl) { setPhotoImg(null); return; }
    loadImage(photoUrl).then(setPhotoImg).catch(() => setPhotoImg(null));
  }, [photoUrl]);

  const { data: recall } = useQuery({ queryKey: ["recall", id], queryFn: () => fetchRecall(id) });
  const pack = useRecallRadarIndex().data?.[recall?.recall_number ?? ""];
  const [tab, setTab] = useState("card");

  useEffect(() => {
    if (recall && !search.headline) setHeadline(targetedHeadline(state === "NONE" ? null : state, recall.recall_date));
  }, [recall, state, search.headline]);

  const presenter = style === "me" && photoImg ? { photo: photoImg, name: name.trim() } : null;
  const input = recall ? { recall, format, headline, highlightState: state === "NONE" ? null : state, presenter, expandStates } : null;

  useEffect(() => {
    if (input && canvasRef.current) renderCardToCanvas(canvasRef.current, input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recall, format, headline, state, style, photoImg, name, expandStates]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await shrinkPhoto(file);
      localStorage.setItem(PHOTO_KEY, url);
      setPhotoUrl(url);
      setStyle("me");
    } catch { toast.error("Could not read that photo"); }
  }

  const slug = recall ? `${recall.id.replace(/[^a-z0-9]+/gi, "-")}-${format}` : "card";

  async function downloadPng() {
    if (!input) return;
    downloadBlob(await renderCardPng(input), `${slug}.png`);
    toast.success("Card downloaded");
  }

  async function previewClip() {
    if (!input) return;
    if (style === "me" && !photoImg) { toast.error("Upload your photo first"); return; }
    setClipProgress(0);
    try {
      const { blob, ext } = await renderClip(input, setClipProgress);
      if (clip) URL.revokeObjectURL(clip.url);
      setClip({ url: URL.createObjectURL(blob), blob, ext });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clip export failed");
    } finally { setClipProgress(null); }
  }

  async function downloadClip() {
    if (!clip) return;
    downloadBlob(clip.blob, `${slug}.${clip.ext}`);
    toast.success("Clip downloaded");
  }

  if (!recall) return <p className="p-10 font-mono text-sm">Loading recall…</p>;
  const stateOptions = recall.states.length ? recall.states : Object.keys(US_STATES);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Back to recalls</Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{recall.source}{recall.recall_number ? ` · ${recall.recall_number}` : ""}{recall.classification ? ` · ${recall.classification}` : ""}</p>
          <h1 className="mt-1 max-w-3xl text-3xl leading-tight">{recall.title}</h1>
          {recall.source_url && <a href={recall.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm underline">View official source <ExternalLink className="h-3 w-3" /></a>}
        </div>
        <div className="max-w-sm rounded-lg border-2 border-ink bg-card px-4 py-3 text-sm">
          <p className="font-semibold">Lot numbers found</p>
          <p className="mt-1 font-mono text-xs">{recall.lot_numbers.join(", ") || "None detected — content points to the source."}</p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          {[
            { value: "card", icon: <ImageIcon className="h-4 w-4" />, label: "Story card", hint: "1 card · 7s clip" },
            { value: "pack", icon: <LayoutGrid className="h-4 w-4" />, label: "Crisis pack", hint: pack ? "4 cards ready" : "not generated", disabled: !pack },
            { value: "video", icon: <Clapperboard className="h-4 w-4" />, label: "AI video", hint: "4 formats" },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              disabled={t.disabled}
              className="gap-2 rounded-md border-2 border-ink bg-card px-4 py-2 text-ink data-[state=active]:bg-ink data-[state=active]:text-paper data-[state=active]:shadow-none"
            >
              {t.icon}<span className="font-semibold">{t.label}</span><span className="font-mono text-[11px] opacity-70">{t.hint}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="card" className="mt-0">
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div>
              <div className="flex justify-center rounded-lg border-2 border-ink bg-muted p-6">
                <canvas
                  ref={canvasRef}
                  onMouseEnter={() => setExpandStates(true)}
                  onMouseLeave={() => setExpandStates(false)}
                  className="stamp h-auto rounded"
                  style={{ width: format === "tiktok" ? 360 : 440, aspectRatio: `${FORMAT_SIZE[format].w}/${FORMAT_SIZE[format].h}` }}
                />
              </div>
              {recall.states.length > 4 && (
                <p className="mt-2 text-center font-mono text-xs text-muted-foreground">Hover the card to show all {recall.states.length} affected states</p>
              )}
            </div>
            <aside className="space-y-5">
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
              <div className="space-y-2">
                <Label>Clip style</Label>
                <ToggleGroup type="single" value={style} onValueChange={(v) => v && setStyle(v as "product" | "me")} className="justify-start">
                  <ToggleGroupItem value="product">Just the product</ToggleGroupItem>
                  <ToggleGroupItem value="me">Include me</ToggleGroupItem>
                </ToggleGroup>
                {style === "me" && (
                  <div className="space-y-2 rounded-lg border-2 border-ink bg-card p-3">
                    <div className="flex items-center gap-3">
                      {photoUrl ? <img src={photoUrl} alt="Your photo" className="h-14 w-14 rounded-full object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><ImagePlus className="h-5 w-5" /></div>}
                      <Label htmlFor="photo" className="cursor-pointer text-sm underline">{photoUrl ? "Change photo" : "Upload your photo"}</Label>
                      <input id="photo" type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                    </div>
                    <Input placeholder="Your name or handle" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); localStorage.setItem(NAME_KEY, e.target.value); }} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={downloadPng} className="stamp"><Download className="mr-2 h-4 w-4" />Download card (PNG)</Button>
                <Button variant="outline" onClick={previewClip} disabled={clipProgress !== null}><Film className="mr-2 h-4 w-4" />{clipProgress !== null ? "Making clip…" : "Preview 7s clip"}</Button>
                {clipProgress !== null && <Progress value={clipProgress * 100} />}
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="pack" className="mt-0">
          <RecallRadarCards recallNumber={recall.recall_number} />
        </TabsContent>

        <TabsContent value="video" className="mt-0">
          <VideoFormats recallNumber={recall.recall_number} slug={slug} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!clip} onOpenChange={(o) => !o && setClip(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Clip preview</DialogTitle></DialogHeader>
          {clip && <video src={clip.url} controls autoPlay loop playsInline className="mx-auto max-h-[60vh] rounded border-2 border-ink" />}
          <div className="flex flex-col gap-2">
            <Button onClick={downloadClip} className="stamp"><Download className="mr-2 h-4 w-4" />Download clip</Button>
            <Button variant="outline" disabled><Send className="mr-2 h-4 w-4" />Post to TikTok or X — coming soon</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
