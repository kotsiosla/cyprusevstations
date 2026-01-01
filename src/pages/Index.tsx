import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import StatsSection from '@/components/StatsSection';
import ChargingStationMap from '@/components/ChargingStationMap';
import ChargingStationList from '@/components/ChargingStationList';
import { fetchChargingStations, sampleChargingStations, ChargingStation } from '@/lib/chargingStations';
import { Helmet } from 'react-helmet-async';
import { BatteryCharging, Heart, MapPin, Moon, Navigation, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';

const Index = () => {
  const [stations, setStations] = useState<ChargingStation[]>(sampleChargingStations);
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'denied' | 'error'>(
    'idle'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConnector, setSelectedConnector] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    const loadStations = async () => {
      try {
        const data = await fetchChargingStations();
        if (data.length > 0) {
          const hasKnownAvailability = data.some(
            (station) => station.availability && station.availability !== 'unknown'
          );
          setStations(hasKnownAvailability ? data : sampleChargingStations);
        }
      } catch (error) {
        console.error('Failed to load charging stations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStations();
  }, []);

  const connectorOptions = useMemo(() => {
    const connectors = new Set<string>();
    stations.forEach((station) => {
      station.connectors?.forEach((connector) => connectors.add(connector));
    });
    return Array.from(connectors).sort();
  }, [stations]);

  const parsePowerKw = (power?: string) => {
    if (!power) return null;
    const match = power.match(/([\d.]+)/);
    if (!match) return null;
    return Number(match[1]);
  };

  const haversineDistanceKm = (from: [number, number], to: [number, number]) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const [fromLng, fromLat] = from;
    const [toLng, toLat] = to;
    const earthRadiusKm = 6371;
    const dLat = toRad(toLat - fromLat);
    const dLng = toRad(toLng - fromLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  const stationsWithDistance = useMemo(() => {
    if (!userLocation) return stations;
    return stations.map((station) => {
      const distanceKm = haversineDistanceKm(userLocation, station.coordinates);
      const distanceLabel =
        distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
      return { ...station, distanceKm, distanceLabel };
    });
  }, [stations, userLocation]);

  const filteredStations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const results = stationsWithDistance.filter((station) => {
      const matchesQuery =
        !query ||
        station.name.toLowerCase().includes(query) ||
        station.city?.toLowerCase().includes(query) ||
        station.address?.toLowerCase().includes(query);
      const matchesConnector =
        selectedConnector === 'all' ||
        station.connectors?.some((connector) => connector === selectedConnector);
      const matchesAvailability =
        availabilityFilter === 'all' ||
        (availabilityFilter === 'unknown'
          ? !station.availability || station.availability === 'unknown'
          : station.availability === availabilityFilter);
      const matchesOpenNow = !openNowOnly || station.open24_7;
      const powerKw = parsePowerKw(station.power);
      const matchesFast = !fastOnly || (powerKw !== null && powerKw >= 50);

      return (
        matchesQuery &&
        matchesConnector &&
        matchesAvailability &&
        matchesOpenNow &&
        matchesFast
      );
    });

    if (userLocation) {
      return results.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
    return results;
  }, [
    stationsWithDistance,
    searchQuery,
    selectedConnector,
    availabilityFilter,
    openNowOnly,
    fastOnly,
    userLocation
  ]);

  const nearestStation = useMemo(() => {
    if (!userLocation || filteredStations.length === 0) return null;
    return filteredStations.reduce((closest, station) => {
      if (!station.distanceKm) return closest;
      if (!closest?.distanceKm) return station;
      return station.distanceKm < closest.distanceKm ? station : closest;
    }, filteredStations[0]);
  }, [filteredStations, userLocation]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude]);
        setLocationStatus('idle');
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <>
      <Helmet>
        <title>ChargeCyprus - Find EV Charging Stations</title>
        <meta
          name="description"
          content="Discover electric vehicle charging stations across Cyprus. Find fast chargers, connector types, and plan your next EV trip."
        />
        <meta
          name="keywords"
          content="Cyprus, EV charging, electric vehicles, fast chargers, charging stations, map"
        />
        <link rel="canonical" href="https://chargecyprus.app" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main>
          <HeroSection />

          <StatsSection />

          {/* Map Section */}
          <section id="map" className="py-16 px-4">
            <div className="container">
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
                  Interactive Charging Map
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Explore EV charging locations across Cyprus and select a station to see details.
                </p>
              </div>

              <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-xl border bg-background p-4 shadow-soft">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Find stations near you</p>
                  <p className="text-xs text-muted-foreground">
                    Share your location to highlight the closest available chargers.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={requestLocation}
                    variant="default"
                    className="gap-2"
                    disabled={locationStatus === 'loading'}
                  >
                    <Navigation className="w-4 h-4" />
                    {locationStatus === 'loading' ? 'Locating...' : 'Use my location'}
                  </Button>
                  {userLocation && (
                    <Button variant="outline" onClick={() => setUserLocation(null)}>
                      Clear location
                    </Button>
                  )}
                </div>
              </div>

              {locationStatus === 'denied' && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Location access was denied. You can still browse stations manually or enable
                  location permissions in your browser settings.
                </div>
              )}

              {nearestStation && (
                <div className="mb-6 rounded-xl border bg-muted/30 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Nearest station</p>
                      <p className="font-display font-semibold">{nearestStation.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {nearestStation.distanceLabel} away · {nearestStation.city || 'Cyprus'}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="gap-2"
                      onClick={() => setSelectedStation(nearestStation)}
                    >
                      <MapPin className="w-4 h-4" />
                      View on map
                    </Button>
                  </div>
                </div>
              )}

              <div className="h-[500px] lg:h-[600px]">
                <ChargingStationMap
                  stations={filteredStations}
                  selectedStation={selectedStation}
                  onStationSelect={setSelectedStation}
                  userLocation={userLocation}
                />
              </div>
            </div>
          </section>

          {/* Stations Section */}
          <section id="stations" className="py-16 px-4 bg-muted/30">
            <div className="container">
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
                  All Charging Stations
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  {isLoading
                    ? 'Loading stations...'
                    : `${filteredStations.length} charging stations available across Cyprus`}
                </p>
                <div className="mt-6 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleTheme}
                    aria-label="Toggle theme"
                    title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="gap-2"
                  >
                    {resolvedTheme === 'dark' ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                    <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                  </Button>
                </div>
              </div>

              <div className="mb-8 grid gap-4 rounded-xl border bg-background p-4 shadow-soft md:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Search by city or station name"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <Select value={selectedConnector} onValueChange={setSelectedConnector}>
                  <SelectTrigger>
                    <SelectValue placeholder="Connector type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All connectors</SelectItem>
                    {connectorOptions.map((connector) => (
                      <SelectItem key={connector} value={connector}>
                        {connector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="out_of_service">Out of service</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
                  <span className="text-sm">Open 24/7 only</span>
                  <Switch checked={openNowOnly} onCheckedChange={setOpenNowOnly} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
                  <span className="text-sm">Fast chargers (50kW+)</span>
                  <Switch checked={fastOnly} onCheckedChange={setFastOnly} />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedConnector('all');
                    setAvailabilityFilter('all');
                    setOpenNowOnly(false);
                    setFastOnly(false);
                  }}
                >
                  Reset filters
                </Button>
              </div>

              <div className="max-w-2xl mx-auto">
                <ChargingStationList
                  stations={filteredStations}
                  selectedStation={selectedStation}
                  onSelect={setSelectedStation}
                />
              </div>
            </div>
          </section>

          {/* About Section */}
          <section id="about" className="py-16 px-4">
            <div className="container">
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6">
                  About ChargeCyprus
                </h2>
                <p className="text-muted-foreground mb-6">
                  ChargeCyprus aggregates open data from OpenStreetMap to help drivers discover EV
                  charging infrastructure across the island. Our goal is to make sustainable travel
                  easier by highlighting connector types, fast chargers, and 24/7 locations.
                </p>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Data source:</span>
                  <a
                    href="https://www.openstreetmap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    OpenStreetMap
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="py-8 px-4 border-t">
          <div className="container">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                  <BatteryCharging className="w-4 h-4" />
                </div>
                <span className="font-display font-semibold">ChargeCyprus</span>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Made with <Heart className="w-4 h-4 text-destructive" /> for EV drivers in Cyprus
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Index;
