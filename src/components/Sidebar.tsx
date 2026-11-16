import { Activity, Cpu, Gauge, Network, Rocket, Settings, Timer } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../lib/store';

export type PageId = 'boost' | 'stability' | 'hardware' | 'fortnite' | 'network' | 'benchmark' | 'settings';
const NAV: { id: PageId; label: string; icon: typeof Rocket }[] = [
  { id: 'boost', label: 'Boost', icon: Rocket },
  { id: 'stability', label: 'FPS Stability', icon: Activity },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'fortnite', label: 'Fortnite Mode', icon: Gauge },
  { id: 'network', label: 'Ping & Network', icon: Network },
  { id: 'benchmark', label: 'Benchmark', icon: Timer },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ page, onPage }: { page: PageId; onPage: (p: PageId) => void }) {
  const { live } = useApp();
  const fn = live?.fortnite.running;
  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-line bg-[#070a08]/95">
      <div className="drag px-5 pb-6 pt-5"><div className="no-drag inline-block"><Logo /></div></div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((n) => {
          const active = n.id === page;
          const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => onPage(n.id)}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition-all ${active ? 'bg-neon/10 text-neon' : 'text-[#b7c2bc] hover:bg-white/[0.03] hover:text-white'}`}>
              {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-neon shadow-neon" />}
              <Icon size={18} className={active ? 'text-neon' : 'text-muted group-hover:text-white'} />
              {n.label}
              {n.id === 'fortnite' && fn && <span className="ml-auto h-2 w-2 rounded-full bg-neon shadow-neon" title="Fortnite running" />}
            </button>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-panel p-3 text-xs">
        <div className="label mb-1">Fortnite</div>
        <div className={`font-semibold ${fn ? 'text-neon' : 'text-muted'}`}>{fn ? 'Running - monitoring' : 'Not running'}</div>
      </div>
    </aside>
  );
}
