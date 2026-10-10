import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { downloadBlob } from "@/lib/card-render";

// AI short videos are rendered by the Recall Radar video service (Krea TTS + lip-synced presenter + ffmpeg),
// a separate local service in this repo: `npm run video` (http://localhost:4300).
const STUDIO =
  (import.meta.env["VITE_VIDEO_STUDIO_URL"] as string | undefined) ?? "http://localhost:4300";

type VideoFormat = {
  id: string;
  name: string;
  tagline: string;
  multi: boolean;
  sample: string | null;
  own: boolean;
};
type Job = {
  status: "running" | "done" | "error";
  log: { t: string; m: string }[];
  video?: string;
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
  const [result, setResult] = useState<{ format: string; url: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch(`${STUDIO}/api/formats?recall=${encodeURIComponent(recallNumber ?? "")}`)
      .then((r) => r.json())
      .then(setFormats)
      .catch(() => setOffline(true));
    return () => window.clearTimeout(timer.current);
  }, [recallNumber]);

  const current = formats?.find((x) => x.id === format);

  async function generate() {
    if (!current || !recallNumber) return;
    setResult(null);
    const started = Date.now();
    try {
      const res = await fetch(`${STUDIO}/api/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          recallNumbers: [recallNumber],
          withLatest: current.multi ? 2 : 0,
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setJob({ status: "running", log: [] });
      const poll = async () => {
        const j = (await fetch(`${STUDIO}/api/jobs/${res.id}`).then((r) => r.json())) as Job;
        setJob(j);
        setElapsed((Date.now() - started) / 1000);
        if (j.status === "running") {
          timer.current = window.setTimeout(poll, 1500);
          return;
        }
        if (j.status === "done" && j.video) setResult({ format, url: `${STUDIO}${j.video}` });
        else toast.error(j.log.at(-1)?.m ?? "Video failed");
        setJob(null);
      };
      poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach the video service");
      setJob(null);
    }
  }

  async function download() {
    if (!result) return;
    const blob = await fetch(result.url).then((r) => r.blob());
    downloadBlob(blob, `${slug}-${result.format}.mp4`);
  }

  if (offline) {
    return (
      <Empty>
        Video service offline — run <code className="font-mono">npm run video</code> in the repo
        root.
      </Empty>
    );
  }
  if (!recallNumber)
    return (
      <Empty>
        AI video reads the FDA enforcement record — this recall has no FDA recall number.
      </Empty>
    );
  if (!formats) return <Empty>Loading formats…</Empty>;

  // The phone preview shows the finished video, else the selected format's sample.
  const preview =
    result?.format === format ? result.url : current?.sample ? `${STUDIO}${current.sample}` : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              className={`overflow-hidden rounded-lg border-2 bg-card text-left transition-shadow ${format === f.id ? "border-primary shadow-stamp" : "border-ink hover:shadow-stamp"}`}
            >
              <div className="relative aspect-[9/16] bg-ink">
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
                <span className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-paper">
                  {f.multi ? "THIS + 2 LATEST" : "THIS RECALL"}
                </span>
              </div>
              <div className="p-3">
                <p className="font-semibold leading-tight">{f.name}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{f.tagline}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Hover a format to play its sample. Voice, presenter and visuals are generated by Krea from
          the FDA record; every video is labeled AI-generated.
        </p>
      </div>

      <aside className="space-y-4">
        <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-ink bg-ink">
          <div className="relative aspect-[9/16]">
            {preview ? (
              <video
                key={preview}
                src={preview}
                controls={!!result}
                autoPlay
                muted={!result}
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs text-paper/60">
                Preview
              </div>
            )}
            {!result && preview && (
              <span className="absolute bottom-2 left-2 rounded bg-ink/80 px-2 py-0.5 font-mono text-[10px] text-paper">
                {current?.own ? "ALREADY MADE FOR THIS RECALL" : "SAMPLE · OTHER RECALL"}
              </span>
            )}
          </div>
        </div>
        <Button onClick={generate} disabled={!!job} className="stamp w-full">
          <Clapperboard className="mr-2 h-4 w-4" />
          {job ? "Generating…" : `Generate ${current?.name ?? ""} video`}
        </Button>
        {job && (
          <div className="space-y-1">
            <Progress value={Math.min(95, (elapsed / (EXPECTED_SECONDS[format] ?? 200)) * 100)} />
            <p className="font-mono text-xs text-muted-foreground">
              {job.log.at(-1)?.m ?? "Starting…"} · {Math.round(elapsed)}s
            </p>
          </div>
        )}
        {result?.format === format && (
          <Button variant="outline" onClick={download} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Download MP4
          </Button>
        )}
        {!job && !result && (
          <p className="text-xs text-muted-foreground">
            Presenter formats take about 3–4 minutes (lip-synced AI presenter); Mascot Explainer
            about 2.
          </p>
        )}
      </aside>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-ink/40 p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
