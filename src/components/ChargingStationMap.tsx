import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Home, SlidersHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { ChargingStation } from "@/lib/chargingStations";

interface ChargingStationMapProps {
  stations: ChargingStation[];
  selectedStation?: ChargingStation | null;
  onStationSelect?: (station: ChargingStation) => void;
  onRequestLocation?: () => void;
  userLocation?: [number, number] | null;
}

const defaultView = {
  center: [33.3823, 35.1856] as [number, number],
  zoom: 8.2
};

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
  onRequestLocation,
  userLocation
}: ChargingStationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stationsRef = useRef<ChargingStation[]>(stations);
  const [showStations, setShowStations] = useState(true);

  const stationGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: stations
        .filter((station) => station.coordinates)
        .map((station) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: station.coordinates
          },
          properties: {
            id: station.id,
            name: station.name,
            address: station.address ?? "",
            openingHours: station.openingHours ?? "",
            availability: station.availability ?? "unknown",
            statusLabel: station.statusLabel ?? "Status unknown"
          }
        }))
    };
  }, [stations]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: defaultView.center,
      zoom: defaultView.zoom
    });

    map.on("load", () => {
      if (map.getSource("stations")) return;

      map.addSource("stations", {
        type: "geojson",
        data: stationGeoJson,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#60a5fa",
            20,
            "#2563eb",
            50,
            "#1e3a8a"
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            20,
            24,
            50,
            30
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0f172a"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "stations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12
        },
        paint: {
          "text-color": "#f8fafc"
        }
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "availability"],
            "available",
            "#16a34a",
            "occupied",
            "#f59e0b",
            "out_of_service",
            "#ef4444",
            "#64748b"
          ],
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0f172a"
        }
      });

      map.addLayer({
        id: "selected-station",
        type: "circle",
        source: "stations",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-color": "#0f172a",
          "circle-radius": 10,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f8fafc"
        }
      });

      map.on("click", "clusters", (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["clusters"]
        });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("stations") as maplibregl.GeoJSONSource;
        if (!source || clusterId === undefined) return;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          const [longitude, latitude] = (features[0].geometry as GeoJSON.Point)
            .coordinates as [number, number];
          map.easeTo({ center: [longitude, latitude], zoom });
        });
      });

      map.on("click", "unclustered-point", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const properties = feature.properties ?? {};
        const stationId = String(properties.id ?? "");
        const station = stationsRef.current.find((item) => item.id === stationId);
        if (station) {
          onStationSelect?.(station);
        }
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "unclustered-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
      });
    });

      map.addSource("stations", {
        type: "geojson",
        data: stationGeoJson,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#60a5fa",
            20,
            "#2563eb",
            50,
            "#1e3a8a"
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            20,
            24,
            50,
            30
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0f172a"
        }
      });

    const source = map.getSource("stations") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(stationGeoJson);
    }

    if (userLocation) {
      if (!userMarkerRef.current) {
        const userMarker = document.createElement("div");
        userMarker.className = "user-marker";
        userMarkerRef.current = new maplibregl.Marker({ element: userMarker })
          .setLngLat(userLocation)
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat(userLocation);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [stationGeoJson, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showStations ? "visible" : "none";
    ["clusters", "cluster-count", "unclustered-point", "selected-station"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    });
  }, [showStations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;

    map.flyTo({ center: selectedStation.coordinates, zoom: 12.5, speed: 1.2 });
    if (map.getLayer("selected-station")) {
      map.setFilter("selected-station", ["==", ["get", "id"], selectedStation.id]);
    }

    const availabilityLabel =
      selectedStation.availability === "available"
        ? "Available"
        : selectedStation.availability === "occupied"
        ? "Occupied"
        : selectedStation.availability === "out_of_service"
        ? "Out of service"
        : selectedStation.statusLabel || "Status unknown";

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: 20 })
      .setLngLat(selectedStation.coordinates)
      .setHTML(
        `<div class="text-sm font-semibold">${selectedStation.name}</div>` +
          (selectedStation.address
            ? `<div class="text-xs text-muted-foreground">${selectedStation.address}</div>`
            : "") +
          `<div class="text-xs mt-1">${availabilityLabel}</div>` +
          (selectedStation.openingHours
            ? `<div class="text-xs text-muted-foreground">${selectedStation.openingHours}</div>`
            : "")
      )
      .addTo(map);
  }, [selectedStation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedStation) {
      if (map.getLayer("selected-station")) {
        map.setFilter("selected-station", ["==", ["get", "id"], ""]);
      }
      popupRef.current?.remove();
      popupRef.current = null;
    }
  }, [selectedStation]);

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleResetView = () => {
    mapRef.current?.flyTo({ center: defaultView.center, zoom: defaultView.zoom, speed: 1.2 });
  };

  const handleLocate = () => {
    if (userLocation) {
      mapRef.current?.flyTo({ center: userLocation, zoom: 12.5, speed: 1.2 });
      return;
    }
    if (onRequestLocation) {
      onRequestLocation();
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
      mapRef.current?.flyTo({ center: coords, zoom: 12.5, speed: 1.2 });
    });
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="absolute inset-0" />

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowStations((prev) => !prev)}
          className="rounded-full border bg-background/90 p-2 shadow-soft backdrop-blur transition hover:bg-background"
          aria-label={showStations ? "Hide stations" : "Show stations"}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleLocate}
          className="rounded-full border bg-background/90 p-2 shadow-soft backdrop-blur transition hover:bg-background"
          aria-label="Center on my location"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleResetView}
          className="rounded-full border bg-background/90 p-2 shadow-soft backdrop-blur transition hover:bg-background"
          aria-label="Reset map view"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded-full border bg-background/90 p-2 shadow-soft backdrop-blur transition hover:bg-background"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded-full border bg-background/90 p-2 shadow-soft backdrop-blur transition hover:bg-background"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>

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
