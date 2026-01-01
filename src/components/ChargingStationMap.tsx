import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChargingStation } from "@/lib/chargingStations";

interface ChargingStationMapProps {
  stations: ChargingStation[];
  selectedStation?: ChargingStation | null;
  onStationSelect?: (station: ChargingStation) => void;
}

const mapStyle = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

export default function ChargingStationMap({
  stations,
  selectedStation,
  onStationSelect
}: ChargingStationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const stationsById = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station]));
  }, [stations]);

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

      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(
        `<div class="text-sm font-semibold">${station.name}</div>` +
          (station.address
            ? `<div class="text-xs text-muted-foreground">${station.address}</div>`
            : "")
      );

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat(station.coordinates)
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [stations, selectedStation, onStationSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;

    map.flyTo({ center: selectedStation.coordinates, zoom: 12.5, speed: 1.2 });
  }, [selectedStation]);

  return <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />;
}
