import type { LonLat } from "@/lib/routePlanner";

export type GeocodedPlace = {
  id: string;
  label: string;
  coordinates: LonLat;
  source: "nominatim";
};

type CachedSearch = { fetchedAt: number; items: GeocodedPlace[] };

function cacheKey(query: string) {
  return `geo_cy_v1_${query.trim().toLowerCase()}`;
}

function readCache(key: string, ttlMs: number): GeocodedPlace[] | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedSearch;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.fetchedAt > ttlMs) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(key: string, items: GeocodedPlace[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: CachedSearch = { fetchedAt: Date.now(), items };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

type NominatimSearchItem = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
};

function toPlace(item: NominatimSearchItem): GeocodedPlace | null {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label = (item.display_name ?? "").trim();
  if (!label) return null;
  const id = item.place_id ? String(item.place_id) : `${lon},${lat}`;
  return { id, label, coordinates: [lon, lat], source: "nominatim" };
}

/**
 * Cyprus-only geocoding using Nominatim.
 * Note: Nominatim has strict rate limits; UI should debounce and query >= 3 chars.
 */
export async function searchCyprusPlaces(query: string, limit = 7): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const ttlMs = 24 * 60 * 60 * 1000; // 24h (session cache)
  const key = cacheKey(q);
  const cached = readCache(key, ttlMs);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    countrycodes: "cy",
    addressdetails: "0",
    limit: String(Math.max(1, Math.min(10, limit)))
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "el,en"
      }
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const items = (data as NominatimSearchItem[]).map(toPlace).filter((p): p is GeocodedPlace => Boolean(p));
    writeCache(key, items);
    return items;
  } catch {
    return [];
  }
}

