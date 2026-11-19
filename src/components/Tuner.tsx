import { useEffect, useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { api, errMsg, type TuneStepInfo } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card } from './ui';

/** Changes ONE Fortnite setting per click, in the direction the measured bottleneck says will help. */
export function Tuner() {
  const { live } = useApp();
  const [t, setT] = useState<{ kind: string | null; title: string | null; evidence: string[]; step: TuneStepInfo | null; samples: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api().tuneGet().then(setT).catch(() => undefined);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, []);
  const running = live?.fortnite.running ?? false;
  const apply = async () => {
    if (!t?.step || !confirm(`FPS Tuner: ${t.step.label}\n\n${t.step.why}\n\nOnly this one setting changes. Your original Fortnite settings file is backed up (Restore & Backup).`)) return;
    setBusy(true); setMsg(null);
    try { const r = await api().tuneApply(); setMsg({ ok: r.ok, text: r.message }); await load(); } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><SlidersHorizontal size={14} className="text-purple" /> FPS Tuner: next step from your measured bottleneck</span>}
      right={t?.kind ? <Badge tone={t.kind === 'gpu' ? 'info' : 'warn'}>{t.kind.toUpperCase()}-BOUND</Badge> : <Badge tone="muted">NO MATCH DATA</Badge>}>
      {!t?.kind ? (
        <p className="text-sm text-muted">Play one real match (not an empty map) with TWECD running as administrator. The Tuner then knows whether your GPU or CPU limits FPS, and offers the one setting that will actually help: 3D Resolution if GPU-bound, View Distance if CPU-bound.</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto] items-center gap-6">
          <div className="text-sm">
            <div className="text-white">{t.title}</div>
            {t.evidence.slice(0, 2).map((e) => <div key={e} className="text-muted">• {e}</div>)}
            {t.step ? (
              <div className="mt-3 rounded-xl border border-purple/40 bg-purple/[0.06] p-3">
                <div className="label">Next step</div>
                <div className="mt-1 font-display text-lg font-bold text-lilac">{t.step.label} <span className="text-sm font-normal text-muted">(now: {t.step.from ?? 'default'})</span></div>
                <div className="text-[#cfc3e3]">{t.step.why}</div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-warn/40 bg-warn/[0.05] p-3 text-[#e8dcc4]">No further setting would help: {t.kind === 'gpu' ? 'the GPU is already on the lowest sensible settings.' : 'Fortnite is already at the lowest CPU-side settings. The remaining limit is the CPU and memory themselves. Check XMP in the BIOS Guide.'}</div>
            )}
          </div>
          <button className="btn-primary px-6 py-3" disabled={busy || running || !t.step} onClick={apply}>{busy ? <Loader2 size={16} className="animate-spin" /> : <SlidersHorizontal size={16} />} APPLY STEP</button>
        </div>
      )}
      {running && <div className="mt-2 text-xs text-warn">Close Fortnite to apply a step.</div>}
      {msg && <div className={`mt-2 text-sm ${msg.ok ? 'text-neon2' : 'text-bad'}`}>{msg.text}</div>}
      <div className="mt-3 text-xs text-muted">After each step: same scenario, Benchmark, compare. Keep the step only if 1% low or average FPS improved. Undo everything any time in Restore & Backup.</div>
    </Card>
  );
}
