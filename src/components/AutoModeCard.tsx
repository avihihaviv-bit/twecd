import { useEffect, useState } from 'react';
import { Bot, Loader2, RefreshCw } from 'lucide-react';
import type { AutoModeStatus, FortniteProfileId, Settings } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { Badge } from './ui';

const PROFILES: { id: FortniteProfileId; name: string }[] = [
  { id: 'high-fps', name: 'High FPS' }, { id: 'ultra', name: 'Ultra FPS (CPU-bound)' }, { id: 'competitive', name: 'Competitive' }, { id: 'stability', name: 'Frame Time Stability' },
];

/** One switch: TWECD keeps Windows + Fortnite on the best safe settings and sets the FPS lock from measured data. */
export function AutoModeCard({ compact }: { compact?: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [st, setSt] = useState<AutoModeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api().settingsGet().then(setS); api().autoGet().then(setSt); return api().onAutoStatus(setSt); }, []);
  const patch = async (p: Partial<Settings>) => { try { setS(await api().settingsSet(p)); } catch (e) { setErr(errMsg(e)); } };

  const toggle = async () => {
    if (!s) return;
    if (!s.autoMode && !confirm('Turn on AUTO MODE?\n\nTWECD will automatically, at startup and after every match:\n- Keep Game Mode on, the high-performance power plan, Game Bar capture and background recording off, windowed-game optimizations on, and Fortnite on the NVIDIA GPU\n- Keep Fortnite on your chosen profile\n- Optional (off by default): cap FPS for smoother frame times. A cap limits maximum FPS.\n\nIt never closes apps, deletes files, or touches security settings. Every change is logged and can be undone in Settings > Restore.')) return;
    setBusy(true); await patch({ autoMode: !s.autoMode }); setBusy(false);
  };

  const on = !!s?.autoMode;
  return (
    <section className={`card relative overflow-hidden p-5 ${on ? 'border-purple/60 shadow-purple' : 'border-purple/25'}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_160px_at_15%_0%,rgba(180,76,255,0.16),transparent_70%)]" />
      <div className="relative flex flex-wrap items-center gap-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${on ? 'bg-purple text-white shadow-purple' : 'bg-purple/15 text-purple'}`}><Bot size={24} /></div>
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2"><span className="title-glow font-display text-lg font-extrabold tracking-[0.14em]">AUTO MODE</span>{on ? <Badge tone="good">ON</Badge> : <Badge tone="muted">OFF</Badge>}</div>
          <div className="text-sm text-[#c9b8e6]">Keeps Windows and Fortnite on the best settings automatically.{s?.autoLock ? ` Also caps FPS at ${s.autoLockTarget} when your PC can hold it (a cap limits max FPS).` : ' FPS stays unlimited.'}</div>
        </div>
        {!compact && s && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><span className="label">Profile</span>
              <select id="auto-profile" value={s.autoProfile} onChange={(e) => patch({ autoProfile: e.target.value as FortniteProfileId })} className="rounded-lg border border-purple/30 bg-black/50 px-2 py-1.5 text-white">{PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="flex items-center gap-2"><input id="auto-lock" type="checkbox" className="accent-[#B44CFF]" checked={s.autoLock} onChange={(e) => patch({ autoLock: e.target.checked })} /><span title="A lock is a ceiling: FPS can never go above it. It makes frame times flatter but lowers peak FPS.">Cap FPS for smoothness (limits max FPS) at</span>
              <select id="auto-lock-target" value={s.autoLockTarget} onChange={(e) => patch({ autoLockTarget: +e.target.value })} className="rounded-lg border border-purple/30 bg-black/50 px-2 py-1.5 text-white">{[240, 320, 360, 400, 450, 500, 600].map((v) => <option key={v} value={v}>{v} FPS</option>)}</select>
            </label>
          </div>
        )}
        <div className="flex items-center gap-2">
          {on && <button className="btn-ghost !py-2 text-sm" disabled={busy} onClick={async () => { setBusy(true); try { setSt(await api().autoRun()); } finally { setBusy(false); } }}><RefreshCw size={14} /> Run now</button>}
          <button onClick={toggle} disabled={!s || busy} aria-label="Toggle Auto Mode" className={`relative h-9 w-[74px] rounded-full border transition-colors ${on ? 'border-purple bg-purple/40' : 'border-line bg-black/40'}`}>
            <span className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full transition-all ${on ? 'left-[42px] bg-purple shadow-purple' : 'left-1 bg-[#4a3b66]'}`}>{busy && <Loader2 size={14} className="animate-spin text-white" />}</span>
          </button>
        </div>
      </div>
      {on && st?.lastRun && (
        <div className="relative mt-4 grid grid-cols-[1fr_1fr] gap-4 border-t border-purple/20 pt-3 text-[13px]">
          <div><span className="label">Last run</span> <span className="text-white">{new Date(st.lastRun).toLocaleTimeString()} ({st.trigger})</span>
            <div className="mt-1 text-[#cfc3e3]">{st.changed.length ? <>Changed: <span className="text-neon">{st.changed.join(', ')}</span></> : 'Everything was already optimal.'}{st.skipped ? ` · ${st.skipped} already set` : ''}</div>
            {st.failed.length > 0 && <div className="mt-1 text-bad">{st.failed.join(' · ')}</div>}
          </div>
          {st.lock && <div><span className="label">FPS lock</span><div className="mt-1 text-lilac">{st.lock}</div></div>}
        </div>
      )}
      {err && <div className="relative mt-2 text-sm text-bad">{err}</div>}
    </section>
  );
}
