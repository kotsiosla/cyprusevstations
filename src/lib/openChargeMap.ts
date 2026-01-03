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

const VITE_ENV = (import.meta as any)?.env ?? {};
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

function formatOpeningTimes(openingTimes: any): string | undefined {
  if (!openingTimes || typeof openingTimes !== "object") return undefined;
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

function parseDetails(poi: any): OpenChargeMapDetails {
  const usageTypeTitle = poi?.UsageType?.Title;
  const isMembershipRequired =
    typeof poi?.UsageType?.IsMembershipRequired === "boolean" ? poi.UsageType.IsMembershipRequired : undefined;
  const usageCost = typeof poi?.UsageCost === "string" ? poi.UsageCost : undefined;
  const accessComments = typeof poi?.GeneralComments === "string" ? poi.GeneralComments : undefined;
  const openingTimes = formatOpeningTimes(poi?.OpeningTimes);
  const dataProvider = poi?.DataProvider?.Title;
  const dataProviderUrl = poi?.DataProvider?.WebsiteURL;
  const ocmUrl = poi?.AddressInfo?.RelatedURL || poi?.AddressInfo?.ContactEmail || undefined;

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
    const details = poi ? parseDetails(poi) : null;
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
  const details = poi ? parseDetails(poi) : null;

  if (details && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(details));
    } catch {
      // ignore
    }
  }
  return details;
}

