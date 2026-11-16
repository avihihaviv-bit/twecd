import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';
import { api } from '../lib/api';
import { Card } from './ui';

// NVIDIA exposes no public API for apps to change driver profiles, so this is a guided checklist
// the user completes in NVIDIA Control Panel / NVIDIA App. Progress is saved; values are NOT read from the driver.
const ITEMS: { id: string; setting: string; value: string; why: string }[] = [
  { id: 'power', setting: 'Power management mode', value: 'Prefer maximum performance', why: 'Keeps the RTX 5060 at full clocks in Fortnite instead of down-clocking between frames.' },
  { id: 'lowlat', setting: 'Low Latency Mode', value: 'On (Reflex in Fortnite overrides it)', why: 'Fortnite has NVIDIA Reflex built in; set Reflex to On + Boost in-game. "Ultra" here is not needed.' },
  { id: 'texfilter', setting: 'Texture filtering - Quality', value: 'High performance', why: 'Small GPU saving; no visible change in Performance mode.' },
  { id: 'vsync', setting: 'Vertical sync', value: 'Off', why: 'VSync caps FPS to the refresh rate and adds input lag.' },
  { id: 'maxfps', setting: 'Max Frame Rate', value: 'Off (use Stable FPS Lock in TWECD instead)', why: 'One frame cap is enough; TWECD writes it into Fortnite where it adds the least latency.' },
  { id: 'shader', setting: 'Shader Cache Size', value: 'Driver Default (or 10 GB)', why: 'Avoids re-compiling shaders. Never clear it to "gain FPS".' },
  { id: 'threaded', setting: 'Threaded optimization', value: 'Auto', why: 'Driver default is best for Fortnite.' },
  { id: 'refresh', setting: 'Preferred refresh rate', value: 'Highest available', why: 'Makes sure your 320 Hz monitor is used at its full refresh rate.' },
  { id: 'gsync', setting: 'G-SYNC (Set up G-SYNC)', value: 'Your choice: On with a lock 3 FPS below refresh, or Off for max FPS', why: 'With uncapped FPS far above refresh, G-SYNC is inactive anyway.' },
];

export function NvidiaChecklist() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { api().settingsGet().then(setS); }, []);
  const done = new Set(s?.nvidiaChecklist ?? []);
  const toggle = async (id: string) => {
    const next = done.has(id) ? [...done].filter((x) => x !== id) : [...done, id];
    setS(await api().settingsSet({ nvidiaChecklist: next }));
  };
  return (
    <Card title={`NVIDIA max performance checklist · ${done.size}/${ITEMS.length} done`} right={<button className="btn-ghost !py-1.5 text-sm" onClick={() => api().openExternal('https://www.nvidia.com/en-us/software/nvidia-app/')}>NVIDIA App</button>}>
      <p className="mb-3 text-sm text-muted">Open <b className="text-white">NVIDIA Control Panel &gt; Manage 3D settings &gt; Program Settings &gt; Fortnite</b> and set these. NVIDIA does not let other apps change or read these settings, so TWECD cannot verify them; tick each one as you set it.</p>
      <div className="grid grid-cols-3 gap-3">
        {ITEMS.map((i) => (
          <label key={i.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors ${done.has(i.id) ? 'border-neon/40 bg-neon/[0.04]' : 'border-line bg-panel2/60'}`}>
            <input type="checkbox" className="mt-1 accent-[#39FF14]" checked={done.has(i.id)} onChange={() => toggle(i.id)} />
            <span><b className="text-white">{i.setting}</b><span className="block text-lilac">{i.value}</span><span className="block text-xs text-muted">{i.why}</span></span>
          </label>
        ))}
      </div>
    </Card>
  );
}
