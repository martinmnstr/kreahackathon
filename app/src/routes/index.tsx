import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchWalmartRecalls, generateKreaImage } from "@/lib/external.functions";
import { normalizeRecalls, recallsForStore, type Recall, type Store } from "@/lib/recalls";

const StoreMap = lazy(() => import("@/components/StoreMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Walmart Recall Map — Food recalls by store" },
      { name: "description", content: "Interactive map of US Walmart stores with food recalls from the last 30 days." },
      { property: "og:title", content: "Walmart Recall Map" },
      { property: "og:description", content: "See every Walmart store and recent food recalls on one interactive map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const KEYS = { cala: "wm.calaKey", krea: "wm.kreaKey" };

function Index() {
  const [mounted, setMounted] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [selected, setSelected] = useState<Store | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calaKey, setCalaKey] = useState("");
  const [kreaKey, setKreaKey] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCalaKey(localStorage.getItem(KEYS.cala) ?? "");
    setKreaKey(localStorage.getItem(KEYS.krea) ?? "");
    fetch("/data/walmart-stores.json")
      .then((r) => r.json())
      .then((rows: [number, number, string, string, string, string, string, string][]) =>
        setStores(rows.map(([lat, lng, ref, name, street, city, state, zip]) => ({ lat, lng, ref, name, street, city, state, zip }))),
      );
  }, []);

  const loadRecalls = async (key = calaKey) => {
    if (!key) { setSettingsOpen(true); return; }
    setLoading(true); setStatus("Fetching recalls from Cala…");
    try {
      const { results } = await fetchWalmartRecalls({ data: { apiKey: key } });
      const n = normalizeRecalls(results);
      setRecalls(n);
      setStatus(n.length ? `${n.length} recalls in the last 30 days` : "No recalls returned by Cala");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load recalls");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (mounted && calaKey) loadRecalls(calaKey); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mounted]);

  const saveKeys = () => {
    localStorage.setItem(KEYS.cala, calaKey.trim());
    localStorage.setItem(KEYS.krea, kreaKey.trim());
    setSettingsOpen(false);
    loadRecalls(calaKey.trim());
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Walmart Recall Map</h1>
          <p className="text-xs text-muted-foreground">
            {stores.length.toLocaleString()} stores · {loading ? "loading…" : status || "Add your Cala key to see recalls"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadRecalls()} disabled={loading} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">Refresh recalls</button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Settings</button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <main className="flex-1">
          {mounted && (
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading map…</div>}>
              <StoreMap stores={stores} recalls={recalls} onSelect={setSelected} />
            </Suspense>
          )}
        </main>
        {selected && (
          <StorePanel store={selected} recalls={recallsForStore(recalls, selected.state)} kreaKey={kreaKey}
            onClose={() => setSelected(null)} onNeedKey={() => setSettingsOpen(true)} />
        )}
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">Keys are saved only in this browser.</p>
            <label className="mt-4 block text-sm font-medium">Cala API key</label>
            <input type="password" value={calaKey} onChange={(e) => setCalaKey(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="From console.cala.ai" />
            <label className="mt-4 block text-sm font-medium">Krea API key</label>
            <input type="password" value={kreaKey} onChange={(e) => setKreaKey(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="From krea.ai/settings/api-tokens" />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setSettingsOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">Cancel</button>
              <button onClick={saveKeys} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StorePanel({ store, recalls, kreaKey, onClose, onNeedKey }: {
  store: Store; recalls: Recall[]; kreaKey: string; onClose: () => void; onNeedKey: () => void;
}) {
  const [images, setImages] = useState<Record<string, { url?: string; error?: string; loading?: boolean }>>({});

  const generate = async (r: Recall) => {
    if (!kreaKey) return onNeedKey();
    setImages((s) => ({ ...s, [r.product]: { loading: true } }));
    try {
      const { url } = await generateKreaImage({
        data: { apiKey: kreaKey, prompt: `Studio product photo of ${r.product.slice(0, 200)}, grocery packaging on a supermarket shelf, clean lighting` },
      });
      setImages((s) => ({ ...s, [r.product]: url ? { url } : { error: "No image returned" } }));
    } catch (e) {
      setImages((s) => ({ ...s, [r.product]: { error: e instanceof Error ? e.message : "Failed" } }));
    }
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-[500] w-full max-w-sm overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{store.name} #{store.ref}</h2>
          <p className="text-sm text-muted-foreground">{store.street}, {store.city}, {store.state} {store.zip}</p>
        </div>
        <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground" aria-label="Close">×</button>
      </div>
      <h3 className="mt-5 text-sm font-semibold">Recalled items (last 30 days)</h3>
      {recalls.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No recalls for this store.</p>}
      <ul className="mt-3 space-y-4">
        {recalls.map((r, i) => {
          const img = images[r.product];
          return (
            <li key={i} className="rounded-md border border-border p-3">
              <p className="font-medium">{r.product}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>
              {img?.url && <img src={img.url} alt={r.product} className="mt-3 w-full rounded-md" />}
              {img?.error && <p className="mt-2 text-xs text-destructive">{img.error}</p>}
              {!img?.url && (
                <button onClick={() => generate(r)} disabled={img?.loading} className="mt-3 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50">
                  {img?.loading ? "Creating image…" : "Create product image"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
