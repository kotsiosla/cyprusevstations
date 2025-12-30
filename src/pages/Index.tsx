import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import StatsSection from '@/components/StatsSection';
import CyclewayMap from '@/components/CyclewayMap';
import CyclewayList from '@/components/CyclewayList';
import { fetchCycleways, sampleCycleways, Cycleway } from '@/lib/cycleways';
import { Helmet } from 'react-helmet-async';
import { Bike, Heart } from 'lucide-react';

const Index = () => {
  const [cycleways, setCycleways] = useState<Cycleway[]>(sampleCycleways);
  const [selectedCycleway, setSelectedCycleway] = useState<Cycleway | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCycleways = async () => {
      try {
        const data = await fetchCycleways();
        if (data.length > 0) {
          setCycleways(data);
        }
      } catch (error) {
        console.error('Failed to load cycleways:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCycleways();
  }, []);

  return (
    <>
      <Helmet>
        <title>CyprusCycle - Discover Cyprus Cycling Lanes</title>
        <meta name="description" content="Explore the complete network of cycling infrastructure across Cyprus. Plan your routes, find safe paths, and enjoy cycling in Cyprus." />
        <meta name="keywords" content="Cyprus, cycling, bike lanes, cycleways, routes, outdoor, sports" />
        <link rel="canonical" href="https://cypruscycle.app" />
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
                  Interactive Map
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Explore all cycling lanes across Cyprus. Click on any route for details.
                </p>
              </div>
              
              <div className="h-[500px] lg:h-[600px]">
                <CyclewayMap 
                  cycleways={cycleways}
                  selectedCycleway={selectedCycleway}
                  onCyclewaySelect={setSelectedCycleway}
                />
              </div>
            </div>
          </section>

          {/* Routes Section */}
          <section id="routes" className="py-16 px-4 bg-muted/30">
            <div className="container">
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
                  All Cycling Routes
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  {isLoading ? 'Loading routes...' : `${cycleways.length} routes available across Cyprus`}
                </p>
              </div>
              
              <div className="max-w-2xl mx-auto">
                <CyclewayList 
                  cycleways={cycleways}
                  selectedCycleway={selectedCycleway}
                  onSelect={setSelectedCycleway}
                />
              </div>
            </div>
          </section>

          {/* About Section */}
          <section id="about" className="py-16 px-4">
            <div className="container">
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6">
                  About This Project
                </h2>
                <p className="text-muted-foreground mb-6">
                  CyprusCycle uses open data from the Cyprus Ministry of Transport to help cyclists 
                  discover and navigate the island's cycling infrastructure. Our goal is to promote 
                  sustainable transportation and make cycling in Cyprus safer and more accessible.
                </p>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Data source:</span>
                  <a 
                    href="https://traffic4cyprus.org.cy/dataset/cycleways" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    traffic4cyprus.org.cy
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
                  <Bike className="w-4 h-4" />
                </div>
                <span className="font-display font-semibold">CyprusCycle</span>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Made with <Heart className="w-4 h-4 text-destructive" /> for cyclists in Cyprus
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Index;
