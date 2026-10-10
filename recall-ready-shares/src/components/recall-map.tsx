import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LibreMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { Crosshair, Minus, Plus, MapPin, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { US_STATES } from "@/lib/recall-parse";
import { stateRecallCounts, type GeographicRecall } from "@/lib/recall-geography";
import boundaries from "@/data/us-states.json";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

type Props = { recalls: GeographicRecall[]; state: string; onStateChange: (state: string) => void; loading: boolean };
const countryBounds: [[number, number], [number, number]] = [[-126, 24], [-66, 50]];
const codes = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name, code]));

export function RecallMap({ recalls, state, onStateChange, loading }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const selectState = useRef(onStateChange);
  selectState.current = onStateChange;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const counts = useMemo(() => stateRecallCounts(recalls), [recalls]);
  const topStates = Object.entries(counts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const nationwide = recalls.filter((recall) => recall.nationwide).length;
  const unknown = recalls.filter((recall) => !recall.nationwide && !recall.states.some((code) => code in US_STATES)).length;
  const data = useMemo(() => ({ ...boundaries, features: boundaries.features.map((feature) => ({
    ...feature, properties: { ...feature.properties, code: codes[feature.properties.name] ?? "", count: counts[codes[feature.properties.name] ?? ""] ?? 0 },
  })) }) as FeatureCollection<Geometry>, [counts]);
  const currentData = useRef(data);
  currentData.current = data;

  useEffect(() => {
    let cancelled = false;
    let instance: LibreMap | null = null;
    let observer: ResizeObserver | undefined;
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl(mapWorkerUrl);
      const css = getComputedStyle(container.current);
      const token = (name: string) => css.getPropertyValue(name).trim();
      instance = new maplibre.Map({
        container: container.current,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: "https://tiles.openfreemap.org/styles/positron",
        bounds: countryBounds, fitBoundsOptions: { padding: 25 }, maxZoom: 9, minZoom: 1.5,
        attributionControl: { compact: true },
      });
      map.current = instance;
      observer = new ResizeObserver(() => {
        instance?.resize();
        instance?.fitBounds(countryBounds, { padding: 25, duration: 0 });
      });
      observer.observe(container.current);
      instance.on("style.load", () => {
        if (cancelled || !instance) return;
        instance.addSource("states", { type: "geojson", data: currentData.current });
        instance.addLayer({ id: "state-fill", type: "fill", source: "states", paint: {
          "fill-color": ["step", ["get", "count"], token("--map-empty"), 1, token("--map-low"), 10, token("--map-medium"), 30, token("--map-high")],
          "fill-opacity": 0.5,
        } });
        instance.addLayer({ id: "state-outline", type: "line", source: "states", paint: { "line-color": token("--map-line"), "line-width": 0.8, "line-opacity": 0.6 } });
        instance.addLayer({ id: "state-selected", type: "line", source: "states", filter: ["==", "code", ""], paint: { "line-color": token("--map-text"), "line-width": 2.5 } });
        instance.on("click", "state-fill", (event: MapLayerMouseEvent) => {
          const code = event.features?.[0]?.properties?.["code"];
          if (typeof code === "string" && code in US_STATES) selectState.current(code);
        });
        instance.on("mousemove", "state-fill", (event: MapLayerMouseEvent) => {
          const code = event.features?.[0]?.properties?.["code"];
          setHovered(typeof code === "string" ? code : null);
          if (instance) instance.getCanvas().style.cursor = "pointer";
        });
        instance.on("mouseleave", "state-fill", () => { setHovered(null); if (instance) instance.getCanvas().style.cursor = ""; });
        setReady(true);
      });
      instance.on("error", (event) => { if (!cancelled && event.error.message.includes("WebGL")) setError(true); });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; observer?.disconnect(); instance?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("states") as GeoJSONSource | undefined)?.setData(data);
    map.current.setFilter("state-selected", ["==", "code", state]);
  }, [data, state, ready]);

  function resetView() {
    onStateChange("ALL");
    map.current?.fitBounds(countryBounds, { padding: 25, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
  }

  return (
    <section className="recall-map mt-7 overflow-hidden rounded-lg" aria-label="FDA recall activity map">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-map-line/20 px-5 py-4">
        <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-map-low" /><h2 className="font-sans text-base font-bold">Recall activity</h2><span className="font-mono text-[10px] text-map-muted">UNITED STATES</span></div>
        <span className="flex items-center gap-2 font-mono text-xs text-map-muted"><span className="h-2 w-2 rounded-full bg-map-low" />FDA ENFORCEMENT</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="relative min-w-0">
          <div ref={container} className="h-[360px] w-full sm:h-[460px]" aria-label="Interactive map of US states" />
          {(!ready || loading || error) && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-map-surface/80 font-mono text-sm">{error ? "Map unavailable · state filters remain available" : loading ? "Loading recall activity…" : "Loading map…"}</div>}
          <div className="absolute left-4 top-4 max-w-[calc(100%-85px)] rounded-md border border-map-line/20 bg-map-surface/95 px-4 py-3">
            <p className="font-mono text-[10px] uppercase text-map-muted">{hovered ? "Affected state" : state !== "ALL" ? "Selected state" : "Recall coverage"}</p>
            <p className="mt-1 text-sm font-bold">{US_STATES[hovered ?? state] ?? "Across the United States"}</p>
            <p className="mt-1 text-xs text-map-muted">{hovered || state !== "ALL" ? `${counts[hovered ?? state] ?? 0} recalls · including nationwide` : `${recalls.length} recalls · ${nationwide} nationwide`}</p>
          </div>
          <div className="absolute right-4 top-4 flex flex-col gap-1">
            <Button className="map-control" size="icon" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => map.current?.zoomIn()}><Plus /></Button>
            <Button className="map-control" size="icon" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => map.current?.zoomOut()}><Minus /></Button>
            <Button className="map-control" size="icon" variant="ghost" aria-label="Reset map to all states" title="All states" onClick={resetView}><Crosshair /></Button>
          </div>
          <div className="absolute bottom-16 left-4 flex flex-wrap items-center gap-3 rounded-md bg-map-surface/95 px-3 py-2 font-mono text-[10px] text-map-muted sm:bottom-9">
            <span>RECALLS</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-map-empty" />0</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-map-low" />1–9</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-map-medium" />10–29</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-map-high" />30+</span>
          </div>
        </div>
        <aside className="border-t border-map-line/20 px-5 py-5 lg:border-l lg:border-t-0">
          <p className="font-mono text-[10px] text-map-muted">IN THIS DATE RANGE</p>
          <p className="mt-2 font-display text-4xl">{recalls.length}<span className="ml-2 font-sans text-sm font-normal text-map-muted">recalls</span></p>
          <div className="mt-5 flex gap-7 border-y border-map-line/20 py-4">
            <div><p className="text-xl font-bold">{Object.values(counts).filter((count) => count > 0).length}</p><p className="text-xs text-map-muted">states / territories</p></div>
            <div><p className="text-xl font-bold">{nationwide}</p><p className="text-xs text-map-muted">nationwide</p></div>
          </div>
          <p className="mb-2 mt-5 font-mono text-[10px] text-map-muted">MOST AFFECTED</p>
          {topStates.length === 0 ? <p className="py-3 text-sm text-map-muted">No recall activity.</p> : topStates.map(([code, count]) => <Button key={code} variant="ghost" className={`map-state w-full justify-between px-0 ${state === code ? "text-map-low" : ""}`} onClick={() => onStateChange(code)}><span className="truncate">{US_STATES[code]}</span><span className="flex items-center gap-2 font-mono text-xs">{count}<ArrowUpRight className="h-3 w-3" /></span></Button>)}
          {unknown > 0 && <p className="mt-3 text-xs text-map-muted">{unknown} recalls with states not listed</p>}
          {state !== "ALL" && <Button variant="ghost" className="map-state mt-3 w-full text-map-low" onClick={resetView}>All states</Button>}
        </aside>
      </div>
    </section>
  );
}