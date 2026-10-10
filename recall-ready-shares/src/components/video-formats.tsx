import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { downloadBlob } from "@/lib/card-render";

// AI short videos are rendered by the Recall Radar video studio (Krea TTS + lip-synced presenter + ffmpeg),
// a separate local service in this repo: `npm run video` (http://localhost:4300).
const STUDIO =
  (import.meta.env["VITE_VIDEO_STUDIO_URL"] as string | undefined) ?? "http://localhost:4300";

type VideoFormat = {
  id: string;
  name: string;
  tagline: string;
  multi: boolean;
  sample: string | null;
};
type Job = {
  status: "running" | "done" | "error";
  log: { t: string; m: string }[];
  video?: string;
  events: string[];
};

const EXPECTED_SECONDS: Record<string, number> = {
  news: 200,
  countdown: 260,
  receipts: 240,
  mascot: 100,
};

export function VideoFormats({
  recallNumber,
  slug,
}: {
  recallNumber: string | null | undefined;
  slug: string;
}) {
  const [formats, setFormats] = useState<VideoFormat[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [format, setFormat] = useState("news");
  const [job, setJob] = useState<Job | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // The video pipeline reads the FDA enforcement record, so it needs an FDA recall number.
  const supported = !!recallNumber;

  useEffect(() => {
    fetch(`${STUDIO}/api/formats`)
      .then((r) => r.json())
      .then(setFormats)
      .catch(() => setOffline(true));
    return () => window.clearTimeout(timer.current);
  }, []);

  async function generate() {
    const f = formats?.find((x) => x.id === format);
    if (!f) return;
    setResult(null);
    const started = Date.now();
    try {
      const res = await fetch(`${STUDIO}/api/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          recallNumbers: [recallNumber],
          withLatest: f.multi ? 2 : 0,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setJob({ status: "running", log: [], events: [] });
      const poll = async () => {
        const j = (await fetch(`${STUDIO}/api/jobs/${res.id}`).then((r) => r.json())) as Job;
        setJob(j);
        setElapsed((Date.now() - started) / 1000);
        if (j.status === "running") {
          timer.current = window.setTimeout(poll, 1500);
          return;
        }
        if (j.status === "done" && j.video) setResult(`${STUDIO}${j.video}`);
        else toast.error(j.log.at(-1)?.m ?? "Video failed");
        setJob(null);
      };
      poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach the video studio");
      setJob(null);
    }
  }

  async function download() {
    if (!result) return;
    const blob = await fetch(result).then((r) => r.blob());
    downloadBlob(blob, `${slug}-${format}.mp4`);
  }

  const current = formats?.find((x) => x.id === format);

  return (
    <div className="space-y-3 rounded-lg border-2 border-ink bg-card p-4">
      <div>
        <Label className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4" />
          AI short video
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a format. Krea writes the voice, the presenter and the visuals from this FDA record.
        </p>
      </div>

      {offline && (
        <p className="font-mono text-xs text-muted-foreground">
          Video studio offline — run <code>npm run video</code> in the repo root.
        </p>
      )}
      {!offline && !supported && (
        <p className="font-mono text-xs text-muted-foreground">
          Video needs an FDA recall number — this recall only has Cala data.
        </p>
      )}

      {formats && supported && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {formats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`overflow-hidden rounded-md border-2 text-left transition ${format === f.id ? "border-primary" : "border-ink/20 hover:border-ink"}`}
              >
                <div className="relative aspect-[4/5] bg-ink">
                  {f.sample && (
                    <video
                      src={`${STUDIO}${f.sample}#t=4`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold leading-tight">{f.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {f.multi ? "+2 latest recalls" : "this recall"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {current && <p className="text-xs text-muted-foreground">{current.tagline}</p>}
          <Button onClick={generate} disabled={!!job} className="stamp w-full">
            <Clapperboard className="mr-2 h-4 w-4" />
            {job ? "Generating video…" : `Generate ${current?.name ?? ""} video`}
          </Button>
          {job && (
            <div className="space-y-1">
              <Progress value={Math.min(95, (elapsed / (EXPECTED_SECONDS[format] ?? 200)) * 100)} />
              <p className="font-mono text-xs text-muted-foreground">
                {job.log.at(-1)?.m ?? "Starting…"} · {Math.round(elapsed)}s
              </p>
            </div>
          )}
        </>
      )}

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{current?.name} video</DialogTitle>
          </DialogHeader>
          {result && (
            <video
              src={result}
              controls
              autoPlay
              playsInline
              className="mx-auto max-h-[65vh] rounded border-2 border-ink"
            />
          )}
          <Button onClick={download} className="stamp">
            <Download className="mr-2 h-4 w-4" />
            Download MP4
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
