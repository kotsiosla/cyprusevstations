import { BatteryCharging, Zap, MapPin, ShieldCheck } from 'lucide-react';

const stats = [
  { icon: BatteryCharging, label: 'Charging Stations', value: '120+', color: 'text-primary' },
  { icon: Zap, label: 'Fast Chargers', value: '40+', color: 'text-accent' },
  { icon: MapPin, label: 'Cities Covered', value: '10', color: 'text-primary' },
  { icon: ShieldCheck, label: '24/7 Locations', value: '60+', color: 'text-accent' }
];

const StatsSection = () => {
  return (
    <section className="py-16 px-4">
      <div className="container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="glass p-6 rounded-2xl text-center opacity-0 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s`, animationFillMode: 'forwards' }}
            >
              <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-4">
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="font-display font-bold text-3xl mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
