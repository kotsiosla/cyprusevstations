import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import StatsSection from '@/components/StatsSection';
import ChargingStationMap from '@/components/ChargingStationMap';
import ChargingStationList from '@/components/ChargingStationList';
import { fetchChargingStations, sampleChargingStations, ChargingStation } from '@/lib/chargingStations';
import { Helmet } from 'react-helmet-async';
import { BatteryCharging, Heart } from 'lucide-react';

const Index = () => {
  const [stations, setStations] = useState<ChargingStation[]>(sampleChargingStations);
  const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStations = async () => {
      try {
        const data = await fetchChargingStations();
        if (data.length > 0) {
          setStations(data);
        }
      } catch (error) {
        console.error('Failed to load charging stations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStations();
  }, []);

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

              <div className="h-[500px] lg:h-[600px]">
                <ChargingStationMap
                  stations={stations}
                  selectedStation={selectedStation}
                  onStationSelect={setSelectedStation}
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
                    : `${stations.length} charging stations available across Cyprus`}
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                <ChargingStationList
                  stations={stations}
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
