import { useState } from 'react';
import { Sidebar, type PageId } from './components/Sidebar';
import { UpdateBanner } from './components/UpdateBanner';
import { hasBridge } from './lib/api';
import Dashboard from './pages/Dashboard';
import FpsOptimizer from './pages/Stability';
import SystemOptimizer from './pages/Hardware';
import Fortnite from './pages/Fortnite';
import PingOptimizer from './pages/Network';
import Ram from './pages/Ram';
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
            {page === 'dashboard' && <Dashboard onLaunch={() => setPage('fortnite')} onBenchmark={() => setPage('fps')} />}
            {page === 'fps' && <FpsOptimizer />}
            {page === 'ping' && <PingOptimizer />}
            {page === 'fortnite' && <Fortnite />}
            {page === 'system' && <SystemOptimizer />}
            {page === 'ram' && <Ram onAutoBoost={() => setPage('settings')} />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </div>
  );
}
