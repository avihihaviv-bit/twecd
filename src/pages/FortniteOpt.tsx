import { useState } from 'react';
import { PageHeader } from '../components/ui';
import Fortnite from './Fortnite';
import Stability from './Stability';

export default function FortniteOpt() {
  const [tab, setTab] = useState<'settings' | 'fps'>('settings');
  return (
    <div className="animate-fadeUp">
      <PageHeader title="FORTNITE OPTIMIZATION" subtitle="Profiles, the Max FPS configuration and Stable FPS Lock, plus real FPS, 1%/0.1% lows, frame times and the bottleneck report from your matches. TWECD edits only Fortnite's settings file (backed up), never the game, its memory or anti-cheat." />
      <div className="mb-6 inline-flex rounded-xl border border-purple/30 bg-black/30 p-1">
        {([['settings', 'Settings & profiles'], ['fps', 'FPS & stability']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${tab === id ? 'bg-purple text-white shadow-purple' : 'text-muted hover:text-white'}`}>{l}</button>
        ))}
      </div>
      {tab === 'settings' ? <Fortnite embedded /> : <Stability embedded />}
      <div className="mt-6 rounded-xl border border-line bg-panel2/50 p-4 text-sm text-muted">
        <b className="text-white">Set in-game (not stored in the file TWECD edits):</b> NVIDIA Reflex On + Boost (Video), Replays Off (Game), Meshes Low (Video, Performance mode), Multithreaded Rendering On (DirectX 12 only). Fortnite updates occasionally rewrite its settings file; Auto Mode re-applies your profile after every match.
      </div>
    </div>
  );
}
