const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];
const CYPRUS_STATUS_SOURCES = [
  "https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/",
  "https://raw.githubusercontent.com/kotsiosla/cyprusevstations/main/stations.json",
  "https://raw.githubusercontent.com/kotsiosla/cyprusevstations/main/data/stations.json",
  "https://raw.githubusercontent.com/kotsiosla/cyprusevstations/main/evstations.json",
  "https://raw.githubusercontent.com/kotsiosla/cyprusevstations/main/data/evstations.json",
  "https://raw.githubusercontent.com/kotsiosla/cyprusevstations/main/charging-stations.json"
];

const CYPRUS_STATUS_REPO = "https://api.github.com/repos/kotsiosla/cyprusevstations/contents";

export interface ChargingStation {
  id: string;
  name: string;
  operator?: string;
  address?: string;
  city?: string;
  connectors?: string[];
  power?: string;
  capacity?: string;
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
  if (
    ["available", "free", "yes", "open", "in_service", "operational", "working"].includes(
      normalized
    ) ||
    normalized.includes("available") ||
    normalized.includes("operational") ||
    normalized.includes("working")
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
    ["out_of_service", "out-of-service", "maintenance", "closed", "no", "inactive", "fault"].includes(
      normalized
    ) ||
    normalized.includes("out of service") ||
    normalized.includes("out-of-service") ||
    normalized.includes("maintenance") ||
    normalized.includes("fault") ||
    normalized.includes("broken") ||
    normalized.includes("fix")
  ) {
    return "out_of_service" as const;
  }
  if (["0", "false", "offline", "down"].includes(normalized)) return "out_of_service" as const;
  return "unknown" as const;
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
  name?: string;
  statusLabel?: string;
  availability?: ChargingStation["availability"];
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
    statusLabel,
    availability,
    coordinates: [lon, lat]
  };
}

async function fetchGithubContents(path = "") {
  const url = path ? `${CYPRUS_STATUS_REPO}/${path}` : CYPRUS_STATUS_REPO;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function discoverStatusFiles() {
  const entries = await fetchGithubContents();
  const directories = entries
    .filter((entry: any) => entry.type === "dir")
    .map((entry: any) => entry.path)
    .filter((path: string) => /data|dataset|geo|json/i.test(path));
  const files = entries.filter((entry: any) => entry.type === "file");

  const nestedFiles = await Promise.all(
    directories.map((path: string) => fetchGithubContents(path))
  );

  return [...files, ...nestedFiles.flat()].filter((entry: any) => {
    const name = String(entry.name || "").toLowerCase();
    return (
      entry.type === "file" &&
      (name.endsWith(".json") || name.endsWith(".geojson") || name.endsWith(".csv")) &&
      /station|charger|charging|ev/.test(name)
    );
  });
}

async function fetchExternalStatusData(): Promise<ExternalStatus[]> {
  const candidateSources = [...CYPRUS_STATUS_SOURCES];
  try {
    const discovered = await discoverStatusFiles();
    discovered.forEach((entry: any) => {
      if (entry.download_url) {
        candidateSources.push(entry.download_url);
      }
    });
  } catch {
    // ignore discovery errors
  }

  for (const url of candidateSources) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json,text/plain" } });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("text/csv") ? await res.text() : await res.json();
      const items: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.stations)
        ? data.stations
        : Array.isArray(data?.features)
        ? data.features
        : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.records)
        ? data.records
        : typeof data === "string"
        ? parseCsv(data)
        : [];

      if (!items.length) continue;

      const parsed = items
        .map(parseExternalStatusItem)
        .filter((item): item is ExternalStatus => Boolean(item));

      if (parsed.length) return parsed;
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

    externalStatuses.forEach((status) => {
      statusByCoord.set(coordinateKey(status.coordinates[0], status.coordinates[1]), status);
      if (status.name) {
        statusByName.set(status.name.toLowerCase(), status);
      }
    });
    const maxStatusDistanceKm = 0.2;

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
        const availability = deriveAvailability(tags);
        const statusLabel = deriveStatusLabel(tags);
        const directExternal =
          statusByCoord.get(coordinateKey(lon, lat)) ||
          statusByName.get(name.toLowerCase()) ||
          statusByName.get(toTitleCase(name).toLowerCase());
        const nearestExternal =
          directExternal ||
          externalStatuses.reduce<ExternalStatus | null>((closest, status) => {
            const distance = haversineDistanceKm([lon, lat], status.coordinates);
            if (distance > maxStatusDistanceKm) return closest;
            if (!closest) return status;
            const currentDistance = haversineDistanceKm([lon, lat], closest.coordinates);
            return distance < currentDistance ? status : closest;
          }, null);
        const mergedAvailability =
          availability !== "unknown"
            ? availability
            : nearestExternal?.availability ?? availability;
        const mergedStatusLabel = statusLabel || nearestExternal?.statusLabel;

        return {
          id: `${el.type}/${el.id}`,
          name: toTitleCase(name),
          operator: tags.operator || tags.network,
          address: address || city,
          city,
          connectors: connectors.length ? connectors : undefined,
          power: tags["charge:output"],
          capacity: tags.capacity,
          access: tags.access,
          open24_7: opening?.includes("24/7"),
          openingHours: opening,
          availability: mergedAvailability,
          statusLabel: mergedStatusLabel,
          coordinates: [lon, lat]
        } as ChargingStation;
      })
      .filter(Boolean);

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
