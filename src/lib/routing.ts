import type { LonLat } from "@/lib/routePlanner";

export type RoutedPath = {
  polyline: LonLat[];
  distanceKm: number;
  durationMin: number;
  provider: "osrm";
};

type CachedRoute = RoutedPath & { fetchedAt: number };

function roundCoord(n: number) {
  return Number(n.toFixed(4));
}

function cacheKeyForPolyline(polyline: LonLat[]) {
  const key = polyline
    .map(([lon, lat]) => `${roundCoord(lon)},${roundCoord(lat)}`)
    .join(";");
  return `route_osrm_v1_${key}`;
}

function readCache(cacheKey: string, ttlMs: number): RoutedPath | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(cacheKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedRoute;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.polyline)) return null;
    if (Date.now() - parsed.fetchedAt > ttlMs) return null;
    return {
      polyline: parsed.polyline,
      distanceKm: parsed.distanceKm,
      durationMin: parsed.durationMin,
      provider: "osrm"
    };
  } catch {
    return null;
  }
}

function writeCache(cacheKey: string, value: RoutedPath) {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: CachedRoute = { ...value, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number; // meters
    duration?: number; // seconds
    geometry?: { coordinates?: unknown };
  }>;
};

function asLonLatPolyline(value: unknown): LonLat[] | null {
  if (!Array.isArray(value)) return null;
  const coords: LonLat[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const lon = Number(item[0]);
    const lat = Number(item[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    coords.push([lon, lat]);
  }
  return coords.length >= 2 ? coords : null;
}

/**
 * Fetch a routed path from OSRM (public demo server) using the given waypoints polyline.
 * Falls back to null on failure (callers should use approximate routing).
 */
export async function fetchOsrmRoute(waypoints: LonLat[]): Promise<RoutedPath | null> {
  if (waypoints.length < 2) return null;

  const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7d
  const cacheKey = cacheKeyForPolyline(waypoints);
  const cached = readCache(cacheKey, ttlMs);
  if (cached) return cached;

  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmRouteResponse;
    const route = data?.routes?.[0];
    const polyline = asLonLatPolyline(route?.geometry?.coordinates);
    const distanceKm = typeof route?.distance === "number" ? route.distance / 1000 : null;
    const durationMin = typeof route?.duration === "number" ? route.duration / 60 : null;
    if (!polyline || !distanceKm || !durationMin) return null;

    const value: RoutedPath = {
      provider: "osrm",
      polyline,
      distanceKm,
      durationMin
    };
    writeCache(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

