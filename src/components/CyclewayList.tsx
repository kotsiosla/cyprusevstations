import { Cycleway } from '@/lib/cycleways';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CyclewayListProps {
  cycleways: Cycleway[];
  selectedCycleway?: Cycleway | null;
  onSelect: (cycleway: Cycleway) => void;
}

const CyclewayList = ({ cycleways, selectedCycleway, onSelect }: CyclewayListProps) => {
  return (
    <div className="space-y-3">
      {cycleways.map((cycleway, index) => (
        <Card
          key={cycleway.id}
          variant="interactive"
          onClick={() => onSelect(cycleway)}
          className={cn(
            "opacity-0 animate-slide-up",
            selectedCycleway?.id === cycleway.id && "ring-2 ring-primary shadow-glow"
          )}
          style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-medium text-sm truncate">
                    {cycleway.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cycleway.coordinates.length} points
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {((cycleway.coordinates.length - 1) * 0.1).toFixed(1)} km
                </Badge>
                <ArrowRight className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  selectedCycleway?.id === cycleway.id && "text-primary translate-x-1"
                )} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CyclewayList;
