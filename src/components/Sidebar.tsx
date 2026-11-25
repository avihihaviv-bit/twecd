import { Activity, Archive, Cpu, FlaskConical, Gauge, LayoutDashboard, Microchip, MonitorCog, Network, Settings, Timer } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../lib/store';

export type PageId = 'dashboard' | 'diagnostics' | 'windows' | 'nvidia' | 'bios' | 'fortnite' | 'ping' | 'benchmark' | 'lab' | 'backup' | 'settings';
const NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'diagnostics', label: 'System Diagnostics', icon: Cpu },
  { id: 'windows', label: 'Windows Optimization', icon: MonitorCog },
  { id: 'nvidia', label: 'NVIDIA Optimization', icon: Activity },
  { id: 'bios', label: 'BIOS Guide', icon: Microchip },
  { id: 'fortnite', label: 'Fortnite Optimization', icon: Gauge },
  { id: 'ping', label: 'Ping Optimization', icon: Network },
  { id: 'benchmark', label: 'Benchmark', icon: Timer },
  { id: 'lab', label: 'Experiments Lab', icon: FlaskConical },
  { id: 'backup', label: 'Restore & Backup', icon: Archive },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ page, onPage }: { page: PageId; onPage: (p: PageId) => void }) {
  const { live } = useApp();
  const fn = live?.fortnite.running;
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-purple/20 bg-gradient-to-b from-[#120a22] to-[#07040c]">
      <div className="drag px-6 pb-6 pt-6"><div className="no-drag inline-block"><Logo /></div></div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV.map((n) => {
          const active = n.id === page;
          const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => onPage(n.id)}
              className={`group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-left text-[15px] font-semibold transition-all ${active ? 'bg-purple/15 text-lilac shadow-[inset_0_0_20px_rgba(180,76,255,0.12)]' : 'text-[#c4b8dc] hover:bg-white/[0.03] hover:text-white'}`}>
              {active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-purple shadow-purple" />}
              <Icon size={18} className={active ? 'text-purple' : 'text-muted group-hover:text-white'} />
              {n.label}
              {n.id === 'fortnite' && fn && <span className="ml-auto h-2 w-2 rounded-full bg-neon shadow-neon" title="Fortnite running" />}
            </button>
          );
        })}
      </nav>
      <div className="m-3 space-y-2 rounded-xl border border-purple/25 bg-panel p-3 text-xs">
        <div className="flex justify-between"><span className="label">Fortnite</span><span className={`font-semibold ${fn ? 'text-neon' : 'text-muted'}`}>{fn ? 'Running' : 'Not running'}</span></div>
        <div className="flex justify-between"><span className="label">FPS</span><span className="num text-neon">{live?.fps ? Math.round(live.fps.fps) : '-'}</span></div>
        <div className="flex justify-between"><span className="label">1% Low</span><span className="num text-neon">{live?.fps ? Math.round(live.fps.low1) : '-'}</span></div>
        <div className="flex justify-between"><span className="label">Ping</span><span className="num text-white">{live?.net?.latency != null ? `${Math.round(live.net.latency)} ms` : '-'}</span></div>
        <div className="flex justify-between"><span className="label">CPU / GPU</span><span className="num text-white">{live?.cpu.tempC != null ? `${Math.round(live.cpu.tempC)}°` : '-'} / {live?.gpu?.tempC != null ? `${live.gpu.tempC}°` : '-'}</span></div>
      </div>
    </aside>
  );
}
