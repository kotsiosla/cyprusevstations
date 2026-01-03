import type { ChargingStation } from "@/lib/chargingStations";

export type VehicleProfile = {
  id: string;
  label: string;
  connectors: string[]; // e.g. ["CCS", "Type 2"]
  maxChargeKw: number;
  batteryKwh: number;
  minUsefulKw?: number; // exclude slow chargers
};

export const VEHICLE_PROFILES: VehicleProfile[] = [
  { id: "any", label: "Any EV (no filter)", connectors: [], maxChargeKw: 999, batteryKwh: 60 },
  { id: "ac_type2", label: "Type 2 (AC)", connectors: ["Type 2"], maxChargeKw: 11, batteryKwh: 60, minUsefulKw: 7 },
  { id: "ccs_fast", label: "CCS (DC fast)", connectors: ["CCS"], maxChargeKw: 150, batteryKwh: 60, minUsefulKw: 50 },
  { id: "chademo", label: "CHAdeMO", connectors: ["CHAdeMO"], maxChargeKw: 50, batteryKwh: 40, minUsefulKw: 40 },
  { id: "tesla_ccs", label: "Tesla (CCS)", connectors: ["CCS", "Type 2"], maxChargeKw: 250, batteryKwh: 75, minUsefulKw: 50 }
];

export function parseStationPowerKw(station: ChargingStation): number | null {
  const portMax =
    station.ports?.reduce((max, port) => (typeof port.powerKw === "number" ? Math.max(max, port.powerKw) : max), 0) ??
    0;
  if (portMax > 0) return portMax;
  if (station.power) {
    const match = station.power.match(/([\d.]+)/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export function stationFitsVehicle(station: ChargingStation, profile: VehicleProfile): boolean {
  if (!profile || profile.id === "any") return true;
  const stationConnectors = new Set((station.connectors ?? []).map((c) => c.trim()));
  if (!profile.connectors.length) return true;
  return profile.connectors.some((c) => stationConnectors.has(c));
}

export function stationMeetsMinPower(station: ChargingStation, minKw?: number): boolean {
  if (!minKw) return true;
  const power = parseStationPowerKw(station);
  if (power === null) return false;
  return power >= minKw;
}

/**
 * Estimate minutes to charge from 20% to 80%.
 * Best-effort: average power is reduced by taper factor.
 */
export function estimateChargeMinutes20to80(station: ChargingStation, profile: VehicleProfile): number | null {
  const stationKw = parseStationPowerKw(station);
  if (!stationKw) return null;
  const vehicleMax = profile.maxChargeKw || 999;
  const effectiveKw = Math.max(1, Math.min(stationKw, vehicleMax));
  const energyKwh = (profile.batteryKwh || 60) * 0.6; // 20->80 = 60%
  const taperFactor = 0.65;
  const avgKw = Math.max(1, effectiveKw * taperFactor);
  return Math.round((energyKwh / avgKw) * 60);
}

