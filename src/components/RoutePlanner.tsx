import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChargingStation } from "@/lib/chargingStations";
import {
  CYPRUS_PLACES,
  CYPRUS_ROUTE_TEMPLATES,
  haversineDistanceKm,
  planRouteAwareCharging,
  type RoutePlanResult
} from "@/lib/routePlanner";
import { fetchOsrmRoute, type RoutedPath } from "@/lib/routing";
import { searchCyprusPlaces, type GeocodedPlace } from "@/lib/geocoding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BatteryCharging,
  Route,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  LocateFixed,
  ArrowRightLeft,
  Link2,
  Share2,
  GripVertical,
  Map as MapIcon,
  X
} from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/components/ui/sonner";

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

type PlaceValue = { label: string; coordinates: [number, number] } | null;
type StopItem = { id: string; place: PlaceValue };

const makeStopId = (() => {
  let counter = 0;
  return () => `stop_${Date.now()}_${(counter += 1)}`;
})();

const ROUTE_PROFILES = [
  { id: "eco", label: "Eco", multiplier: 0.9 },
  { id: "normal", label: "Normal", multiplier: 1.0 },
  { id: "fast", label: "Fast", multiplier: 1.1 }
] as const;
type RouteProfileId = (typeof ROUTE_PROFILES)[number]["id"];

const encodePlace = (place: PlaceValue) => {
  if (!place) return null;
  const [lon, lat] = place.coordinates;
  return `${lon.toFixed(5)},${lat.toFixed(5)}|${encodeURIComponent(place.label)}`;
};

const decodePlace = (raw: string | null): PlaceValue => {
  if (!raw) return null;
  const [coordPart, labelPart] = raw.split("|");
  if (!coordPart) return null;
  const [lonRaw, latRaw] = coordPart.split(",");
  const lon = Number(lonRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const label = labelPart ? decodeURIComponent(labelPart) : `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return { label, coordinates: [lon, lat] };
};

const encodePlaces = (places: PlaceValue[]) =>
  places
    .map(encodePlace)
    .filter((v): v is string => Boolean(v))
    .join(";");

const decodePlaces = (raw: string | null): PlaceValue[] => {
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => decodePlace(part))
    .filter((p): p is NonNullable<PlaceValue> => Boolean(p));
};

function PlaceAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  leadingAction
}: {
  label: string;
  placeholder: string;
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
  leadingAction?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value?.label ?? "");
  const [items, setItems] = useState<GeocodedPlace[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.label]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setItems([]);
      setStatus("idle");
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setStatus("loading");
      const res = await searchCyprusPlaces(q, 7);
      setItems(res);
      setStatus("ready");
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        {leadingAction ? <div className="shrink-0">{leadingAction}</div> : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <Input
              value={query}
              placeholder={placeholder}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open) setOpen(true);
                // keep current selection until user picks a result or clears
                if (value) onChange(null);
              }}
              onFocus={() => setOpen(true)}
            />
          </PopoverAnchor>
          <PopoverContent
            className="p-0 w-[--radix-popover-trigger-width]"
            align="start"
            // Keep focus on the input so you can keep typing.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <Command>
              <CommandList>
                <CommandEmpty>
                  {status === "loading" ? "Searching…" : "No results. Try a city, hotel, POI…"}
                </CommandEmpty>
                <CommandGroup>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.label}
                      onSelect={() => {
                        onChange({ label: item.label, coordinates: item.coordinates });
                        setQuery(item.label);
                        setOpen(false);
                      }}
                    >
                      <span className="text-sm">{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Clear"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {value ? (
        <p className="text-[0.7rem] text-muted-foreground">
          Selected · {value.coordinates[1].toFixed(4)}, {value.coordinates[0].toFixed(4)}
        </p>
      ) : null}
    </div>
  );
}

function StopRow({
  stopId,
  index,
  value,
  onChange,
  onRemove
}: {
  stopId: string;
  index: number;
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stopId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border p-3 bg-background">
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Drag stop"
          className="shrink-0 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <div className="flex-1">
          <PlaceAutocomplete
            label={`Stop ${index + 1}`}
            placeholder="π.χ. Troodos, Larnaca…"
            value={value}
            onChange={onChange}
          />
        </div>

        <Button type="button" variant="outline" size="icon" aria-label="Remove stop" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function RoutePlanner({ stations, onApplyToMap, onSelectStation }: RoutePlannerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hydratedFromUrlRef = useRef(false);
  const urlSyncTimerRef = useRef<number | null>(null);
  const lastSerializedParamsRef = useRef<string>("");

  const [routeMode, setRouteMode] = useState<"preset" | "custom">("preset");
  const [templateId, setTemplateId] = useState(CYPRUS_ROUTE_TEMPLATES[0]?.id ?? "limassol-paphos");
  const [origin, setOrigin] = useState<PlaceValue>(null);
  const [destination, setDestination] = useState<PlaceValue>(null);
  const [stops, setStops] = useState<StopItem[]>([]);
  const [routeProfile, setRouteProfile] = useState<RouteProfileId>("normal");
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
  const [useLiveRouting, setUseLiveRouting] = useState(true);
  const [routingStatus, setRoutingStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [routedPath, setRoutedPath] = useState<RoutedPath | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const isMobile = useIsMobile();
  const autoMinimizeDoneRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const selectedTemplate = useMemo(
    () => CYPRUS_ROUTE_TEMPLATES.find((t) => t.id === templateId) ?? CYPRUS_ROUTE_TEMPLATES[0],
    [templateId]
  );

  useEffect(() => {
    if (!isMobile) return;
    if (autoMinimizeDoneRef.current) return;
    setSettingsOpen(false);
    autoMinimizeDoneRef.current = true;
  }, [isMobile]);

  useEffect(() => {
    if (hydratedFromUrlRef.current) return;
    hydratedFromUrlRef.current = true;

    const rm = searchParams.get("rm");
    const mode = rm === "c" ? "custom" : rm === "p" ? "preset" : null;
    if (mode) setRouteMode(mode);

    const tid = searchParams.get("tid");
    if (tid) setTemplateId(tid);

    setOrigin(decodePlace(searchParams.get("o")));
    setDestination(decodePlace(searchParams.get("d")));
    const viaPlaces = decodePlaces(searchParams.get("v"));
    setStops(viaPlaces.map((place) => ({ id: makeStopId(), place })));

    const prof = searchParams.get("prof");
    if (prof === "eco" || prof === "normal" || prof === "fast") setRouteProfile(prof);

    const soc = searchParams.get("soc");
    if (soc) setCurrentSocPct(soc);
    const bat = searchParams.get("bat");
    if (bat) setBatteryKwh(bat);
    const cons = searchParams.get("cons");
    if (cons) setConsumption(cons);
    const arr = searchParams.get("arr");
    if (arr) setArrivalSocPct(arr);
    const to = searchParams.get("to");
    if (to) setPreferredChargeTo(to);
    const vmax = searchParams.get("vmax");
    if (vmax) setVehicleMaxKw(vmax);
    const corr = searchParams.get("corr");
    if (corr) setCorridorKm(corr);
    const stops = searchParams.get("stops");
    if (stops) setMaxStops(stops);

    const fast = searchParams.get("fast");
    if (fast) setFastOnly(fast === "1");
    const avail = searchParams.get("avail");
    if (avail) setAvailableOnly(avail === "1");
    const live = searchParams.get("live");
    if (live) setUseLiveRouting(live === "1");
  }, [searchParams]);

  const customTemplate = useMemo(() => {
    if (!origin || !destination) return null;
    const name = `${origin.label} → ${destination.label}`;
    const viaCoords = stops
      .map((s) => s.place?.coordinates)
      .filter((c): c is [number, number] => Boolean(c));
    const polyline: [number, number][] = [origin.coordinates, ...viaCoords, destination.coordinates];
    return {
      id: "custom",
      name,
      description: "Custom route (Cyprus geocoding)",
      start: { id: "origin", label: origin.label, coordinates: origin.coordinates },
      end: { id: "destination", label: destination.label, coordinates: destination.coordinates },
      polyline
    } as const;
  }, [origin, destination, stops]);

  const routeWaypoints = useMemo(() => {
    if (routeMode === "custom") {
      return customTemplate?.polyline ?? null;
    }
    return selectedTemplate?.polyline ?? null;
  }, [routeMode, customTemplate, selectedTemplate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!useLiveRouting) {
        setRoutedPath(null);
        setRoutingStatus("idle");
        return;
      }
      if (!routeWaypoints || routeWaypoints.length < 2) {
        setRoutedPath(null);
        setRoutingStatus("idle");
        return;
      }
      setRoutingStatus("loading");
      const res = await fetchOsrmRoute(routeWaypoints);
      if (cancelled) return;
      if (res) {
        setRoutedPath(res);
        setRoutingStatus("ready");
      } else {
        setRoutedPath(null);
        setRoutingStatus("error");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [routeWaypoints, useLiveRouting]);

  useEffect(() => {
    // Keep URL shareable (debounced + replace to avoid history spam).
    if (!hydratedFromUrlRef.current) return;
    if (urlSyncTimerRef.current) window.clearTimeout(urlSyncTimerRef.current);

    urlSyncTimerRef.current = window.setTimeout(() => {
      const next = new URLSearchParams();
      next.set("rm", routeMode === "custom" ? "c" : "p");
      next.set("tid", templateId);
      next.set("prof", routeProfile);

      const o = encodePlace(origin);
      const d = encodePlace(destination);
      const v = encodePlaces(stops.map((s) => s.place));
      if (routeMode === "custom") {
        if (o) next.set("o", o);
        if (d) next.set("d", d);
        if (v) next.set("v", v);
      }

      next.set("soc", currentSocPct);
      next.set("bat", batteryKwh);
      next.set("cons", consumption);
      next.set("arr", arrivalSocPct);
      next.set("to", preferredChargeTo);
      next.set("vmax", vehicleMaxKw);
      next.set("corr", corridorKm);
      next.set("stops", maxStops);

      next.set("fast", fastOnly ? "1" : "0");
      next.set("avail", availableOnly ? "1" : "0");
      next.set("live", useLiveRouting ? "1" : "0");

      const serialized = next.toString();
      if (serialized === lastSerializedParamsRef.current) return;
      lastSerializedParamsRef.current = serialized;
      setSearchParams(next, { replace: true });
    }, 450);

    return () => {
      if (urlSyncTimerRef.current) window.clearTimeout(urlSyncTimerRef.current);
    };
  }, [
    setSearchParams,
    routeMode,
    templateId,
    origin,
    destination,
    stops,
    routeProfile,
    currentSocPct,
    batteryKwh,
    consumption,
    arrivalSocPct,
    preferredChargeTo,
    vehicleMaxKw,
    corridorKm,
    maxStops,
    fastOnly,
    availableOnly,
    useLiveRouting
  ]);

  const result: RoutePlanResult = useMemo(() => {
    const routePolyline = routedPath?.polyline;
    const routeDistanceKm = routedPath?.distanceKm;
    const routeDurationMin = routedPath?.durationMin;
    const effectiveTemplateId = routeMode === "custom" ? "custom" : templateId;
    const multiplier = ROUTE_PROFILES.find((p) => p.id === routeProfile)?.multiplier ?? 1;
    return planRouteAwareCharging(stations, {
      templateId: effectiveTemplateId,
      templateOverride: routeMode === "custom" ? (customTemplate ?? undefined) : undefined,
      currentSocPct: numberOr(currentSocPct, 55),
      batteryKwh: numberOr(batteryKwh, 60),
      consumptionKwhPer100Km: numberOr(consumption, 18) * multiplier,
      desiredArrivalSocPct: numberOr(arrivalSocPct, 10),
      preferredChargeToSocPct: numberOr(preferredChargeTo, 80),
      vehicleMaxChargeKw: numberOr(vehicleMaxKw, 100),
      corridorKm: numberOr(corridorKm, 10),
      fastOnly,
      availableOnly,
      maxStops: numberOr(maxStops, 3),
      routePolyline,
      routeDistanceKm,
      routeDurationMin
    });
  }, [
    stations,
    templateId,
    routeMode,
    customTemplate,
    currentSocPct,
    batteryKwh,
    consumption,
    arrivalSocPct,
    preferredChargeTo,
    vehicleMaxKw,
    corridorKm,
    fastOnly,
    availableOnly,
    maxStops,
    routedPath,
    routeProfile
  ]);

  const template = result.template;
  type NavigatorShare = Navigator & { share: (data: ShareData) => Promise<void> };
  type NavigatorClipboard = Navigator & { clipboard: { writeText: (text: string) => Promise<void> } };
  const canShare =
    typeof navigator !== "undefined" && typeof (navigator as Partial<NavigatorShare>).share === "function";
  const canCopyLink =
    typeof navigator !== "undefined" && typeof (navigator as Partial<NavigatorClipboard>).clipboard?.writeText === "function";

  const googleMapsUrl = useMemo(() => {
    const toLatLon = (p: PlaceValue) => (p ? `${p.coordinates[1]},${p.coordinates[0]}` : null);
    const toLatLonFromCoord = (c: [number, number]) => `${c[1]},${c[0]}`;

    const waypoints = (() => {
      if (routeMode === "custom") {
        const viaPlaces = stops.map((s) => s.place).filter(Boolean) as Array<NonNullable<PlaceValue>>;
        return viaPlaces.slice(0, 8).map((p) => toLatLon(p)).filter((x): x is string => Boolean(x));
      }
      const mids = template.polyline.slice(1, -1).slice(0, 3).map(toLatLonFromCoord);
      return mids;
    })();

    const originStr = routeMode === "custom" ? toLatLon(origin) : toLatLonFromCoord(template.start.coordinates);
    const destStr = routeMode === "custom" ? toLatLon(destination) : toLatLonFromCoord(template.end.coordinates);
    if (!originStr || !destStr) return null;

    // Prefer "path-style" URLs for better compatibility in some browsers/webviews.
    // Format: https://www.google.com/maps/dir/<origin>/<wp1>/<wp2>/<destination>
    // (uses lat,lon segments)
    const segments = [originStr, ...waypoints, destStr].map((s) => encodeURIComponent(s));
    return `https://www.google.com/maps/dir/${segments.join("/")}`;
  }, [routeMode, origin, destination, stops, template]);

  const openStreetMapUrl = useMemo(() => {
    const toLatLon = (p: PlaceValue) => (p ? `${p.coordinates[1]},${p.coordinates[0]}` : null);
    const toLatLonFromCoord = (c: [number, number]) => `${c[1]},${c[0]}`;

    const originStr = routeMode === "custom" ? toLatLon(origin) : toLatLonFromCoord(template.start.coordinates);
    const destStr = routeMode === "custom" ? toLatLon(destination) : toLatLonFromCoord(template.end.coordinates);
    if (!originStr || !destStr) return null;

    const via = routeMode === "custom"
      ? (stops.map((s) => s.place).filter(Boolean) as Array<NonNullable<PlaceValue>>)
          .slice(0, 8)
          .map((p) => toLatLon(p))
          .filter((x): x is string => Boolean(x))
      : template.polyline.slice(1, -1).slice(0, 3).map(toLatLonFromCoord);

    // OSM directions expects route as "lat,lon;lat,lon;..."
    const route = [originStr, ...via, destStr].join(";");
    const params = new URLSearchParams({
      engine: "fossgis_osrm_car",
      route
    });
    return `https://www.openstreetmap.org/directions?${params.toString()}`;
  }, [routeMode, origin, destination, stops, template]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    setStops((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

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
        <div className="flex items-center justify-between gap-3 md:hidden">
          <p className="text-sm font-medium">Planner settings</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
            {settingsOpen ? "Minimize" : "Expand"}
          </Button>
        </div>

        <Collapsible open={settingsOpen || !isMobile} onOpenChange={setSettingsOpen}>
          <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                <p className="text-xs font-medium text-muted-foreground">Διαδρομή</p>
                <Select value={routeMode} onValueChange={(v) => setRouteMode(v as "preset" | "custom")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Route type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preset">Presets (Κύπρος)</SelectItem>
                    <SelectItem value="custom">Custom (search)</SelectItem>
                  </SelectContent>
                </Select>

                {routeMode === "preset" ? (
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
                ) : (
                  <div className="space-y-3">
                    <PlaceAutocomplete
                      label="Αφετηρία"
                      placeholder="π.χ. Limassol, Larnaca Airport…"
                      value={origin}
                      onChange={setOrigin}
                      leadingAction={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Use my location as origin"
                          title="Use my location"
                          onClick={() => {
                            if (!navigator.geolocation) return;
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setOrigin({
                                  label: "My location",
                                  coordinates: [pos.coords.longitude, pos.coords.latitude]
                                });
                              },
                              () => {}
                            );
                          }}
                        >
                          <LocateFixed className="h-4 w-4" />
                        </Button>
                      }
                    />

                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          const a = origin;
                          setOrigin(destination);
                          setDestination(a);
                          setStops((prev) => [...prev].reverse());
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        Swap
                      </Button>
                    </div>

                    <PlaceAutocomplete
                      label="Προορισμός"
                      placeholder="π.χ. Ayia Napa, Paphos Harbour…"
                      value={destination}
                      onChange={setDestination}
                    />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs text-muted-foreground">Stops (via)</label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setStops((prev) =>
                              prev.length >= 3 ? prev : [...prev, { id: makeStopId(), place: null }]
                            )
                          }
                          disabled={stops.length >= 3}
                        >
                          Add stop
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                            {stops.map((stop, idx) => (
                              <StopRow
                                key={stop.id}
                                stopId={stop.id}
                                index={idx}
                                value={stop.place}
                                onChange={(next) =>
                                  setStops((prev) =>
                                    prev.map((s) => (s.id === stop.id ? { ...s, place: next } : s))
                                  )
                                }
                                onRemove={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>

                      {origin && destination ? (
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground mb-2">Suggested stops (touristic)</p>
                          <div className="flex flex-wrap gap-2">
                            {CYPRUS_PLACES.filter((p) => {
                              const o = origin.coordinates;
                              const d = destination.coordinates;
                              const nearOrigin = haversineDistanceKm(p.coordinates, o) < 2;
                              const nearDest = haversineDistanceKm(p.coordinates, d) < 2;
                              const already = stops.some(
                                (x) => x.place && haversineDistanceKm(x.place.coordinates, p.coordinates) < 0.2
                              );
                              return !nearOrigin && !nearDest && !already;
                            })
                              .filter((p) =>
                                [
                                  "Τρόοδος",
                                  "Λάρνακα",
                                  "Λεμεσός",
                                  "Πάφος",
                                  "Λευκωσία",
                                  "Αγία Νάπα",
                                  "Πόλις Χρυσοχούς"
                                ].includes(p.label)
                              )
                              .slice(0, 6)
                              .map((p) => (
                                <Button
                                  key={p.id}
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setStops((prev) =>
                                      prev.length >= 3
                                        ? prev
                                        : [
                                            ...prev,
                                            { id: makeStopId(), place: { label: p.label, coordinates: p.coordinates } }
                                          ]
                                    )
                                  }
                                >
                                  {p.label}
                                </Button>
                              ))}
                          </div>
                          <p className="mt-2 text-[0.7rem] text-muted-foreground">
                            Tip: πρόσθεσε stop για “tourist route” ή για να αυξήσεις πιθανότητες να βρεις fast charger στο
                            δρόμο.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{template.start.label}</Badge>
                    <span>→</span>
                    <Badge variant="secondary">{template.end.label}</Badge>
                  </div>
                  {template.description ? <p className="mt-2">{template.description}</p> : null}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
                    <span className="text-xs">Live routing (beta)</span>
                    <Switch checked={useLiveRouting} onCheckedChange={setUseLiveRouting} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
                    <span className="text-xs">Profile</span>
                    <Select value={routeProfile} onValueChange={(v) => setRouteProfile(v as RouteProfileId)}>
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUTE_PROFILES.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {useLiveRouting ? (
                    <p className="mt-2 text-[0.7rem] text-muted-foreground">
                      {routingStatus === "loading"
                        ? "Routing: loading…"
                        : routingStatus === "ready"
                          ? "Routing: OSRM (live)"
                          : routingStatus === "error"
                            ? "Routing: failed → using estimate"
                            : "Routing: idle"}
                    </p>
                  ) : (
                    <p className="mt-2 text-[0.7rem] text-muted-foreground">Routing: estimate</p>
                  )}
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
                    <p className="text-[0.7rem] text-muted-foreground">
                      Profile:{" "}
                      {(() => {
                        const m = ROUTE_PROFILES.find((p) => p.id === routeProfile)?.multiplier ?? 1;
                        return `×${m.toFixed(2)} applied`;
                      })()}
                    </p>
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
          </CollapsibleContent>
        </Collapsible>

        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Εκτίμηση διαδρομής</p>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="gap-2">
                  <BatteryCharging className="h-4 w-4" />
                  {result.totalDistanceKm.toFixed(1)} km
                </Badge>
                {typeof result.estimatedDriveMinutes === "number" ? (
                  <Badge variant="outline" className="gap-2">
                    <Clock className="h-4 w-4" />
                    ~{result.estimatedDriveMinutes} min drive
                  </Badge>
                ) : null}
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
                onClick={() => {
                  onApplyToMap?.({
                    templateId: routeMode === "custom" ? "custom" : templateId,
                    polyline: result.polyline,
                    suggestedStopStationIds: result.suggestedStopStationIds
                  });
                  toast("Route applied to map", { description: "Scrolling to map…" });
                  document.querySelector("#map")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Apply to map
              </Button>
              {googleMapsUrl ? (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "default" }), "gap-2")}
                >
                  <MapIcon className="h-4 w-4" />
                  Google Maps
                </a>
              ) : null}
              {openStreetMapUrl ? (
                <a
                  href={openStreetMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "default" }), "gap-2")}
                >
                  <MapIcon className="h-4 w-4" />
                  OpenStreetMap
                </a>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    if (!canCopyLink) return;
                    await (navigator as NavigatorClipboard).clipboard.writeText(window.location.href);
                    setCopiedLink(true);
                    window.setTimeout(() => setCopiedLink(false), 1200);
                  } catch {
                    // ignore
                  }
                }}
                disabled={!canCopyLink}
              >
                <Link2 className="h-4 w-4" />
                {copiedLink ? "Copied" : "Copy link"}
              </Button>
              {canShare ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      await (navigator as NavigatorShare).share({
                        title: "ChargeCyprus route plan",
                        text: "Route-aware charging plan",
                        url: window.location.href
                      });
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              ) : null}
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

