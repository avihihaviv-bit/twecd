import { useEffect, useState } from 'react';
import { Lock, Loader2, Unlock } from 'lucide-react';
import type { SessionSummary } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { useApp } from '../lib/store';
import { Card } from './ui';

/** Stable FPS Lock: recommends a cap from the user's REAL measured match FPS and writes it to Fortnite's settings. */
export function FpsLock() {
  const { live, info } = useApp();
  const [sess, setSess] = useState<SessionSummary | null>(null);
  const [cap, setCap] = useState<number | null | undefined>(undefined);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const running = live?.fortnite.running ?? false;

  const loadCap = () => api().fortniteConfig().then((c) => setCap(c.found ? c.frameRateLimit ?? null : undefined));
  useEffect(() => {
    loadCap();
    const tick = () => api().session().then((s) => setSess(s.current ?? s.last));
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, []);

  const apply = async (v: number) => {
    setBusy(true); setMsg(null);
    try { const r = await api().setFortniteCap(v); setMsg({ ok: r.ok, text: r.message }); await loadCap(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  };

  const rec = sess?.recommendedCap ?? null;
  const need = Math.max(0, 60 - (sess?.fpsSamples ?? 0));
  const customNum = parseInt(custom, 10);
  const customOk = Number.isInteger(customNum) && customNum >= 30 && customNum <= 1000;
  const disabled = busy || running || !info?.isWindows || cap === undefined;

  return (
    <Card title={<span className="flex items-center gap-2"><Lock size={14} className="text-neon" /> Stable FPS Lock</span>}
      right={<span className="text-xs text-muted">Current: <b className="text-white">{cap === undefined ? 'Unavailable' : cap === null || cap === 0 ? 'Unlimited' : `${Math.round(cap)} FPS`}</b></span>}>
      <p className="text-sm text-[#cfc3e3]">FPS that jumps between highs and lows feels choppy. Locking slightly below what your PC holds most of the time gives flat, even frame times, which feels smoother than a higher but unstable number.</p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Box k="Last match avg" v={sess?.avgFps != null ? Math.round(sess.avgFps).toString() : null} />
        <Box k="Held 90% of the time" v={sess?.sustainedFps != null ? Math.round(sess.sustainedFps).toString() : null} />
        <Box k="Recommended lock" v={rec !== null ? rec.toString() : null} neon />
      </div>
      {rec === null && <div className="mt-2 text-xs text-muted">{sess && sess.fpsSamples > 0 ? `Keep playing: ${need} more seconds of measured FPS needed.` : 'Turn on "Record every match" in Settings (TWECD as administrator) and play one match to get your personal recommendation.'}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary px-6" disabled={disabled || rec === null} onClick={() => apply(rec!)}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} LOCK AT {rec ?? '...'} FPS
        </button>
        <input id="fps-lock-custom" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} placeholder="Custom" className="w-24 rounded-lg border border-line bg-black/30 px-2 py-2 text-sm outline-none focus:border-neon/50" />
        <button className="btn-ghost" disabled={disabled || !customOk} onClick={() => apply(customNum)}>Lock</button>
        <button className="btn-ghost ml-auto" disabled={disabled || !cap} onClick={() => apply(0)}><Unlock size={15} /> Unlimited</button>
      </div>
      {running && <div className="mt-2 text-xs text-warn">Close Fortnite to change the lock (the game overwrites its settings when it exits).</div>}
      {msg && <div className={`mt-2 text-sm ${msg.ok ? 'text-neon2' : 'text-bad'}`}>{msg.text}</div>}
    </Card>
  );
}

function Box({ k, v, neon }: { k: string; v: string | null; neon?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${neon ? 'border-neon/30 bg-neon/[0.04]' : 'border-line bg-panel2/60'}`}>
      <div className="label">{k}</div>
      <div className={`num mt-1 font-bold ${v === null ? 'text-sm text-[#6b5d85]' : neon ? 'text-2xl text-neon' : 'text-2xl text-white'}`}>{v ?? 'Unavailable'}</div>
    </div>
  );
}
