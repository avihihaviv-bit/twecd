import { useState } from 'react';
import { Sidebar, type PageId } from './components/Sidebar';
import { UpdateBanner } from './components/UpdateBanner';
import { hasBridge } from './lib/api';
import Dashboard from './pages/Dashboard';
import Diagnostics from './pages/Diagnostics';
import WindowsOpt from './pages/WindowsOpt';
import Nvidia from './pages/Nvidia';
import Bios from './pages/Bios';
import FortniteOpt from './pages/FortniteOpt';
import PingOptimizer from './pages/Network';
import Benchmark from './pages/Benchmark';
import Backup from './pages/Backup';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  if (!hasBridge()) return <div className="flex h-full items-center justify-center bg-bg text-muted">TWECD must be opened as the desktop application.</div>;
  return (
    <div className="flex h-full bg-bg bg-grid">
      <Sidebar page={page} onPage={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-[38px] shrink-0" />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto px-8 pb-10">
          <div key={page} className="mx-auto max-w-[2200px]">
            {page === 'dashboard' && <Dashboard onLaunch={() => setPage('fortnite')} onBenchmark={() => setPage('benchmark')} />}
            {page === 'diagnostics' && <Diagnostics onAutoBoost={() => setPage('settings')} />}
            {page === 'windows' && <WindowsOpt onBenchmark={() => setPage('benchmark')} />}
            {page === 'nvidia' && <Nvidia />}
            {page === 'bios' && <Bios />}
            {page === 'fortnite' && <FortniteOpt />}
            {page === 'ping' && <PingOptimizer />}
            {page === 'benchmark' && <Benchmark />}
            {page === 'backup' && <Backup />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </div>
  );
}
