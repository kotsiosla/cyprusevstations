export type OpenChargeMapDetails = {
  usageType?: string;
  isMembershipRequired?: boolean;
  usageCost?: string;
  accessComments?: string;
  openingTimes?: string;
  dataProvider?: string;
  dataProviderUrl?: string;
  ocmUrl?: string;
};

export type OpenChargeMapUsageCostRates = {
  /** Best effort "AC" cost (e.g. €/kWh). */
  ac?: number;
  /** Best effort "DC" cost (e.g. €/kWh). */
  dc?: number;
  /** Minimum cost found in the string (fallback). */
  min?: number;
  /** True when cost is explicitly free/zero. */
  isFree?: boolean;
};

export type OpenChargeMapPoi = {
  id: number;
  name: string;
  coordinates: [number, number]; // [lon, lat]
  address?: string;
  city?: string;
  connections?: Array<{
    connectionType?: string;
    powerKw?: number;
    quantity?: number;
  }>;
  details?: OpenChargeMapDetails;
};

type EnvLike = Partial<Record<string, string>>;
const VITE_ENV: EnvLike = (import.meta as ImportMeta & { env?: EnvLike }).env ?? {};
const OPENCHARGEMAP_API_KEY = VITE_ENV.VITE_OPENCHARGEMAP_API_KEY as string | undefined;
const OPENCHARGEMAP_PROXY_URL = VITE_ENV.VITE_OPENCHARGEMAP_PROXY_URL as string | undefined;

const OCM_BASE_URL = "https://api.openchargemap.io/v3/poi/";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url: string, retries = 1) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json,text/plain" } });
      if (!res.ok) {
        // OCM sometimes returns plain-text errors with 403.
        lastError = await res.text().catch(() => null);
        if (attempt < retries) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        return null;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  if (lastError) console.warn("OpenChargeMap fetch failed:", lastError);
  return null;
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null;

function formatOpeningTimes(openingTimes: unknown): string | undefined {
  if (!isRecord(openingTimes)) return undefined;
  if (openingTimes.Is24Hour === true || openingTimes.IsOpen247 === true) return "24/7";
  if (typeof openingTimes.OpeningTimesSummary === "string" && openingTimes.OpeningTimesSummary.trim()) {
    return openingTimes.OpeningTimesSummary.trim();
  }
  // Fallback: show that a schedule exists.
  if (Array.isArray(openingTimes.RegularOpenings) && openingTimes.RegularOpenings.length) {
    return "Scheduled (see OpenChargeMap)";
  }
  return undefined;
}

export function parseOpenChargeMapDetails(poi: unknown): OpenChargeMapDetails {
  const record = isRecord(poi) ? poi : ({} as UnknownRecord);
  const usageType = isRecord(record.UsageType) ? record.UsageType : undefined;
  const addressInfo = isRecord(record.AddressInfo) ? record.AddressInfo : undefined;
  const dataProviderObj = isRecord(record.DataProvider) ? record.DataProvider : undefined;

  const usageTypeTitle = usageType?.Title;
  const isMembershipRequired =
    typeof usageType?.IsMembershipRequired === "boolean" ? usageType.IsMembershipRequired : undefined;
  const usageCost = typeof record.UsageCost === "string" ? record.UsageCost : undefined;
  const accessComments = typeof record.GeneralComments === "string" ? record.GeneralComments : undefined;
  const openingTimes = formatOpeningTimes(record.OpeningTimes);
  const dataProvider = dataProviderObj?.Title;
  const dataProviderUrl = dataProviderObj?.WebsiteURL;
  const ocmUrl = addressInfo?.RelatedURL || addressInfo?.ContactEmail || undefined;

  return {
    usageType: typeof usageTypeTitle === "string" ? usageTypeTitle : undefined,
    isMembershipRequired,
    usageCost,
    accessComments,
    openingTimes,
    dataProvider: typeof dataProvider === "string" ? dataProvider : undefined,
    dataProviderUrl: typeof dataProviderUrl === "string" ? dataProviderUrl : undefined,
    // Best-effort: OCM doesn't always provide a canonical POI URL; we can link to OCM search instead.
    ocmUrl: typeof ocmUrl === "string" ? ocmUrl : undefined
  };
}

function cacheKeyForCoords(lat: number, lon: number) {
  // Rounded to avoid exploding cache size.
  const round = (n: number) => Number(n.toFixed(4));
  return `ocm_poi_${round(lat)}_${round(lon)}`;
}

export async function fetchOpenChargeMapDetailsByCoords(
  lat: number,
  lon: number
): Promise<OpenChargeMapDetails | null> {
  const cacheKey = cacheKeyForCoords(lat, lon);
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      try {
        return JSON.parse(raw) as OpenChargeMapDetails;
      } catch {
        // ignore
      }
    }
  }

  const params = new URLSearchParams({
    output: "json",
    latitude: String(lat),
    longitude: String(lon),
    distance: "0.8",
    distanceunit: "KM",
    maxresults: "3"
  });

  if (OPENCHARGEMAP_PROXY_URL) {
    // Proxy should accept the same query params, but without exposing an API key in the client.
    const url = `${OPENCHARGEMAP_PROXY_URL.replace(/\/$/, "")}?${params.toString()}`;
    const res = await fetchWithRetries(url, 1);
    if (!res) return null;
    const data = await res.json().catch(() => null);
    const poi = Array.isArray(data) ? data[0] : null;
     const details = poi ? parseOpenChargeMapDetails(poi) : null;
    if (details && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(details));
      } catch {
        // ignore
      }
    }
    return details;
  }

  if (!OPENCHARGEMAP_API_KEY) return null;
  params.set("key", OPENCHARGEMAP_API_KEY);

  const url = `${OCM_BASE_URL}?${params.toString()}`;
  const res = await fetchWithRetries(url, 1);
  if (!res) return null;
  const data = await res.json().catch(() => null);
  const poi = Array.isArray(data) ? data[0] : null;
  const details = poi ? parseOpenChargeMapDetails(poi) : null;

  if (details && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(details));
    } catch {
      // ignore
    }
  }
  return details;
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readApiConfig() {
  if (OPENCHARGEMAP_PROXY_URL) {
    return { proxyUrl: OPENCHARGEMAP_PROXY_URL, apiKey: undefined as string | undefined };
  }
  return { proxyUrl: undefined as string | undefined, apiKey: OPENCHARGEMAP_API_KEY };
}

export async function fetchOpenChargeMapPoisByCountry(countryCode: string): Promise<OpenChargeMapPoi[]> {
  const { proxyUrl, apiKey } = readApiConfig();
  if (!proxyUrl && !apiKey) return [];

  const upper = countryCode.trim().toUpperCase();
  if (!upper) return [];

  const cacheKey = `ocm_country_${upper}_v1`;
  const cacheTtlMs = 24 * 60 * 60 * 1000; // 24h

  const readCache = () => {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { fetchedAt: number; items: OpenChargeMapPoi[] };
      if (!parsed?.fetchedAt || !Array.isArray(parsed.items)) return null;
      if (Date.now() - parsed.fetchedAt > cacheTtlMs) return null;
      return parsed.items;
    } catch {
      return null;
    }
  };

  const writeCache = (items: OpenChargeMapPoi[]) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), items }));
    } catch {
      // ignore quota / privacy errors
    }
  };

  const cached = readCache();
  if (cached?.length) return cached;

  const params = new URLSearchParams({
    output: "json",
    countrycode: upper,
    maxresults: "5000",
    // We want friendly connector names without a second lookup.
    compact: "false",
    verbose: "true"
  });

  let url: string;
  if (proxyUrl) {
    url = `${proxyUrl.replace(/\/$/, "")}?${params.toString()}`;
  } else {
    params.set("key", apiKey!);
    url = `${OCM_BASE_URL}?${params.toString()}`;
  }

  const res = await fetchWithRetries(url, 1);
  if (!res) return [];
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return [];

  const items = data
    .map((poi: unknown): OpenChargeMapPoi | null => {
      const p = isRecord(poi) ? poi : ({} as UnknownRecord);
      const addressInfo = isRecord(p.AddressInfo) ? p.AddressInfo : undefined;
      const id = toNumber(p.ID);
      const name =
        toNonEmptyString(addressInfo?.Title) ?? toNonEmptyString(addressInfo?.AddressLine1);
      const lat = toNumber(addressInfo?.Latitude);
      const lon = toNumber(addressInfo?.Longitude);
      if (!id || !name || lat === undefined || lon === undefined) return null;

      const addressLine = toNonEmptyString(addressInfo?.AddressLine1);
      const town = toNonEmptyString(addressInfo?.Town);
      const address = [addressLine, town].filter(Boolean).join(", ") || undefined;

      const connectionsRaw: unknown[] = Array.isArray(p.Connections) ? (p.Connections as unknown[]) : [];
      const connections =
        connectionsRaw.length > 0
          ? connectionsRaw
              .map((c: unknown) => {
                const conn = isRecord(c) ? c : ({} as UnknownRecord);
                const connectionTypeObj = isRecord(conn.ConnectionType) ? conn.ConnectionType : undefined;
                const connectionType =
                  toNonEmptyString(connectionTypeObj?.Title) ?? toNonEmptyString(connectionTypeObj?.FormalName);
                const powerKw = toNumber(conn.PowerKW);
                const quantity = toNumber(conn.Quantity);
                return {
                  connectionType,
                  powerKw,
                  quantity
                };
              })
              .filter((c) => c.connectionType || typeof c.powerKw === "number")
          : undefined;

      const details = parseOpenChargeMapDetails(poi);

      return {
        id,
        name,
        coordinates: [lon, lat],
        address,
        city: town,
        connections,
        details
      };
    })
    .filter((item): item is OpenChargeMapPoi => Boolean(item));

  if (items.length) writeCache(items);
  return items;
}

function parseNumberToken(raw: string): number | null {
  const normalized = raw
    .trim()
    // convert "0,5" -> "0.5"
    .replace(/(\d),(\d)/g, "$1.$2")
    // remove stray currency/unit characters
    .replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Extract best-effort AC/DC/min numeric prices from an OpenChargeMap `UsageCost` string.
 *
 * Examples:
 * - "AC-0.51, DC-0.64"
 * - "Cost: 0,5 €/kWh"
 * - "Free"
 */
export function parseOpenChargeMapUsageCost(usageCost?: string): OpenChargeMapUsageCostRates {
  if (!usageCost || typeof usageCost !== "string") return {};
  const raw = usageCost.trim();
  if (!raw) return {};

  const lower = raw.toLowerCase();
  if (lower.includes("free") || lower.includes("gratis") || lower.includes("no cost")) {
    return { isFree: true, min: 0, ac: 0, dc: 0 };
  }

  // Prefer explicit AC/DC mentions.
  const pickTagged = (tag: "ac" | "dc") => {
    const re = new RegExp(`${tag}\\s*[:\\-]?\\s*([0-9]+(?:[.,][0-9]+)?)`, "i");
    const m = raw.match(re);
    return m?.[1] ? parseNumberToken(m[1]) : null;
  };

  const ac = pickTagged("ac") ?? undefined;
  const dc = pickTagged("dc") ?? undefined;

  // Fallback: take all numeric tokens and pick the minimum.
  const tokens = raw.match(/[0-9]+(?:[.,][0-9]+)?/g) ?? [];
  const values = tokens
    .map((t) => parseNumberToken(t))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const min = values.length ? Math.min(...values) : undefined;

  return { ac, dc, min };
}

