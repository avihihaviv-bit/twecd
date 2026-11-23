import { useEffect, useState } from 'react';
import { Lock, Loader2, Unlock } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useApp } from '../lib/store';

/** Never let an FPS cap be silent: a cap is a ceiling on max FPS. */
export function LockBanner() {
  const { live } = useApp();
  const [cap, setCap] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api().fortniteConfig().then((c) => setCap(c.found && c.frameRateLimit ? Math.round(c.frameRateLimit) : null)).catch(() => undefined);
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, []);
  if (!cap) return null;
  const running = live?.fortnite.running ?? false;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-warn/50 bg-warn/[0.07] px-5 py-4">
      <Lock size={20} className="text-warn" />
      <div className="min-w-[280px] flex-1 text-sm">
        <div className="font-display font-bold tracking-wide text-warn">FPS LOCK ACTIVE: {cap} FPS</div>
        <div className="text-[#e8dcc4]">Fortnite cannot go above {cap} FPS while this lock is set, even in empty maps. Remove it for maximum FPS; keep it only if you prefer flatter frame times.</div>
        {msg && <div className="mt-1 text-neon2">{msg}</div>}
      </div>
      <button className="btn-go" disabled={busy || running} title={running ? 'Close Fortnite first' : ''} onClick={async () => {
        setBusy(true); setMsg(null);
        try { const r = await api().setFortniteCap(0); setMsg(r.message); if (r.ok) setCap(null); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
      }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />} SET UNLIMITED</button>
      {running && <span className="text-xs text-warn">Close Fortnite to change it.</span>}
    </div>
  );
}
