const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];
const CYPRUS_STATUS_SOURCES = [
  "https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/",
  "https://traffic4cyprus.org.cy/dataset/electricvehiclecharges/resource/471c1040-cda9-47b8-9b47-2a9065aeddba/download"
];

const VITE_ENV = (import.meta as any)?.env ?? {};
const PLACETOPLUG_ENDPOINT =
  VITE_ENV.VITE_PLACETOPLUG_ENDPOINT ?? "https://placetoplug.com/api/chargepoints";
const PLACETOPLUG_API_KEY = VITE_ENV.VITE_PLACETOPLUG_API_KEY;
const PLACETOPLUG_GRAPHQL_ENDPOINT =
  VITE_ENV.VITE_PLACETOPLUG_GRAPHQL_ENDPOINT ?? "https://api.placetoplug.com/v2/graphql";

export interface ChargingStation {
  id: string;
  name: string;
  osmName?: string;
  placeToPlugName?: string;
  ocm?: {
    usageType?: string;
    isMembershipRequired?: boolean;
    usageCost?: string;
    accessComments?: string;
    openingTimes?: string;
    dataProvider?: string;
    dataProviderUrl?: string;
  };
  operator?: string;
  address?: string;
  city?: string;
  connectors?: string[];
  power?: string;
  capacity?: string;
  ports?: Array<{
    id: string;
    status?: string;
    availability?: "available" | "occupied" | "out_of_service" | "unknown";
    powerKw?: number;
    plugType?: string;
    connectorLabel?: string;
  }>;
  access?: string;
  open24_7?: boolean;
  openingHours?: string;
  availability?: "available" | "occupied" | "out_of_service" | "unknown";
  statusLabel?: string;
  distanceKm?: number;
  distanceLabel?: string;
  coordinates: [number, number];
}

function cyprusChargingOverpassQuery() {
  return `
[out:json][timeout:90];
area(3600307787)->.cy;
(
  node["amenity"="charging_station"](area.cy);
  way["amenity"="charging_station"](area.cy);
  relation["amenity"="charging_station"](area.cy);
  // Some chargers are mapped as fuel stations or POIs with electricity.
  node["fuel:electricity"="yes"](area.cy);
  way["fuel:electricity"="yes"](area.cy);
  relation["fuel:electricity"="yes"](area.cy);
  node["charging_station"="yes"](area.cy);
  way["charging_station"="yes"](area.cy);
  relation["charging_station"="yes"](area.cy);
);
out center tags;`;
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildAddress(tags: Record<string, string | undefined>) {
  const street = tags["addr:street"];
  const house = tags["addr:housenumber"];
  const city = tags["addr:city"];
  const parts = [street && house ? `${street} ${house}` : street || house, city].filter(Boolean);
  return parts.join(", ");
}

function parseConnectors(tags: Record<string, string | undefined>) {
  const connectorMap: Record<string, string> = {
    "charge:socket:type2": "Type 2",
    "charge:socket:ccs": "CCS",
    "charge:socket:chademo": "CHAdeMO",
    "charge:socket:tesla": "Tesla",
    "charge:socket:type1": "Type 1",
    "charge:socket:schuko": "Schuko"
  };

  return Object.entries(connectorMap)
    .filter(([key]) => tags[key] && tags[key] !== "no")
    .map(([, label]) => label);
}

function formatPlaceToPlugPlugType(value?: string) {
  if (!value) return undefined;
  const normalized = value.toUpperCase().trim();
  const map: Record<string, string> = {
    IEC_62196_T2: "Type 2",
    IEC_62196_T2_COMBO: "CCS",
    IEC_62196_T2_COMBO_2: "CCS",
    CCS: "CCS",
    CHADEMO: "CHAdeMO",
    IEC_62196_T1: "Type 1",
    SCHUKO: "Schuko"
  };
  return map[normalized] ?? normalized.replaceAll("_", " ");
}

function formatPowerKw(value?: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return undefined;
  return numberValue;
}

// OCPP status mapping:
// - Available -> available
// - Occupied/Charging/Reserved/Finishing/Preparing/SuspendedEVSE/SuspendedEV -> occupied
// - Faulted/Unavailable -> out_of_service
const OCPP_STATUS_MAP: Record<string, ChargingStation["availability"]> = {
  available: "available",
  occupied: "occupied",
  charging: "occupied",
  reserved: "occupied",
  finishing: "occupied",
  preparing: "occupied",
  suspendedevse: "occupied",
  suspendedev: "occupied",
  faulted: "out_of_service",
  unavailable: "out_of_service"
};

function normalizeAvailability(value?: string | number | boolean) {
  if (value === undefined || value === null || value === "") return "unknown" as const;
  if (typeof value === "boolean") {
    return value ? ("available" as const) : ("out_of_service" as const);
  }
  const normalized = String(value).toLowerCase().trim();
  const ocppAvailability = OCPP_STATUS_MAP[normalized];
  if (ocppAvailability) return ocppAvailability;
  // PlaceToPlug exposes status enums like OUTOFORDER.
  if (normalized.includes("outoforder") || normalized.includes("out_of_order")) {
    return "out_of_service" as const;
  }
  // Some feeds (e.g. Cyprus DATEX II) report operational state, not live occupancy.
  // Treat these as unknown rather than implying availability.
  if (
    normalized === "operational" ||
    normalized === "in_service" ||
    normalized === "in service" ||
    normalized === "working"
  ) {
    return "unknown" as const;
  }
  if (
    ["available", "free", "yes"].includes(normalized) ||
    normalized.includes("available") ||
    normalized.includes("free")
  ) {
    return "available" as const;
  }
  if (["1", "true"].includes(normalized)) return "available" as const;
  if (
    ["occupied", "busy", "in_use"].includes(normalized) ||
    normalized.includes("occupied") ||
    normalized.includes("busy")
  ) {
    return "occupied" as const;
  }
  if (["2", "inuse"].includes(normalized)) return "occupied" as const;
  if (
    ["out_of_service", "out-of-service", "maintenance", "closed", "no", "inactive", "fault", "unavailable"].includes(
      normalized
    ) ||
    normalized.includes("out of service") ||
    normalized.includes("out-of-service") ||
    normalized.includes("maintenance") ||
    normalized.includes("fault") ||
    normalized.includes("broken") ||
    normalized.includes("fix") ||
    normalized.includes("unavailable")
  ) {
    return "out_of_service" as const;
  }
  if (["0", "false", "offline", "down"].includes(normalized)) return "out_of_service" as const;
  return "unknown" as const;
}

function normalizePlaceToPlugLabel(value?: string) {
  if (!value) return undefined;
  const normalized = value.toUpperCase().trim();
  switch (normalized) {
    case "AVAILABLE":
      return "Available";
    case "OCCUPIED":
      return "Occupied";
    case "OUTOFORDER":
    case "OUT_OF_ORDER":
      return "Out of order";
    case "OUTOFORDERED":
      return "Out of order";
    case "PLANNED":
      return "Planned";
    case "UNKNOWN":
      return "Unknown";
    default:
      return undefined;
  }
}

function normalizePlaceToPlugOccupancy(value?: string) {
  if (!value) return "unknown" as const;
  const normalized = value.toUpperCase().trim();
  if (normalized === "AVAILABLE") return "available" as const;
  if (normalized === "OCCUPIED" || normalized === "CHARGING") return "occupied" as const;
  if (normalized === "OUTOFORDER" || normalized === "OUT_OF_ORDER") return "out_of_service" as const;
  return "unknown" as const;
}

function deriveAvailabilityFromPlaceToPlugPlugs(statuses: string[]) {
  const normalized = statuses.map(normalizePlaceToPlugOccupancy);
  if (normalized.includes("occupied")) return "occupied" as const;
  // If *everything* is out of order, treat the zone as out of service.
  if (normalized.length > 0 && normalized.every((item) => item === "out_of_service")) {
    return "out_of_service" as const;
  }
  if (normalized.includes("available")) return "available" as const;
  return "unknown" as const;
}

function buildPlaceToPlugLabelFromPlugs(statuses: string[]) {
  if (!statuses.length) return undefined;
  const normalized = statuses.map(normalizePlaceToPlugOccupancy);
  const total = normalized.length;
  const available = normalized.filter((s) => s === "available").length;
  const occupied = normalized.filter((s) => s === "occupied").length;
  const outOfService = normalized.filter((s) => s === "out_of_service").length;

  if (occupied > 0) return `${occupied}/${total} in use`;
  if (available > 0 && available === total) return `${available}/${total} available`;
  if (available > 0) return `${available}/${total} available`;
  if (outOfService > 0 && outOfService === total) return "Out of order";
  return undefined;
}

function findStatusCandidates(tags: Record<string, string | undefined>) {
  const candidates: string[] = [];
  const direct =
    tags["charging:status"] ||
    tags["charging_station:status"] ||
    tags["status:charging_station"] ||
    tags["charging_station:state"] ||
    tags["state"] ||
    tags["condition"] ||
    tags["charging_station:condition"] ||
    tags["availability"] ||
    tags["operational_status"] ||
    tags["status"];
  if (direct) candidates.push(direct);

  Object.entries(tags).forEach(([key, value]) => {
    if (!value) return;
    if (
      key.endsWith(":status") ||
      key.endsWith(":availability") ||
      key.endsWith(":state") ||
      key.endsWith(":condition")
    ) {
      candidates.push(value);
    }
  });

  return candidates.map((value) => value.trim()).filter(Boolean);
}

function deriveAvailability(tags: Record<string, string | undefined>) {
  const candidates = findStatusCandidates(tags);
  if (!candidates.length) return "unknown" as const;

  const normalized = candidates.map(normalizeAvailability);
  if (normalized.includes("out_of_service")) return "out_of_service" as const;
  if (normalized.includes("occupied")) return "occupied" as const;
  if (normalized.includes("available")) return "available" as const;
  return "unknown" as const;
}

function deriveStatusLabel(tags: Record<string, string | undefined>) {
  const candidates = findStatusCandidates(tags);
  if (!candidates.length) return undefined;
  return toTitleCase(candidates[0].replace(/[_-]+/g, " "));
}

function normalizeStatusLabel(value?: string | number | boolean) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Available" : "Out Of Service";
  return toTitleCase(String(value).replace(/[_-]+/g, " ").trim());
}

function coordinateKey(lon: number, lat: number, precision = 4) {
  return `${lon.toFixed(precision)},${lat.toFixed(precision)}`;
}

function haversineDistanceKm(from: [number, number], to: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const earthRadiusKm = 6371;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

type ExternalStatus = {
  source?: "placetoplug" | "cyprus" | "unknown";
  name?: string;
  address?: string;
  power?: string;
  statusLabel?: string;
  availability?: ChargingStation["availability"];
  connectors?: string[];
  ports?: ChargingStation["ports"];
  coordinates: [number, number];
};

function deriveStatusFromProps(props: Record<string, any>) {
  const readStatusValue = (record?: Record<string, any>) => {
    if (!record || typeof record !== "object") return undefined;
    return (
      record.status ??
      record.availability ??
      record.availability_status ??
      record.operational_status ??
      record.operationalStatus ??
      record.status_text ??
      record.statusLabel ??
      record.status_description ??
      record.status_desc ??
      record.ocpp_status ??
      record.ocppStatus ??
      record.charging_status ??
      record.connector_status ??
      record.evse_status ??
      record.evseStatus ??
      record.state ??
      record.condition ??
      record.is_available ??
      record.isAvailable ??
      record.is_operational ??
      record.isOperational ??
      record.operational ??
      record.status_code ??
      record.statusCode ??
      record.availability_code ??
      record.availabilityCode
    );
  };

  const deriveStatusFromCounts = (record?: Record<string, any>) => {
    if (!record || typeof record !== "object") return undefined;
    const availableCount = Number(
      record.available ?? record.available_count ?? record.free ?? record.free_count ?? 0
    );
    const occupiedCount = Number(
      record.occupied ?? record.occupied_count ?? record.busy ?? record.busy_count ?? 0
    );
    const outOfServiceCount = Number(
      record.out_of_service ??
        record.out_of_service_count ??
        record.out_of_order ??
        record.out_of_order_count ??
        record.maintenance ??
        record.maintenance_count ??
        record.offline ??
        record.offline_count ??
        0
    );

    if (Number.isFinite(availableCount) && availableCount > 0) return "available";
    if (Number.isFinite(occupiedCount) && occupiedCount > 0) return "occupied";
    if (Number.isFinite(outOfServiceCount) && outOfServiceCount > 0) return "out_of_service";
    return undefined;
  };

  const directValue = readStatusValue(props);

  if (directValue !== undefined && directValue !== null && directValue !== "") {
    if (typeof directValue === "object") {
      const countBased = deriveStatusFromCounts(directValue as Record<string, any>);
      if (countBased) return countBased;
      const nestedValue = readStatusValue(directValue as Record<string, any>);
      if (nestedValue !== undefined && nestedValue !== null && nestedValue !== "") {
        return nestedValue;
      }
    } else {
      return directValue;
    }
  }

  const countBased = deriveStatusFromCounts(props);
  if (countBased) return countBased;

  const connectors = props.connectors ?? props.connector ?? props.outlets ?? props.ports;
  if (Array.isArray(connectors)) {
    for (const connector of connectors) {
      if (!connector || typeof connector !== "object") continue;
      const connectorStatus = readStatusValue(connector);
      if (connectorStatus !== undefined && connectorStatus !== null && connectorStatus !== "") {
        return connectorStatus;
      }
    }
  }

  const nestedCollections = [
    props.evses,
    props.evse,
    props.charge_points,
    props.chargePoints,
    props.chargers,
    props.charging_points,
    props.chargingPoints
  ];

  for (const collection of nestedCollections) {
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      if (!entry || typeof entry !== "object") continue;
      const entryStatus = readStatusValue(entry);
      if (entryStatus !== undefined && entryStatus !== null && entryStatus !== "") {
        return entryStatus;
      }
      const entryConnectors = entry.connectors ?? entry.connector ?? entry.outlets ?? entry.ports;
      if (!Array.isArray(entryConnectors)) continue;
      for (const connector of entryConnectors) {
        if (!connector || typeof connector !== "object") continue;
        const connectorStatus = readStatusValue(connector);
        if (connectorStatus !== undefined && connectorStatus !== null && connectorStatus !== "") {
          return connectorStatus;
        }
      }
    }
  }

  return undefined;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return row;
  });
}

function extractExternalItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.features)) return data.features;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function parseExternalStatusItem(item: any): ExternalStatus | null {
  if (!item || typeof item !== "object") return null;

  const props = item.properties ?? item;
  const name =
    props.name ||
    props.title ||
    props.station ||
    props.station_name ||
    props.charger_name ||
    props.location;
  const address =
    props.address ||
    props.location_description ||
    props.locationDescription ||
    props.location_address ||
    props.address_line ||
    props.street ||
    props.site ||
    props.description;
  const power =
    props.power ||
    props.power_kw ||
    props.power_kwh ||
    props.output ||
    props.charge_output ||
    props.charger_type ||
    props.type;
  const statusValue = deriveStatusFromProps(props);

  const latRaw =
    props.lat ??
    props.latitude ??
    props.y ??
    props.location?.lat ??
    props.location?.latitude ??
    props.location?.y ??
    props.location?.coordinates?.[1] ??
    props.coordinates?.[1] ??
    item.lat ??
    item.latitude ??
    item.y ??
    item?.geometry?.coordinates?.[1];
  const lonRaw =
    props.lon ??
    props.lng ??
    props.longitude ??
    props.x ??
    props.location?.lon ??
    props.location?.lng ??
    props.location?.longitude ??
    props.location?.x ??
    props.location?.coordinates?.[0] ??
    props.coordinates?.[0] ??
    item.lon ??
    item.lng ??
    item.longitude ??
    item.x ??
    item?.geometry?.coordinates?.[0];

  const lat = typeof latRaw === "string" ? Number(latRaw) : latRaw;
  const lon = typeof lonRaw === "string" ? Number(lonRaw) : lonRaw;

  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const availability = normalizeAvailability(statusValue);
  const statusLabel = normalizeStatusLabel(statusValue);

  return {
    name: name ? String(name) : undefined,
    address: address ? String(address) : undefined,
    power: power ? String(power) : undefined,
    statusLabel,
    availability,
    coordinates: [lon, lat]
  };
}

function parseXmlStations(xmlText: string): ExternalStatus[] {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror");
  if (parserError.length) return [];

  const stations: ExternalStatus[] = [];

  // Helper to get text from nested element
  const getDeepText = (el: Element, tagName: string): string | undefined => {
    const found = el.getElementsByTagName(tagName)[0] || 
                  el.getElementsByTagName(`ei:${tagName}`)[0];
    return found?.textContent?.trim() || undefined;
  };

  // Helper to get value from status element (handles <value>text</value> structure)
  const getValueText = (el: Element, tagName: string): string | undefined => {
    const container = el.getElementsByTagName(tagName)[0] || 
                      el.getElementsByTagName(`ei:${tagName}`)[0];
    if (!container) return undefined;
    const valueEl = container.getElementsByTagName("value")[0];
    return valueEl?.textContent?.trim() || container.textContent?.trim() || undefined;
  };

  // Try DATEX II format (Cyprus EMS API)
  const chargingPoints = doc.getElementsByTagName("ei:chargingPoint");
  if (chargingPoints.length > 0) {
    Array.from(chargingPoints).forEach((cp) => {
      const latEl = cp.getElementsByTagName("latitude")[0];
      const lonEl = cp.getElementsByTagName("longitude")[0];
      if (!latEl || !lonEl) return;

      const lat = Number(latEl.textContent?.trim());
      const lon = Number(lonEl.textContent?.trim());
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const name = getDeepText(cp, "chargingPointIdentification");
      const address = getValueText(cp, "chargingPointAddress");
      const statusValue = getValueText(cp, "chargingPointStatus");
      const power = getDeepText(cp, "maximumPower") || getDeepText(cp, "connectorPower");

      const availability = normalizeAvailability(statusValue);
      const statusLabel = normalizeStatusLabel(statusValue);

      stations.push({
        name: name ?? undefined,
        address: address ?? undefined,
        power: power ? `${power} kW` : undefined,
        availability,
        statusLabel,
        coordinates: [lon, lat]
      });
    });
    return stations;
  }

  // Fallback: generic XML parsing
  const elements = Array.from(doc.getElementsByTagName("*"));

  const getChildText = (el: Element, tags: string[]) => {
    const lowerTags = tags.map((tag) => tag.toLowerCase());
    const children = Array.from(el.children);
    for (const child of children) {
      const tagName = child.tagName.toLowerCase().replace(/^.*:/, "");
      if (lowerTags.includes(tagName)) {
        const text = child.textContent?.trim();
        if (text) return text;
      }
    }
    return undefined;
  };

  const latTags = ["lat", "latitude", "y"];
  const lonTags = ["lon", "lng", "longitude", "x"];
  const nameTags = ["name", "station", "station_name", "title", "chargingpointidentification"];
  const addressTags = ["address", "location", "location_description", "street", "site", "chargingpointaddress"];
  const powerTags = ["power", "power_kw", "output", "maximumpower", "connectorpower"];
  const statusTags = ["status", "chargingpointstatus", "availability", "state"];

  elements.forEach((el) => {
    const latText = getChildText(el, latTags);
    const lonText = getChildText(el, lonTags);
    if (!latText || !lonText) return;
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const name = getChildText(el, nameTags);
    const address = getChildText(el, addressTags);
    const power = getChildText(el, powerTags);
    const statusValue = getChildText(el, statusTags);

    const availability = normalizeAvailability(statusValue);
    const statusLabel = normalizeStatusLabel(statusValue);

    stations.push({
      name: name ?? undefined,
      address: address ?? undefined,
      power: power ? (power.includes("kW") ? power : `${power} kW`) : undefined,
      availability,
      statusLabel,
      coordinates: [lon, lat]
    });
  });

  return stations;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(
  url: string,
  options: RequestInit,
  retries = 2,
  backoffMs = 600
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        if (attempt < retries) {
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
      }
      if (!res.ok) return null;
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }
    }
  }
  if (lastError) {
    console.warn("Failed to fetch external status data:", lastError);
  }
  return null;
}

async function fetchPlaceToPlugStatusData(): Promise<ExternalStatus[]> {
  if (!PLACETOPLUG_ENDPOINT) return [];
  const headers: Record<string, string> = { Accept: "application/json,text/plain" };
  if (PLACETOPLUG_API_KEY) {
    headers.Authorization = `Bearer ${PLACETOPLUG_API_KEY}`;
    headers["x-api-key"] = PLACETOPLUG_API_KEY;
  }

  const res = await fetchWithRetries(PLACETOPLUG_ENDPOINT, { headers });
  if (!res) return [];
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("text/csv") ? await res.text() : await res.json();
  const items = typeof data === "string" ? parseCsv(data) : extractExternalItems(data);
  if (!items.length) return [];

  return items
    .map(parseExternalStatusItem)
    .filter((item): item is ExternalStatus => Boolean(item));
}

async function fetchPlaceToPlugGraphqlStatusData(): Promise<ExternalStatus[]> {
  // Public PlaceToPlug web app uses this GraphQL endpoint and returns zone/plug status.
  // Note: "status" may represent availability only for some networks; treat unknowns cautiously.
  const cacheKey = "placetoplug_cyprus_zones_v1";
  const cacheTtlMs = 6 * 60 * 60 * 1000; // 6h

  const readCache = () => {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { fetchedAt: number; items: ExternalStatus[] };
      if (!parsed?.fetchedAt || !Array.isArray(parsed.items)) return null;
      if (Date.now() - parsed.fetchedAt > cacheTtlMs) return null;
      return parsed.items;
    } catch {
      return null;
    }
  };

  const writeCache = (items: ExternalStatus[]) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), items }));
    } catch {
      // ignore quota / privacy errors
    }
  };

  const cached = readCache();
  if (cached?.length) return cached;

  const requestGraphql = async (query: string, variables: any) => {
    const res = await fetchWithRetries(
      PLACETOPLUG_GRAPHQL_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apollo-require-preflight": "true",
          platform: "WEB",
          "Accept-Language": "en"
        },
        body: JSON.stringify({ query, variables })
      },
      1,
      800
    );
    if (!res) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  // PlaceToPlug returns results sorted by distance from a location.
  // To approximate "all Cyprus", query multiple seed locations across the island,
  // paginate a few pages, and dedupe by ID.
  const cyprusSeeds = [
    { latitude: 35.1856, longitude: 33.3823 }, // Nicosia
    { latitude: 34.6751, longitude: 33.0186 }, // Limassol
    { latitude: 34.9167, longitude: 33.6376 }, // Larnaca
    { latitude: 34.9877, longitude: 33.9997 }, // Ayia Napa
    { latitude: 34.7721, longitude: 32.4162 }, // Paphos
    { latitude: 35.3386, longitude: 33.3189 }, // Kyrenia area
    { latitude: 35.1186, longitude: 33.9473 }, // Famagusta area
    { latitude: 35.0382, longitude: 32.4255 } // Polis
  ];

  const indexQuery = `
    query Query($query: FindChargingZone!) {
      findChargingZones(query: $query) {
        hasNextPage
        chargingZones {
          id
          name
          coordinates
          status
          address { street city country }
        }
      }
    }
  `;

  const detailQuery = `
    query Query($query: FindChargingZone!) {
      findChargingZones(query: $query) {
        chargingZones {
          id
          name
          coordinates
          status
          address { street city country }
          stations {
            services {
              plugs {
                id
                status
                power
                plugType
              }
            }
          }
        }
      }
    }
  `;

  const zoneIndexById = new Map<string, any>();

  for (const seed of cyprusSeeds) {
    // Cap pages per seed to avoid excessive calls on the client.
    for (let page = 1; page <= 5; page += 1) {
      const variables = {
        query: {
          filters: {},
          params: { location: seed },
          limit: 200,
          page
        }
      };
      const payload = await requestGraphql(indexQuery, variables);
      const zones: any[] = payload?.data?.findChargingZones?.chargingZones ?? [];
      if (!Array.isArray(zones) || zones.length === 0) break;

      let cyprusCount = 0;
      for (const zone of zones) {
        const country = zone?.address?.country;
        if (country !== "Cyprus") continue;
        cyprusCount += 1;
        const id = zone?.id ? String(zone.id) : null;
        if (!id) continue;
        if (!zoneIndexById.has(id)) zoneIndexById.set(id, zone);
      }

      // If this page produced zero Cyprus zones, further pages from this seed are likely outside Cyprus.
      if (cyprusCount === 0) break;

      const hasNextPage = Boolean(payload?.data?.findChargingZones?.hasNextPage);
      if (!hasNextPage) break;
    }
  }

  const ids = Array.from(zoneIndexById.keys());
  if (!ids.length) return [];

  const batchSize = 50;
  const detailedZones: any[] = [];
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    const variables = {
      query: {
        // Pull plug-level details for these IDs.
        filters: { ids: batch, realTime: true },
        params: {},
        limit: batch.length,
        page: 1
      }
    };
    const payload = await requestGraphql(detailQuery, variables);
    const zones: any[] = payload?.data?.findChargingZones?.chargingZones ?? [];
    if (Array.isArray(zones) && zones.length) detailedZones.push(...zones);
  }

  const items = detailedZones
    .map((zone) => {
      const coords = Array.isArray(zone?.coordinates) ? zone.coordinates : null;
      if (!coords || coords.length < 2) return null;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

      const statusValue = zone?.status;
      const plugs: Array<{ id?: string; status?: string; power?: unknown; plugType?: string }> =
        zone?.stations?.flatMap((station: any) =>
          station?.services?.flatMap((service: any) => service?.plugs ?? [])
        ) ?? [];

      const plugStatuses = plugs
        .map((plug) => String(plug?.status ?? ""))
        .map((value) => value.trim())
        .filter(Boolean);

      const plugDerivedAvailability = deriveAvailabilityFromPlaceToPlugPlugs(plugStatuses);
      const availability =
        plugDerivedAvailability !== "unknown" ? plugDerivedAvailability : normalizeAvailability(statusValue);

      const ports = plugs
        .map((plug, index) => {
          const plugTypeRaw = plug?.plugType ? String(plug.plugType) : undefined;
          const connectorLabel = formatPlaceToPlugPlugType(plugTypeRaw);
          const powerKw = formatPowerKw(plug?.power);
          const statusRaw = plug?.status ? String(plug.status) : undefined;
          return {
            id: plug?.id ? String(plug.id) : `${zone?.id ?? "zone"}-${index}`,
            status: statusRaw,
            availability: normalizePlaceToPlugOccupancy(statusRaw),
            powerKw,
            plugType: plugTypeRaw,
            connectorLabel
          };
        })
        .filter((port) => Boolean(port.id));

      const connectorsFromPorts = Array.from(
        new Set(ports.map((port) => port.connectorLabel).filter(Boolean))
      ) as string[];

      const powerValues = ports.map((port) => port.powerKw).filter((value) => value !== undefined);
      const maxPower = powerValues.length ? Math.max(...powerValues) : undefined;

      const statusLabel =
        buildPlaceToPlugLabelFromPlugs(plugStatuses) ??
        normalizePlaceToPlugLabel(statusValue) ??
        normalizeStatusLabel(statusValue);
      const name = zone?.name ? String(zone.name) : undefined;

      const addressStreet = zone?.address?.street ? String(zone.address.street) : undefined;
      const city = zone?.address?.city ? String(zone.address.city) : undefined;
      const address = [addressStreet, city].filter(Boolean).join(", ") || undefined;

      return {
        source: "placetoplug",
        name,
        address,
        connectors: connectorsFromPorts.length ? connectorsFromPorts : undefined,
        power: maxPower ? `${maxPower} kW` : undefined,
        statusLabel,
        availability,
        ports: ports.length ? ports : undefined,
        coordinates: [lon, lat] as [number, number]
      } satisfies ExternalStatus;
    })
    .filter((item): item is ExternalStatus => Boolean(item));

  if (items.length) writeCache(items);
  return items;
}

async function fetchExternalStatusData(): Promise<ExternalStatus[]> {
  const placeToPlug = await fetchPlaceToPlugGraphqlStatusData();
  if (placeToPlug.length) return placeToPlug;

  // Legacy endpoints (may require auth / currently redirect to not-found).
  const placeToPlugLegacy = await fetchPlaceToPlugStatusData();
  if (placeToPlugLegacy.length) return placeToPlugLegacy;

  const candidateSources = [...CYPRUS_STATUS_SOURCES];

  for (const url of candidateSources) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml,application/json,text/plain" }
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      const textContent = await res.text();
      
      // Try XML parsing first if content looks like XML
      if (contentType.includes("xml") || textContent.trim().startsWith("<?xml") || textContent.trim().startsWith("<")) {
        const parsed = parseXmlStations(textContent);
        if (parsed.length) {
          console.log(`Loaded ${parsed.length} stations with status from Cyprus EMS API`);
          return parsed;
        }
      }

      // Try JSON/CSV parsing
      try {
        const data = contentType.includes("text/csv") ? textContent : JSON.parse(textContent);
        const items: any[] =
          typeof data === "string" ? parseCsv(data) : extractExternalItems(data);

        if (!items.length) continue;

        const parsed = items
          .map(parseExternalStatusItem)
          .filter((item): item is ExternalStatus => Boolean(item));

        if (parsed.length) return parsed;
      } catch {
        // JSON parse failed, continue to next source
        continue;
      }
    } catch {
      continue;
    }
  }
  return [];
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

export async function fetchChargingStations(): Promise<ChargingStation[]> {
  try {
    const osm = await fetchWithFailover(cyprusChargingOverpassQuery());
    const elements = osm?.elements ?? [];
    const externalStatuses = await fetchExternalStatusData();
    const statusByCoord = new Map<string, ExternalStatus>();
    const statusByName = new Map<string, ExternalStatus>();
    const usedExternalIds = new Set<string>();

    externalStatuses.forEach((status) => {
      statusByCoord.set(coordinateKey(status.coordinates[0], status.coordinates[1]), status);
      if (status.name) {
        statusByName.set(status.name.toLowerCase(), status);
      }
    });
    
    // Increase matching distance to 500m for better matching
    const maxStatusDistanceKm = 0.5;

    const stations: ChargingStation[] = elements
      .map((el: any) => {
        const tags = el.tags ?? {};
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (typeof lat !== "number" || typeof lon !== "number") return null;

        const connectors = parseConnectors(tags);
        const name = tags.name || tags.brand || "Charging Station";
        const city = tags["addr:city"] || tags["addr:suburb"] || tags["addr:place"];
        const address = buildAddress(tags);
        const opening = tags.opening_hours;
        const osmAvailability = deriveAvailability(tags);
        const osmStatusLabel = deriveStatusLabel(tags);
        const coordKey = coordinateKey(lon, lat);
        const nameKey = name?.toLowerCase();
        let matchedStatus =
          statusByCoord.get(coordKey) || (nameKey ? statusByName.get(nameKey) : undefined);
        
        if (!matchedStatus && externalStatuses.length) {
          let closestDistance = Number.POSITIVE_INFINITY;
          for (const status of externalStatuses) {
            const distance = haversineDistanceKm([lon, lat], status.coordinates);
            if (distance < maxStatusDistanceKm && distance < closestDistance) {
              closestDistance = distance;
              matchedStatus = status;
            }
          }
        }

        if (matchedStatus) {
          usedExternalIds.add(coordinateKey(matchedStatus.coordinates[0], matchedStatus.coordinates[1]));
        }

        const osmName = toTitleCase(name);
        const placeToPlugName =
          matchedStatus?.source === "placetoplug" && matchedStatus.name
            ? toTitleCase(matchedStatus.name)
            : undefined;

        return {
          id: `${el.type}/${el.id}`,
          name: osmName,
          osmName,
          placeToPlugName,
          operator: tags.operator || tags.network,
          address: address || matchedStatus?.address || city,
          city,
          connectors: Array.from(
            new Set([...(connectors ?? []), ...(matchedStatus?.connectors ?? [])])
          ).filter(Boolean),
          power: tags["charge:output"] || matchedStatus?.power,
          capacity: tags.capacity || (matchedStatus?.ports?.length ? String(matchedStatus.ports.length) : undefined),
          access: tags.access,
          open24_7: opening?.includes("24/7"),
          openingHours: opening,
          availability:
            matchedStatus?.availability && matchedStatus.availability !== "unknown"
              ? matchedStatus.availability
              : osmAvailability,
          statusLabel: matchedStatus?.statusLabel ?? osmStatusLabel,
          ports: matchedStatus?.ports,
          coordinates: [lon, lat]
        } as ChargingStation;
      })
      .filter(Boolean);

    // Add external stations that weren't matched to any OSM station
    let addedFromExternal = 0;
    externalStatuses.forEach((status, index) => {
      const coordKey = coordinateKey(status.coordinates[0], status.coordinates[1]);
      if (!usedExternalIds.has(coordKey)) {
        const externalName = status.name ? toTitleCase(status.name) : "Charging Station";
        stations.push({
          id: `external/${index}`,
          name: externalName,
          placeToPlugName:
            status.source === "placetoplug" && status.name ? toTitleCase(status.name) : undefined,
          address: status.address,
          power: status.power,
          connectors: status.connectors,
          availability: status.availability ?? "unknown",
          statusLabel: status.statusLabel,
          ports: status.ports,
          coordinates: status.coordinates
        });
        addedFromExternal++;
      }
    });

    if (addedFromExternal > 0) {
      console.log(`Added ${addedFromExternal} stations from external API with live status`);
    }

    return stations;
  } catch (error) {
    console.error("Error fetching charging stations:", error);
    return [];
  }
}

export const sampleChargingStations: ChargingStation[] = [
  {
    id: "sample-nicosia",
    name: "Nicosia Central Charging Hub",
    operator: "EAC",
    address: "Stasinou Ave 15, Nicosia",
    city: "Nicosia",
    connectors: ["CCS", "Type 2"],
    power: "150 kW",
    capacity: "6",
    open24_7: true,
    openingHours: "24/7",
    availability: "available",
    coordinates: [33.3642, 35.1728]
  },
  {
    id: "sample-limassol",
    name: "Limassol Marina Fast Charge",
    operator: "EV Connect",
    address: "Franklin Roosevelt Ave, Limassol",
    city: "Limassol",
    connectors: ["CCS", "CHAdeMO", "Type 2"],
    power: "120 kW",
    capacity: "4",
    open24_7: true,
    openingHours: "24/7",
    availability: "occupied",
    coordinates: [33.0186, 34.6751]
  },
  {
    id: "sample-larnaca",
    name: "Larnaca Seafront EV Point",
    operator: "ChargeCy",
    address: "Athenon Ave, Larnaca",
    city: "Larnaca",
    connectors: ["Type 2"],
    power: "22 kW",
    capacity: "8",
    open24_7: false,
    openingHours: "Mo-Su 07:00-22:00",
    availability: "available",
    coordinates: [33.6376, 34.9167]
  },
  {
    id: "sample-paphos",
    name: "Paphos Old Town Charger",
    operator: "Green Motion",
    address: "Apostolou Pavlou Ave, Paphos",
    city: "Paphos",
    connectors: ["CCS", "Type 2"],
    power: "60 kW",
    capacity: "3",
    open24_7: false,
    openingHours: "Mo-Su 08:00-20:00",
    availability: "out_of_service",
    coordinates: [32.4162, 34.7721]
  },
  {
    id: "sample-ayia-napa",
    name: "Ayia Napa Coastal Charge",
    operator: "E-Drive",
    address: "Nissi Ave, Ayia Napa",
    city: "Ayia Napa",
    connectors: ["Type 2", "Schuko"],
    power: "11 kW",
    capacity: "5",
    open24_7: true,
    openingHours: "24/7",
    availability: "available",
    coordinates: [33.9997, 34.9877]
  }
];
