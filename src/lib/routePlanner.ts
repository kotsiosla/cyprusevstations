import type { ChargingStation } from "@/lib/chargingStations";

export type LonLat = [number, number]; // [lon, lat]

export type RoutePlace = {
  id: string;
  label: string;
  coordinates: LonLat;
};

export type RouteTemplate = {
  id: string;
  name: string;
  description?: string;
  // Polyline (start -> ...waypoints... -> end). Road distance is approximated from this polyline.
  polyline: LonLat[];
  start: RoutePlace;
  end: RoutePlace;
};

export type RoutePlanInput = {
  templateId: string;
  currentSocPct: number;
  batteryKwh: number;
  consumptionKwhPer100Km: number;
  desiredArrivalSocPct: number;
  preferredChargeToSocPct: number;
  vehicleMaxChargeKw: number;
  corridorKm: number;
  fastOnly: boolean;
  availableOnly: boolean;
  maxStops: number;
  templateOverride?: RouteTemplate;
  // Optional live routing override (e.g. OSRM).
  routePolyline?: LonLat[];
  routeDistanceKm?: number;
  routeDurationMin?: number;
};

export type RoutePlanLeg = {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  departSocPct: number;
  arriveSocPct: number;
  chargeStop?: {
    stationId: string;
    stationName: string;
    stationPowerKw: number;
    targetSocPct: number;
    addedKwh: number;
    estimatedMinutes: number;
    notes?: string;
  };
};

export type RoutePlanResult = {
  ok: boolean;
  template: RouteTemplate;
  polyline: LonLat[];
  totalDistanceKm: number;
  estimatedDriveMinutes?: number;
  routingMode: "approx" | "live";
  estimatedArrivalSocPctIfNoCharging: number;
  canReachWithoutCharging: boolean;
  legs: RoutePlanLeg[];
  suggestedStopStationIds: string[];
  warnings: string[];
};

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceKm(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function polylineDistanceKm(polyline: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    total += haversineDistanceKm(polyline[i - 1], polyline[i]);
  }
  return total;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseStationPowerKw(station: ChargingStation): number {
  const portMax =
    station.ports?.reduce((max, port) => (typeof port.powerKw === "number" ? Math.max(max, port.powerKw) : max), 0) ??
    0;
  if (portMax > 0) return portMax;
  if (station.power) {
    const m = station.power.match(/([\d.]+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 50;
}

// Equirectangular projection around an origin latitude (good enough for Cyprus distances).
function toMeters(coord: LonLat, originLatDeg: number): [number, number] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon, lat] = coord;
  const x = EARTH_RADIUS_M * toRad(lon) * Math.cos(toRad(originLatDeg));
  const y = EARTH_RADIUS_M * toRad(lat);
  return [x, y];
}

function distancePointToSegmentMeters(p: [number, number], a: [number, number], b: [number, number]) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  const t = abLen2 > 0 ? clamp((apx * abx + apy * aby) / abLen2, 0, 1) : 0;
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return { distance: Math.sqrt(dx * dx + dy * dy), t };
}

function closestPointOnPolylineProgressKm(point: LonLat, polyline: LonLat[]) {
  const originLat = polyline.reduce((sum, p) => sum + p[1], 0) / Math.max(1, polyline.length);
  const pM = toMeters(point, originLat);

  let best = { lateralM: Number.POSITIVE_INFINITY, alongM: 0 };
  let prefixM = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const aM = toMeters(a, originLat);
    const bM = toMeters(b, originLat);
    const segLenM = Math.hypot(bM[0] - aM[0], bM[1] - aM[1]);
    const { distance, t } = distancePointToSegmentMeters(pM, aM, bM);
    const alongHere = prefixM + t * segLenM;
    if (distance < best.lateralM) best = { lateralM: distance, alongM: alongHere };
    prefixM += segLenM;
  }

  return { lateralKm: best.lateralM / 1000, progressKm: best.alongM / 1000 };
}

function estimateChargeMinutes(params: {
  addedKwh: number;
  chargerKw: number;
  vehicleMaxKw: number;
  targetSocPct: number;
}) {
  const { addedKwh, chargerKw, vehicleMaxKw, targetSocPct } = params;
  if (addedKwh <= 0) return 0;
  const capped = Math.max(1, Math.min(chargerKw, vehicleMaxKw));
  const taperFactor = targetSocPct <= 80 ? 0.75 : targetSocPct <= 90 ? 0.55 : 0.4;
  const avgKw = Math.max(1, capped * taperFactor);
  return Math.round((addedKwh / avgKw) * 60);
}

export const CYPRUS_PLACES: RoutePlace[] = [
  { id: "nicosia", label: "Λευκωσία", coordinates: [33.3823, 35.1856] },
  { id: "limassol", label: "Λεμεσός", coordinates: [33.0186, 34.6751] },
  { id: "larnaca", label: "Λάρνακα", coordinates: [33.6376, 34.9167] },
  { id: "paphos", label: "Πάφος", coordinates: [32.4162, 34.7721] },
  { id: "ayia-napa", label: "Αγία Νάπα", coordinates: [33.9997, 34.9877] },
  { id: "troodos", label: "Τρόοδος", coordinates: [32.8646, 34.9286] },
  { id: "polis", label: "Πόλις Χρυσοχούς", coordinates: [32.4249, 35.0351] }
];

const placeById = (id: string) => CYPRUS_PLACES.find((p) => p.id === id)!;

export const CYPRUS_ROUTE_TEMPLATES: RouteTemplate[] = [
  {
    id: "limassol-paphos",
    name: "Λεμεσός ↔ Πάφος",
    description: "Κλασική διαδρομή δυτικής ακτής (A6/A1).",
    start: placeById("limassol"),
    end: placeById("paphos"),
    // Add a mid waypoint to approximate coastal road arc.
    polyline: [
      placeById("limassol").coordinates,
      [32.7585, 34.6756], // near Episkopi / Kourion area
      placeById("paphos").coordinates
    ]
  },
  {
    id: "nicosia-ayia-napa",
    name: "Λευκωσία ↔ Αγία Νάπα",
    description: "Δημοφιλής διαδρομή προς παραλία (A1/A3).",
    start: placeById("nicosia"),
    end: placeById("ayia-napa"),
    polyline: [placeById("nicosia").coordinates, placeById("larnaca").coordinates, placeById("ayia-napa").coordinates]
  },
  {
    id: "tourist-troodos-loop",
    name: "Τουριστική: Λεμεσός → Τρόοδος → Λευκωσία",
    description: "Ορεινή διαδρομή με υψομετρικές διαφορές (αυξημένη κατανάλωση).",
    start: placeById("limassol"),
    end: placeById("nicosia"),
    polyline: [placeById("limassol").coordinates, placeById("troodos").coordinates, placeById("nicosia").coordinates]
  },
  {
    id: "tourist-akamas",
    name: "Τουριστική: Πάφος → Πόλις (Ακάμας)",
    description: "Παραλιακή/τουριστική (πιθανές χαμηλότερες ταχύτητες).",
    start: placeById("paphos"),
    end: placeById("polis"),
    polyline: [placeById("paphos").coordinates, [32.383, 34.877], placeById("polis").coordinates]
  }
];

export function planRouteAwareCharging(
  stations: ChargingStation[],
  input: RoutePlanInput,
  templates: RouteTemplate[] = CYPRUS_ROUTE_TEMPLATES
): RoutePlanResult {
  const template = input.templateOverride ?? templates.find((t) => t.id === input.templateId) ?? templates[0];
  const warnings: string[] = [];

  const batteryKwh = clamp(safeNumber(input.batteryKwh, 60), 10, 200);
  const consumption = clamp(safeNumber(input.consumptionKwhPer100Km, 18), 8, 40);
  const currentSoc = clamp(safeNumber(input.currentSocPct, 60), 0, 100);
  const arrivalSoc = clamp(safeNumber(input.desiredArrivalSocPct, 10), 0, 30);
  const preferredTo = clamp(safeNumber(input.preferredChargeToSocPct, 80), 50, 100);
  const corridorKm = clamp(safeNumber(input.corridorKm, 10), 2, 30);
  const vehicleMaxKw = clamp(safeNumber(input.vehicleMaxChargeKw, 100), 7, 400);
  const maxStops = clamp(safeNumber(input.maxStops, 3), 0, 8);

  const polyline = input.routePolyline && input.routePolyline.length >= 2 ? input.routePolyline : template.polyline;
  const rawDistanceKm = polylineDistanceKm(polyline);
  const totalDistanceKm =
    typeof input.routeDistanceKm === "number" && Number.isFinite(input.routeDistanceKm) && input.routeDistanceKm > 0
      ? input.routeDistanceKm
      : rawDistanceKm * 1.12; // fallback: polyline underestimates real road distance
  const roadFactor = rawDistanceKm > 0 ? totalDistanceKm / rawDistanceKm : 1;
  const routingMode = input.routePolyline && input.routeDistanceKm ? ("live" as const) : ("approx" as const);

  const energyPctForTrip = (totalDistanceKm * (consumption / 100) / batteryKwh) * 100;
  const estimatedArrivalSocPctIfNoCharging = currentSoc - energyPctForTrip;
  const canReachWithoutCharging = estimatedArrivalSocPctIfNoCharging >= arrivalSoc;

  const legs: RoutePlanLeg[] = [];
  const suggestedStopStationIds: string[] = [];

  if (input.templateId.includes("troodos")) {
    warnings.push("Η διαδρομή Τρόοδος έχει υψομετρικές/θερμοκρασιακές επιδράσεις—η κατανάλωση μπορεί να είναι υψηλότερη.");
  }
  warnings.push(routingMode === "live" ? "Live routing: OSRM (best effort)." : "Οι αποστάσεις είναι εκτίμηση (χωρίς live routing).");

  if (canReachWithoutCharging) {
    legs.push({
      fromLabel: template.start.label,
      toLabel: template.end.label,
      distanceKm: round1(totalDistanceKm),
      departSocPct: round1(currentSoc),
      arriveSocPct: round1(estimatedArrivalSocPctIfNoCharging)
    });
    return {
      ok: true,
      template,
      polyline,
      totalDistanceKm: round1(totalDistanceKm),
      estimatedDriveMinutes:
        typeof input.routeDurationMin === "number" && Number.isFinite(input.routeDurationMin)
          ? Math.round(input.routeDurationMin)
          : undefined,
      routingMode,
      estimatedArrivalSocPctIfNoCharging: round1(estimatedArrivalSocPctIfNoCharging),
      canReachWithoutCharging: true,
      legs,
      suggestedStopStationIds,
      warnings
    };
  }

  const eligibleStations = stations
    .filter((s) => s.coordinates)
    .filter((s) => (!input.availableOnly ? true : s.availability === "available"))
    .filter((s) => {
      if (!input.fastOnly) return true;
      return parseStationPowerKw(s) >= 50;
    })
    .map((s) => {
      const powerKw = parseStationPowerKw(s);
      const { progressKm, lateralKm } = closestPointOnPolylineProgressKm(s.coordinates, polyline);
      return { station: s, powerKw, progressKm: progressKm * roadFactor, lateralKm };
    })
    .filter((x) => x.progressKm >= 0 && x.progressKm <= totalDistanceKm)
    .filter((x) => x.lateralKm <= corridorKm)
    .sort((a, b) => a.progressKm - b.progressKm);

  if (!eligibleStations.length) {
    warnings.push("Δεν βρέθηκαν σταθμοί κοντά στη διαδρομή με τα τρέχοντα φίλτρα.");
    return {
      ok: false,
      template,
      polyline,
      totalDistanceKm: round1(totalDistanceKm),
      estimatedDriveMinutes:
        typeof input.routeDurationMin === "number" && Number.isFinite(input.routeDurationMin)
          ? Math.round(input.routeDurationMin)
          : undefined,
      routingMode,
      estimatedArrivalSocPctIfNoCharging: round1(estimatedArrivalSocPctIfNoCharging),
      canReachWithoutCharging: false,
      legs,
      suggestedStopStationIds,
      warnings
    };
  }

  let currentProgressKm = 0;
  let soc = currentSoc;
  let stopsUsed = 0;
  let lastLabel = template.start.label;

  const energyPctForKm = (1 * (consumption / 100) / batteryKwh) * 100;
  const progressToDestinationKm = totalDistanceKm;

  // Guard for impossible input.
  if (soc < arrivalSoc) {
    warnings.push("Το τρέχον SOC είναι ήδη κάτω από το επιθυμητό SOC άφιξης.");
  }

  while (true) {
    const maxLegKm = ((soc - arrivalSoc) / 100) * (batteryKwh / (consumption / 100));
    const maxReachProgressKm = currentProgressKm + Math.max(0, maxLegKm);

    if (maxReachProgressKm >= progressToDestinationKm) {
      const distKm = progressToDestinationKm - currentProgressKm;
      const arrive = soc - distKm * energyPctForKm;
      legs.push({
        fromLabel: lastLabel,
        toLabel: template.end.label,
        distanceKm: round1(distKm),
        departSocPct: round1(soc),
        arriveSocPct: round1(arrive)
      });
      soc = arrive;
      break;
    }

    if (stopsUsed >= maxStops) {
      warnings.push(`Χρειάζονται >${maxStops} στάσεις με τα τωρινά δεδομένα (SOC/κατανάλωση/μπαταρία).`);
      break;
    }

    // Pick the furthest reachable station (with a small forward progress threshold).
    const minForwardKm = 5;
    const candidates = eligibleStations.filter(
      (x) => x.progressKm > currentProgressKm + minForwardKm && x.progressKm <= maxReachProgressKm
    );

    if (!candidates.length) {
      warnings.push("Δεν υπάρχει προσβάσιμος σταθμός φόρτισης πάνω στη διαδρομή (εντός corridor) με το τρέχον SOC.");
      break;
    }

    candidates.sort((a, b) => {
      if (b.progressKm !== a.progressKm) return b.progressKm - a.progressKm;
      // Prefer availability when present.
      const aAvail = a.station.availability === "available" ? 1 : 0;
      const bAvail = b.station.availability === "available" ? 1 : 0;
      if (bAvail !== aAvail) return bAvail - aAvail;
      return b.powerKw - a.powerKw;
    });

    const chosen = candidates[0];
    const distKm = chosen.progressKm - currentProgressKm;
    const arriveSocPct = soc - distKm * energyPctForKm;

    const remainingKm = progressToDestinationKm - chosen.progressKm;
    const requiredDepartSocToFinish = arrivalSoc + remainingKm * energyPctForKm;
    const targetSoc = clamp(Math.min(requiredDepartSocToFinish, preferredTo), arriveSocPct, 100);

    const chargerKw = chosen.powerKw;
    const addedKwh = ((targetSoc - arriveSocPct) / 100) * batteryKwh;
    const minutes = estimateChargeMinutes({
      addedKwh,
      chargerKw,
      vehicleMaxKw,
      targetSocPct: targetSoc
    });

    if (requiredDepartSocToFinish > preferredTo + 1) {
      warnings.push(
        `Με φόρτιση μέχρι ${preferredTo}%, πιθανόν να χρειαστείς επιπλέον στάση (η διαδρομή θέλει ~${Math.ceil(
          requiredDepartSocToFinish
        )}% για απευθείας άφιξη).`
      );
    }
    if (requiredDepartSocToFinish > 100) {
      warnings.push("Ακόμα και με 100% SOC, χρειάζεσαι τουλάχιστον 1 ενδιάμεση στάση για να φτάσεις.");
    }

    legs.push({
      fromLabel: lastLabel,
      toLabel: chosen.station.name,
      distanceKm: round1(distKm),
      departSocPct: round1(soc),
      arriveSocPct: round1(arriveSocPct),
      chargeStop: {
        stationId: chosen.station.id,
        stationName: chosen.station.name,
        stationPowerKw: Math.round(chargerKw),
        targetSocPct: round1(targetSoc),
        addedKwh: round1(addedKwh),
        estimatedMinutes: minutes,
        notes: chosen.station.availability && chosen.station.availability !== "unknown" ? chosen.station.statusLabel : undefined
      }
    });

    suggestedStopStationIds.push(chosen.station.id);
    lastLabel = chosen.station.name;
    currentProgressKm = chosen.progressKm;
    soc = targetSoc;
    stopsUsed += 1;
  }

  const ok = legs.length > 0 && legs[legs.length - 1].toLabel === template.end.label;
  return {
    ok,
    template,
    polyline,
    totalDistanceKm: round1(totalDistanceKm),
    estimatedDriveMinutes:
      typeof input.routeDurationMin === "number" && Number.isFinite(input.routeDurationMin)
        ? Math.round(input.routeDurationMin)
        : undefined,
    routingMode,
    estimatedArrivalSocPctIfNoCharging: round1(estimatedArrivalSocPctIfNoCharging),
    canReachWithoutCharging: false,
    legs,
    suggestedStopStationIds,
    warnings
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

