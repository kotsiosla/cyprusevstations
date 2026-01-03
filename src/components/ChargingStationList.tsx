import { ChargingStation } from "@/lib/chargingStations";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryCharging, MapPin, ArrowRight, Clock, Radar, CircleDot, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { VehicleProfile } from "@/lib/vehicleProfiles";
import CommunityFeedback from "@/components/CommunityFeedback";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ChargingStationListProps {
  stations: ChargingStation[];
  selectedStation?: ChargingStation | null;
  onSelect: (station: ChargingStation) => void;
  userLocation?: [number, number] | null;
  vehicleProfile?: VehicleProfile | null;
}

const ChargingStationList = ({
  stations,
  selectedStation,
  onSelect,
  userLocation,
  vehicleProfile
}: ChargingStationListProps) => {
  const availabilityStyles = (availability?: ChargingStation["availability"]) => {
    switch (availability) {
      case "available":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "occupied":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "out_of_service":
        return "bg-rose-100 text-rose-700 border-rose-200";
      default:
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  const availabilityLabel = (station: ChargingStation) => {
    // Prefer the upstream/live label when present (e.g. "Operational", "Unavailable"),
    // but keep availability for filtering and colors.
    if (station.statusLabel && station.statusLabel !== "Status unknown") {
      return station.statusLabel;
    }

    switch (station.availability) {
      case "available":
        return "Available";
      case "occupied":
        return "Occupied";
      case "out_of_service":
        return "Out of service";
      default:
        return "Status unknown";
    }
  };

  const portStatusLabel = (availability?: ChargingStation["availability"]) => {
    switch (availability) {
      case "available":
        return "Available";
      case "occupied":
        return "In use";
      case "out_of_service":
        return "Out of service";
      default:
        return "Unknown";
    }
  };

  const directionsUrlForStation = (station: ChargingStation) => {
    const [lon, lat] = station.coordinates;
    const params = new URLSearchParams({
      api: "1",
      destination: `${lat},${lon}`,
      travelmode: "driving"
    });
    if (userLocation) {
      params.set("origin", `${userLocation[1]},${userLocation[0]}`);
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  return (
    <div className="space-y-3">
      {stations.map((station, index) => (
        <Card
          key={station.id}
          variant="interactive"
          onClick={() => onSelect(station)}
          className={cn(
            "opacity-0 animate-slide-up",
            selectedStation?.id === station.id && "ring-2 ring-primary shadow-glow"
          )}
          style={{ animationDelay: `${index * 0.05}s`, animationFillMode: "forwards" }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <BatteryCharging className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3 className="font-display font-medium text-sm truncate">{station.name}</h3>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8} className="max-w-[360px]">
                      <div className="space-y-1 text-xs">
                        {station.operator ? <div><span className="font-medium">Operator:</span> {station.operator}</div> : null}
                        {station.city ? <div><span className="font-medium">City:</span> {station.city}</div> : null}
                        {station.address ? <div><span className="font-medium">Address:</span> {station.address}</div> : null}
                        {station.osmName ? <div><span className="font-medium">OSM:</span> {station.osmName}</div> : null}
                        {station.placeToPlugName ? (
                          <div><span className="font-medium">PlaceToPlug:</span> {station.placeToPlugName}</div>
                        ) : null}
                        {station.ocmName ? (
                          <div><span className="font-medium">OpenChargeMap:</span> {station.ocmName}</div>
                        ) : null}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  {station.osmName && (
                    <p className="text-[0.7rem] text-muted-foreground truncate mt-0.5">
                      OSM: {station.osmName}
                    </p>
                  )}
                  {station.placeToPlugName && (
                    <p className="text-[0.7rem] text-muted-foreground truncate">
                      PlaceToPlug: {station.placeToPlugName}
                    </p>
                  )}
                  {station.ocmName && (
                    <p className="text-[0.7rem] text-muted-foreground truncate">
                      OpenChargeMap: {station.ocmName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {station.operator ? `${station.operator} · ` : ""}
                    {station.city || station.address || "Cyprus"}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(station.connectors ?? ["Standard AC"]).slice(0, 3).map((connector) => (
                      <Tooltip key={connector}>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-[0.65rem]">
                            {connector}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>
                          <span className="text-xs">Connector type</span>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {station.power && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[0.65rem]">
                            {station.power}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>
                          <span className="text-xs">Reported max power</span>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {station.distanceLabel && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[0.65rem] flex items-center gap-1">
                            <Radar className="w-3 h-3" />
                            {station.distanceLabel}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8}>
                          <span className="text-xs">Distance from your location</span>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[0.65rem] border flex items-center gap-1",
                            availabilityStyles(station.availability)
                          )}
                        >
                          <CircleDot className="w-3 h-3" />
                          {availabilityLabel(station)}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8} className="max-w-[320px]">
                        <div className="space-y-1 text-xs">
                          <div>
                            <span className="font-medium">Status:</span> {availabilityLabel(station)}
                          </div>
                          {station.statusLabel && station.statusLabel !== "Status unknown" ? (
                            <div>
                              <span className="font-medium">Details:</span> {station.statusLabel}
                            </div>
                          ) : null}
                          {station.ports?.length ? (
                            <div>
                              <span className="font-medium">Ports:</span> {station.ports.length}
                            </div>
                          ) : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {station.capacity && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs">
                        {station.capacity} bays
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>
                      <span className="text-xs">Number of bays/ports (best effort)</span>
                    </TooltipContent>
                  </Tooltip>
                )}
                {station.open24_7 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs">
                        24/7
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>
                      <span className="text-xs">Open 24 hours</span>
                    </TooltipContent>
                  </Tooltip>
                )}
                <ArrowRight
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    selectedStation?.id === station.id && "text-primary translate-x-1"
                  )}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      window.open(directionsUrlForStation(station), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Navigation className="w-4 h-4" />
                    Directions
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>
                  <span className="text-xs">Open directions in Google Maps</span>
                </TooltipContent>
              </Tooltip>
            </div>

            <CommunityFeedback station={station} vehicleProfile={vehicleProfile} />

            {station.openingHours && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{station.openingHours}</span>
              </div>
            )}
            {station.address && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{station.address}</span>
              </div>
            )}

            {station.ports?.length ? (
              <div className="mt-3 grid gap-1">
                <p className="text-[0.7rem] font-medium text-muted-foreground">Ports</p>
                <div className="flex flex-col gap-1">
                  {station.ports.slice(0, 6).map((port, idx) => (
                    <div key={port.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[0.65rem]">
                        Port {idx + 1}
                      </Badge>
                      {port.connectorLabel && (
                        <Badge variant="outline" className="text-[0.65rem]">
                          {port.connectorLabel}
                        </Badge>
                      )}
                      {typeof port.powerKw === "number" && (
                        <Badge variant="outline" className="text-[0.65rem]">
                          {port.powerKw} kW
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("text-[0.65rem]", availabilityStyles(port.availability))}
                      >
                        {portStatusLabel(port.availability)}
                      </Badge>
                    </div>
                  ))}
                  {station.ports.length > 6 && (
                    <p className="text-[0.7rem] text-muted-foreground">
                      +{station.ports.length - 6} more
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {station.ocm ? (
              <div className="mt-4 grid gap-2">
                <p className="text-[0.7rem] font-medium text-muted-foreground">Related information</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  {(station.ocm.usageType || station.ocm.isMembershipRequired !== undefined) && (
                    <div>
                      {station.ocm.usageType ?? "Access"}{" "}
                      {station.ocm.isMembershipRequired ? "· Membership required" : ""}
                    </div>
                  )}
                  {station.ocm.usageCost && <div>Cost: {station.ocm.usageCost}</div>}
                  {station.ocm.openingTimes && <div>Opening hours: {station.ocm.openingTimes}</div>}
                  {station.ocm.accessComments && <div>{station.ocm.accessComments}</div>}
                  <div>
                    Data provided by{" "}
                    <a
                      href={station.ocm.dataProviderUrl ?? "https://openchargemap.org"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      OpenChargeMap
                    </a>{" "}
                    (CC BY 4.0)
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ChargingStationList;
