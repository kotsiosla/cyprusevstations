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
    osm: {
      type: "raster" as const,
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }]
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

  return <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />;
}
