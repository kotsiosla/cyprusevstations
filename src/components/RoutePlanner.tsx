import { useMemo, useState } from "react";
import type { ChargingStation } from "@/lib/chargingStations";
import {
  CYPRUS_ROUTE_TEMPLATES,
  planRouteAwareCharging,
  type RoutePlanResult
} from "@/lib/routePlanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BatteryCharging, Route, Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

type RoutePlannerProps = {
  stations: ChargingStation[];
  onApplyToMap?: (args: {
    templateId: string;
    polyline: [number, number][];
    suggestedStopStationIds: string[];
  }) => void;
  onSelectStation?: (station: ChargingStation) => void;
};

const numberOr = (value: string, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export default function RoutePlanner({ stations, onApplyToMap, onSelectStation }: RoutePlannerProps) {
  const [templateId, setTemplateId] = useState(CYPRUS_ROUTE_TEMPLATES[0]?.id ?? "limassol-paphos");
  const [currentSocPct, setCurrentSocPct] = useState("55");
  const [batteryKwh, setBatteryKwh] = useState("60");
  const [consumption, setConsumption] = useState("18");
  const [arrivalSocPct, setArrivalSocPct] = useState("10");
  const [preferredChargeTo, setPreferredChargeTo] = useState("80");
  const [vehicleMaxKw, setVehicleMaxKw] = useState("100");
  const [corridorKm, setCorridorKm] = useState("10");
  const [fastOnly, setFastOnly] = useState(true);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [maxStops, setMaxStops] = useState("3");

  const result: RoutePlanResult = useMemo(() => {
    return planRouteAwareCharging(stations, {
      templateId,
      currentSocPct: numberOr(currentSocPct, 55),
      batteryKwh: numberOr(batteryKwh, 60),
      consumptionKwhPer100Km: numberOr(consumption, 18),
      desiredArrivalSocPct: numberOr(arrivalSocPct, 10),
      preferredChargeToSocPct: numberOr(preferredChargeTo, 80),
      vehicleMaxChargeKw: numberOr(vehicleMaxKw, 100),
      corridorKm: numberOr(corridorKm, 10),
      fastOnly,
      availableOnly,
      maxStops: numberOr(maxStops, 3)
    });
  }, [
    stations,
    templateId,
    currentSocPct,
    batteryKwh,
    consumption,
    arrivalSocPct,
    preferredChargeTo,
    vehicleMaxKw,
    corridorKm,
    fastOnly,
    availableOnly,
    maxStops
  ]);

  const template = result.template;

  return (
    <Card className="shadow-soft">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 font-display">
          <Route className="h-5 w-5 text-primary" />
          Route-aware charging planner
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Βάζεις αφετηρία/προορισμό (έτοιμες διαδρομές Κύπρου), SOC & κατανάλωση και η εφαρμογή προτείνει στάσεις
          φόρτισης και χρόνο.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-1">
            <p className="text-xs font-medium text-muted-foreground">Διαδρομή</p>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Επίλεξε διαδρομή" />
              </SelectTrigger>
              <SelectContent>
                {CYPRUS_ROUTE_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{template.start.label}</Badge>
                <span>→</span>
                <Badge variant="secondary">{template.end.label}</Badge>
              </div>
              {template.description ? <p className="mt-2">{template.description}</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Όχημα</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">SOC τώρα (%)</label>
                <Input value={currentSocPct} onChange={(e) => setCurrentSocPct(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">SOC άφιξης (%)</label>
                <Input value={arrivalSocPct} onChange={(e) => setArrivalSocPct(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Μπαταρία (kWh)</label>
                <Input value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Κατανάλωση (kWh/100km)</label>
                <Input value={consumption} onChange={(e) => setConsumption(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Charge-to (%)</label>
                <Input
                  value={preferredChargeTo}
                  onChange={(e) => setPreferredChargeTo(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max charge power (kW)</label>
                <Input value={vehicleMaxKw} onChange={(e) => setVehicleMaxKw(e.target.value)} inputMode="numeric" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Σταθμοί κατά μήκος διαδρομής</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Corridor (km)</label>
                <Input value={corridorKm} onChange={(e) => setCorridorKm(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max stops</label>
                <Input value={maxStops} onChange={(e) => setMaxStops(e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm">Fast only (50kW+)</span>
                </div>
                <Switch checked={fastOnly} onCheckedChange={setFastOnly} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm">Available only</span>
                </div>
                <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Εκτίμηση διαδρομής</p>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="gap-2">
                  <BatteryCharging className="h-4 w-4" />
                  {result.totalDistanceKm.toFixed(1)} km
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-2",
                    result.canReachWithoutCharging ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
                  )}
                >
                  {result.canReachWithoutCharging ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {result.canReachWithoutCharging
                    ? `Φτάνεις χωρίς φόρτιση (SOC άφιξης ~${result.estimatedArrivalSocPctIfNoCharging.toFixed(1)}%)`
                    : `Θα χρειαστείς φόρτιση (SOC άφιξης χωρίς φόρτιση ~${result.estimatedArrivalSocPctIfNoCharging.toFixed(1)}%)`}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() =>
                  onApplyToMap?.({
                    templateId,
                    polyline: result.polyline,
                    suggestedStopStationIds: result.suggestedStopStationIds
                  })
                }
              >
                Apply to map
              </Button>
            </div>
          </div>

          {result.warnings.length ? (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {result.warnings.slice(0, 4).map((w, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {!result.legs.length ? null : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Προτεινόμενο πλάνο</p>
              <Badge variant="secondary">{result.ok ? "OK" : "Needs adjustment"}</Badge>
            </div>

            <div className="grid gap-3">
              {result.legs.map((leg, idx) => (
                <Card key={idx} className="border-muted">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {idx + 1}. {leg.fromLabel} → {leg.toLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {leg.distanceKm.toFixed(1)} km · depart {leg.departSocPct.toFixed(1)}% → arrive {leg.arriveSocPct.toFixed(1)}%
                        </p>
                      </div>
                      {leg.chargeStop ? (
                        <div className="flex flex-col items-start gap-1 sm:items-end">
                          <Badge variant="outline" className="gap-2">
                            <Clock className="h-3.5 w-3.5" />
                            ~{leg.chargeStop.estimatedMinutes} min
                          </Badge>
                          <Badge variant="secondary">
                            Charge to {leg.chargeStop.targetSocPct.toFixed(1)}% · {leg.chargeStop.stationPowerKw} kW
                          </Badge>
                        </div>
                      ) : null}
                    </div>

                    {leg.chargeStop ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">+{leg.chargeStop.addedKwh.toFixed(1)} kWh</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const station = stations.find((s) => s.id === leg.chargeStop?.stationId);
                            if (station) onSelectStation?.(station);
                          }}
                        >
                          View station
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

