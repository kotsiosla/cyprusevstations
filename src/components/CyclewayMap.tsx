import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

// Cyprus area id (OSM relation 307787 -> area 3600307787)
function cyprusBikeOverpassQuery() {
  return `
[out:json][timeout:90];
area(3600307787)->.cy;
(
  way["highway"="cycleway"](area.cy);
  way["cycleway"](area.cy);
  way["cycleway:left"](area.cy);
  way["cycleway:right"](area.cy);
  way["cycleway:both"](area.cy);
  way["bicycle"="designated"](area.cy);
);
out geom;`;
}

function overpassToGeoJSON(osm: any) {
  const elements = osm?.elements ?? [];
  const features: any[] = [];

  for (const el of elements) {
    if (el.type !== "way") continue;
    const geom = el.geometry;
    if (!Array.isArray(geom) || geom.length < 2) continue;

    const coords = geom.map((p: any) => [p.lon, p.lat]);

    features.push({
      type: "Feature",
      properties: {
        id: `way/${el.id}`,
        name: el.tags?.name,
        highway: el.tags?.highway,
        cycleway: el.tags?.cycleway,
        cycleway_left: el.tags?.["cycleway:left"],
        cycleway_right: el.tags?.["cycleway:right"],
        bicycle: el.tags?.bicycle,
        surface: el.tags?.surface,
        lit: el.tags?.lit
      },
      geometry: { type: "LineString", coordinates: coords }
    });
  }

  return { type: "FeatureCollection", features };
}

async function fetchWithFailover(body: string) {
  let lastErr: any = null;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Overpass failed");
}

export default function CyclewayMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors"
          }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
      },
      center: [33.3823, 35.1856],
      zoom: 9
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const cached = localStorage.getItem("cy_cycleways_geojson_v1");

    map.on("load", async () => {
      // Add empty source first
      map.addSource("cycleways", {
        type: "geojson",
        data: cached ? JSON.parse(cached) : { type: "FeatureCollection", features: [] }
      });

      // Base network layer
      map.addLayer({
        id: "cycleways-line",
        type: "line",
        source: "cycleways",
        paint: {
          "line-width": 4,
          "line-opacity": 0.9,
          "line-color": "#22c55e"
        }
      });

      // Try to sync from Overpass (if no cache or user wants fresh)
      try {
        if (!cached) {
          const osm = await fetchWithFailover(cyprusBikeOverpassQuery());
          const geo = overpassToGeoJSON(osm);
          localStorage.setItem("cy_cycleways_geojson_v1", JSON.stringify(geo));
          (map.getSource("cycleways") as any).setData(geo);
        }
      } catch (e) {
        // Keep cached or empty; no crash
        console.warn("Cycleways sync failed:", e);
      }
    });

    return () => map.remove();
  }, []);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
