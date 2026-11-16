import { useState } from 'react';
import { Sidebar, type PageId } from './components/Sidebar';
import { hasBridge } from './lib/api';
import Boost from './pages/Boost';
import Stability from './pages/Stability';
import Hardware from './pages/Hardware';
import Fortnite from './pages/Fortnite';
import Network from './pages/Network';
import Benchmark from './pages/Benchmark';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState<PageId>('boost');
  if (!hasBridge()) {
    return <div className="flex h-full items-center justify-center bg-bg text-muted">TWECD must be opened as the desktop application.</div>;
  }
  return (
    <div className="flex h-full bg-bg bg-grid">
      <Sidebar page={page} onPage={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-[38px] shrink-0" />
        <main className="flex-1 overflow-y-auto px-8 pb-10">
          <div key={page} className="mx-auto max-w-[1400px]">
            {page === 'boost' && <Boost onLaunch={() => setPage('fortnite')} />}
            {page === 'stability' && <Stability />}
            {page === 'hardware' && <Hardware />}
            {page === 'fortnite' && <Fortnite />}
            {page === 'network' && <Network />}
            {page === 'benchmark' && <Benchmark />}
            {page === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </div>
  );
}
