import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChargingStation } from "@/lib/chargingStations";

interface ChargingStationMapProps {
  stations: ChargingStation[];
  selectedStation?: ChargingStation | null;
  onStationSelect?: (station: ChargingStation) => void;
  userLocation?: [number, number] | null;
}

const mapStyle = {
  version: 8 as const,
  sources: {
    esri: {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  },
  layers: [{ id: "esri-satellite", type: "raster" as const, source: "esri" }]
};

export default function ChargingStationMap({
  stations,
  selectedStation,
  onStationSelect,
  userLocation
}: ChargingStationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const markerByIdRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [33.3823, 35.1856],
      zoom: 8.2
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    mapRef.current = map;

    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    markerByIdRef.current.clear();

    stations.forEach((station) => {
      const markerEl = document.createElement("button");
      markerEl.type = "button";
      markerEl.className = "charging-marker";
      markerEl.setAttribute("aria-label", `Charging station ${station.name}`);

      // Add status-based color class
      const statusClass = station.availability 
        ? `charging-marker--${station.availability}` 
        : "charging-marker--unknown";
      markerEl.classList.add(statusClass);

      if (selectedStation?.id === station.id) {
        markerEl.classList.add("charging-marker--active");
      }

      markerEl.addEventListener("click", () => {
        onStationSelect?.(station);
        if (station.coordinates) {
          map.flyTo({ center: station.coordinates, zoom: 13, speed: 1.2 });
        }
      });

      const availabilityLabel =
        station.availability === "available"
          ? "Available"
          : station.availability === "occupied"
          ? "Occupied"
          : station.availability === "out_of_service"
          ? "Out of service"
          : station.statusLabel || "Status unknown";
      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
        `<div class="text-sm font-semibold">${station.name}</div>` +
          (station.address
            ? `<div class="text-xs text-muted-foreground">${station.address}</div>`
            : "") +
          `<div class="text-xs mt-1">${availabilityLabel}</div>` +
          (station.openingHours
            ? `<div class="text-xs text-muted-foreground">${station.openingHours}</div>`
            : "")
      );

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat(station.coordinates)
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
      markerByIdRef.current.set(station.id, marker);
    });
    if (userLocation) {
      const userMarker = document.createElement("div");
      userMarker.className = "user-marker";
      const marker = new maplibregl.Marker({ element: userMarker })
        .setLngLat(userLocation)
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [stations, selectedStation, onStationSelect, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;

    map.flyTo({ center: selectedStation.coordinates, zoom: 12.5, speed: 1.2 });
    const marker = markerByIdRef.current.get(selectedStation.id);
    if (marker) {
      const popup = marker.getPopup();
      if (popup && !popup.isOpen()) {
        marker.togglePopup();
      }
    }
  }, [selectedStation]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="absolute inset-0" />
      
      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg border shadow-soft p-3 z-10">
        <p className="text-xs font-medium mb-2">Station Status</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(142,76%,36%)]" />
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(38,92%,50%)]" />
            <span className="text-xs text-muted-foreground">Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(0,84%,60%)]" />
            <span className="text-xs text-muted-foreground">Out of Service</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span className="text-xs text-muted-foreground">Unknown</span>
          </div>
        </div>
      </div>
    </div>
  );
}
