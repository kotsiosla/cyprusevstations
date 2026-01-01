import { ChargingStation } from "@/lib/chargingStations";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryCharging, MapPin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChargingStationListProps {
  stations: ChargingStation[];
  selectedStation?: ChargingStation | null;
  onSelect: (station: ChargingStation) => void;
}

const ChargingStationList = ({
  stations,
  selectedStation,
  onSelect
}: ChargingStationListProps) => {
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
                  <h3 className="font-display font-medium text-sm truncate">
                    {station.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {station.operator ? `${station.operator} · ` : ""}
                    {station.city || station.address || "Cyprus"}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(station.connectors ?? ["Standard AC"]).slice(0, 3).map((connector) => (
                      <Badge key={connector} variant="secondary" className="text-[0.65rem]">
                        {connector}
                      </Badge>
                    ))}
                    {station.power && (
                      <Badge variant="outline" className="text-[0.65rem]">
                        {station.power}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {station.capacity && (
                  <Badge variant="secondary" className="text-xs">
                    {station.capacity} bays
                  </Badge>
                )}
                {station.open24_7 && (
                  <Badge variant="outline" className="text-xs">
                    24/7
                  </Badge>
                )}
                <ArrowRight
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    selectedStation?.id === station.id && "text-primary translate-x-1"
                  )}
                />
              </div>
            </div>
            {station.address && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{station.address}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ChargingStationList;
