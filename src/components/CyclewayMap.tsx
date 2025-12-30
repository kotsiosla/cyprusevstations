import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Cycleway } from '@/lib/cycleways';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Key } from 'lucide-react';

interface CyclewayMapProps {
  cycleways: Cycleway[];
  selectedCycleway?: Cycleway | null;
  onCyclewaySelect?: (cycleway: Cycleway) => void;
}

const CyclewayMap = ({ cycleways, selectedCycleway, onCyclewaySelect }: CyclewayMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isTokenSet, setIsTokenSet] = useState(false);
  const [inputToken, setInputToken] = useState('');

  const handleSetToken = () => {
    if (inputToken.trim()) {
      setMapboxToken(inputToken.trim());
      setIsTokenSet(true);
      localStorage.setItem('mapbox_token', inputToken.trim());
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('mapbox_token');
    if (savedToken) {
      setMapboxToken(savedToken);
      setIsTokenSet(true);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || !isTokenSet || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [33.38, 35.17], // Center of Cyprus
      zoom: 9,
      pitch: 30,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showUserHeading: true
      }),
      'top-right'
    );

    map.current.on('load', () => {
      if (!map.current) return;

      // Add cycleways as lines
      cycleways.forEach((cycleway, index) => {
        if (cycleway.coordinates.length < 2) return;

        const sourceId = `cycleway-source-${index}`;
        const layerId = `cycleway-layer-${index}`;

        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              name: cycleway.name,
              id: cycleway.id
            },
            geometry: {
              type: 'LineString',
              coordinates: cycleway.coordinates
            }
          }
        });

        map.current!.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#0ea5e9',
            'line-width': 4,
            'line-opacity': 0.8
          }
        });

        // Add click handler
        map.current!.on('click', layerId, () => {
          if (onCyclewaySelect) {
            onCyclewaySelect(cycleway);
          }
        });

        map.current!.on('mouseenter', layerId, () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = 'pointer';
            map.current.setPaintProperty(layerId, 'line-width', 6);
          }
        });

        map.current!.on('mouseleave', layerId, () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = '';
            map.current.setPaintProperty(layerId, 'line-width', 4);
          }
        });
      });
    });

    return () => {
      map.current?.remove();
    };
  }, [cycleways, isTokenSet, mapboxToken, onCyclewaySelect]);

  // Fly to selected cycleway
  useEffect(() => {
    if (!map.current || !selectedCycleway || selectedCycleway.coordinates.length === 0) return;

    const [lng, lat] = selectedCycleway.coordinates[0];
    map.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      pitch: 45,
      duration: 2000
    });
  }, [selectedCycleway]);

  if (!isTokenSet) {
    return (
      <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
        <div className="glass p-8 rounded-2xl max-w-md mx-4 animate-slide-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg">Mapbox Token Required</h3>
              <p className="text-sm text-muted-foreground">To display the map</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Get your free public token from{' '}
            <a 
              href="https://mapbox.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              mapbox.com
            </a>
            {' '}→ Account → Tokens
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="pk.eyJ1Ijoi..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSetToken} variant="hero">
              <MapPin className="w-4 h-4" />
              Set
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-elevated">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-foreground/5" />
    </div>
  );
};

export default CyclewayMap;
