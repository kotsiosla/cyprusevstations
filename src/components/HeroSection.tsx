import { Button } from '@/components/ui/button';
import { BatteryCharging, ChevronDown, MapPin, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const HeroSection = () => {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 20%, transparent 80%, hsl(var(--background)) 100%),
                            linear-gradient(135deg, hsl(199 89% 48% / 0.15) 0%, hsl(25 95% 53% / 0.1) 100%)`
        }}
      />

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float"
        style={{ animationDelay: '2s' }}
      />

      <div className="container relative z-10 text-center px-4">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 opacity-0 animate-slide-up">
            <BatteryCharging className="w-4 h-4" />
            Cyprus EV Charging Network
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 opacity-0 animate-slide-up stagger-1">
            Power Up Across
            <span className="block text-gradient">Cyprus</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 opacity-0 animate-slide-up stagger-2">
            Find fast, reliable electric vehicle charging stations across the island.
            Compare connector types, plan your stops, and charge with confidence.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-slide-up stagger-3">
            <Button variant="hero" size="xl" asChild>
              <a href="#map">
                <MapPin className="w-5 h-5" />
                Explore Map
              </a>
            </Button>
            <Button variant="glass" size="xl" asChild>
              <a href="#stations">View All Stations</a>
            </Button>
          </div>
          <div className="mt-5 flex justify-center opacity-0 animate-slide-up stagger-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="gap-2"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <a
          href="#map"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-colors opacity-0 animate-fade-in"
          style={{ animationDelay: '1s', animationFillMode: 'forwards' }}
        >
          <span className="text-xs uppercase tracking-wider">Scroll</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </a>
      </div>
    </section>
  );
};

export default HeroSection;
