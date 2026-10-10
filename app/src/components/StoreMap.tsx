import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { recallsForStore, type Recall, type Store } from "@/lib/recalls";

const LABEL_ZOOM = 11;

const icon = (hasRecall: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="wm-pin ${hasRecall ? "wm-pin--alert" : ""}">★</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export default function StoreMap({
  stores, recalls, onSelect,
}: { stores: Store[]; recalls: Recall[]; onSelect: (s: Store) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { minZoom: 3 }).setView([39.5, -98.35], 4);
    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors · Stores: All The Places',
      maxZoom: 19,
    }).addTo(map);
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Imagery &copy; Esri · Stores: All The Places", maxZoom: 19 },
    );
    L.control.layers({ Streets: streets, Satellite: satellite }, undefined, { position: "topright" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    clusterRef.current?.remove();
    const cluster = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false });
    const markers = stores.map((s) => {
      const items = recallsForStore(recalls, s.state);
      const m = L.marker([s.lat, s.lng], { icon: icon(items.length > 0) });
      m.on("click", () => selectRef.current(s));
      (m as L.Marker & { _items?: Recall[]; _store?: Store })._items = items;
      (m as L.Marker & { _store?: Store })._store = s;
      return m;
    });
    cluster.addLayers(markers);
    map.addLayer(cluster);
    clusterRef.current = cluster;

    const updateLabels = () => {
      const show = map.getZoom() >= LABEL_ZOOM;
      markers.forEach((m) => {
        const mm = m as L.Marker & { _items?: Recall[]; _store?: Store };
        if (show) {
          if (!m.getTooltip()) {
            const items = mm._items ?? [];
            const body = items.length
              ? `<ul>${items.slice(0, 4).map((r) => `<li>${esc(r.product)}</li>`).join("")}${items.length > 4 ? `<li>+${items.length - 4} more</li>` : ""}</ul>`
              : `<div class="wm-ok">No recalls reported</div>`;
            m.bindTooltip(`<strong>${esc(mm._store!.name)} #${esc(mm._store!.ref)}</strong>${body}`, {
              permanent: true, direction: "top", offset: [0, -12], className: "wm-label",
            });
          }
        } else if (m.getTooltip()) m.unbindTooltip();
      });
    };
    map.on("zoomend", updateLabels);
    updateLabels();
    return () => { map.off("zoomend", updateLabels); };
  }, [stores, recalls]);

  return <div ref={el} className="h-full w-full" />;
}
