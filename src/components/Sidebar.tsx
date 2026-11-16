import { Activity, Cpu, Gauge, LayoutDashboard, MemoryStick, Network, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../lib/store';

export type PageId = 'dashboard' | 'fps' | 'ping' | 'fortnite' | 'system' | 'ram' | 'settings';
const NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'fps', label: 'FPS Optimizer', icon: Activity },
  { id: 'ping', label: 'Ping Optimizer', icon: Network },
  { id: 'fortnite', label: 'Fortnite Mode', icon: Gauge },
  { id: 'system', label: 'System Optimizer', icon: Cpu },
  { id: 'ram', label: 'RAM Optimizer', icon: MemoryStick },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ page, onPage }: { page: PageId; onPage: (p: PageId) => void }) {
  const { live } = useApp();
  const fn = live?.fortnite.running;
  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r border-line bg-[#070a08]/95">
      <div className="drag px-6 pb-7 pt-6"><div className="no-drag inline-block"><Logo /></div></div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((n) => {
          const active = n.id === page;
          const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => onPage(n.id)}
              className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-left text-[15.5px] font-semibold transition-all ${active ? 'bg-neon/10 text-neon' : 'text-[#b7c2bc] hover:bg-white/[0.03] hover:text-white'}`}>
              {active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-neon shadow-neon" />}
              <Icon size={19} className={active ? 'text-neon' : 'text-muted group-hover:text-white'} />
              {n.label}
              {n.id === 'fortnite' && fn && <span className="ml-auto h-2 w-2 rounded-full bg-neon shadow-neon" title="Fortnite running" />}
            </button>
          );
        })}
      </nav>
      <div className="m-3 space-y-2 rounded-xl border border-line bg-panel p-3 text-xs">
        <div className="flex justify-between"><span className="label">Fortnite</span><span className={`font-semibold ${fn ? 'text-neon' : 'text-muted'}`}>{fn ? 'Running' : 'Not running'}</span></div>
        <div className="flex justify-between"><span className="label">FPS</span><span className="num text-white">{live?.fps ? Math.round(live.fps.fps) : '-'}</span></div>
        <div className="flex justify-between"><span className="label">Ping</span><span className="num text-white">{live?.net?.latency != null ? `${Math.round(live.net.latency)} ms` : '-'}</span></div>
      </div>
    </aside>
  );
}
