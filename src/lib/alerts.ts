import { toast } from "@/components/ui/sonner";
import type { ChargingStation } from "@/lib/chargingStations";

export type WatchRule = {
  stationId: string;
  notifyOnAvailable?: boolean;
  notifyOnOutOfService?: boolean;
};

type WatchState = {
  enabled: boolean;
  rules: WatchRule[];
  lastSeenAvailabilityByStationId: Record<string, ChargingStation["availability"] | undefined>;
};

const STORAGE_KEY = "station_alerts_v1";

function readState(): WatchState {
  if (typeof localStorage === "undefined") {
    return { enabled: false, rules: [], lastSeenAvailabilityByStationId: {} };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { enabled: false, rules: [], lastSeenAvailabilityByStationId: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    return {
      enabled: Boolean(parsed.enabled),
      rules: Array.isArray(parsed.rules) ? (parsed.rules as WatchRule[]) : [],
      lastSeenAvailabilityByStationId:
        parsed.lastSeenAvailabilityByStationId && typeof parsed.lastSeenAvailabilityByStationId === "object"
          ? (parsed.lastSeenAvailabilityByStationId as Record<string, ChargingStation["availability"] | undefined>)
          : {}
    };
  } catch {
    return { enabled: false, rules: [], lastSeenAvailabilityByStationId: {} };
  }
}

function writeState(state: WatchState) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function getWatchState(): WatchState {
  return readState();
}

export function setAlertsEnabled(enabled: boolean) {
  const state = readState();
  state.enabled = enabled;
  writeState(state);
  return state;
}

export function isWatched(stationId: string): boolean {
  const state = readState();
  return state.rules.some((r) => r.stationId === stationId);
}

export function toggleWatch(station: ChargingStation) {
  const state = readState();
  const idx = state.rules.findIndex((r) => r.stationId === station.id);
  if (idx >= 0) {
    state.rules.splice(idx, 1);
    writeState(state);
    return { watched: false };
  }
  state.rules.push({ stationId: station.id, notifyOnAvailable: true, notifyOnOutOfService: true });
  state.lastSeenAvailabilityByStationId[station.id] = station.availability;
  // Auto-enable alerts when the user watches something.
  state.enabled = true;
  writeState(state);
  return { watched: true };
}

export function runAlertChecks(stations: ChargingStation[]) {
  const state = readState();
  if (!state.enabled) return;
  if (!state.rules.length) return;

  const byId = new Map(stations.map((s) => [s.id, s]));
  let changed = false;

  for (const rule of state.rules) {
    const station = byId.get(rule.stationId);
    if (!station) continue;
    const prev = state.lastSeenAvailabilityByStationId[rule.stationId];
    const next = station.availability;

    if (prev !== next) {
      state.lastSeenAvailabilityByStationId[rule.stationId] = next;
      changed = true;

      // First observation: store baseline without notifying.
      if (prev === undefined) continue;

      if (next === "available" && rule.notifyOnAvailable) {
        toast.success("Charger available", {
          description: station.name
        });
      }
      if (next === "out_of_service" && rule.notifyOnOutOfService) {
        toast.error("Charger out of service", {
          description: station.name
        });
      }
    }
  }

  if (changed) writeState(state);
}

