import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, HelpCircle, Loader2, MinusCircle, RotateCcw, ShieldAlert, Zap } from 'lucide-react';
import type { OptStatus, OptimizationId } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, PageHeader } from '../components/ui';

/** One change at a time: live state of every optimization, with Apply and Undo per item. */
export default function WindowsOpt({ onBenchmark }: { onBenchmark: () => void }) {
  const { info } = useApp();
  const [list, setList] = useState<OptStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [startup, setStartup] = useState<{ name: string; command: string; enabled: boolean; essential: boolean }[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const load = () => api().optStatus().then(setList).catch(() => setList([]));
  useEffect(() => { load(); api().startupList().then(setStartup).catch(() => undefined); }, []);

  const apply = async (s: OptStatus) => {
    const extra = s.id === 'startup-apps-off' ? [...pick] : [];
    if (s.id === 'startup-apps-off' && !extra.length) { setMsg((m) => ({ ...m, [s.id]: { ok: false, text: 'Tick the startup apps to disable first.' } })); return; }
    if (!confirm(`${s.title}\n\n${s.why}\n\nRisk: ${s.risk}. ${s.rebootRequired ? 'Needs a PC restart. ' : ''}The original value is saved and this can be undone at any time.`)) return;
    setBusy(s.id);
    try {
      const r = await api().apply({ ids: [s.id], startupNames: extra });
      const x = r.results[0];
      setMsg((m) => ({ ...m, [s.id]: { ok: x.status !== 'failed', text: `${x.status.toUpperCase()}: ${x.message}${x.verified ? ' (verified)' : ''}` } }));
      await load();
    } catch (e) { setMsg((m) => ({ ...m, [s.id]: { ok: false, text: errMsg(e) } })); } finally { setBusy(null); }
  };
  const undo = async (id: OptimizationId) => {
    setBusy(id);
    try { const r = await api().restore([id]); setMsg((m) => ({ ...m, [id]: { ok: r[0]?.status === 'success', text: r[0]?.message ?? 'Nothing to restore.' } })); await load(); } finally { setBusy(null); }
  };

  const groups: OptStatus['area'][] = ['Fortnite', 'Windows', 'Graphics', 'Network'];
  const todo = list?.filter((s) => s.state === 'not-optimal').length ?? 0;
  return (
    <div className="animate-fadeUp">
      <PageHeader title="WINDOWS OPTIMIZATION" subtitle="Live state of every safe, reversible optimization, read from Windows right now. Change one thing, benchmark, compare, then continue. Nothing here disables Defender, Firewall, Windows Update or system services."
        right={<button className="btn-ghost" onClick={load}>Re-check</button>} />
      <div className="mb-6 grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-purple/30 bg-purple/[0.06] p-4">
        <div className="text-sm text-[#d9c6f5]"><b className="text-white">Recommended workflow:</b> run a Benchmark (same Fortnite scenario) → apply ONE item below → benchmark again → keep it only if the measured result is equal or better. {info && !info.isAdmin && <span className="text-warn">Some items need administrator rights: Settings &gt; Restart as administrator.</span>}</div>
        <button className="btn-primary" onClick={onBenchmark}>Open Benchmark</button>
      </div>
      {list === null ? <div className="text-muted"><Loader2 className="mr-2 inline animate-spin" size={16} />Reading current settings...</div> : (
        <div className="space-y-6">
          <div className="text-sm text-muted">{list.every((x) => x.state === 'unavailable') ? 'These settings can only be read and changed on Windows.' : todo ? <><b className="text-lilac">{todo}</b> item{todo > 1 ? 's are' : ' is'} not optimal.</> : `Everything TWECD can check is optimal${list.some((x) => x.state === 'unknown') ? ' (items marked ? need administrator rights to read)' : ''}.`}</div>
          {groups.map((g) => {
            const items = list.filter((s) => s.area === g);
            if (!items.length) return null;
            return (
              <Card key={g} title={g}>
                <div className="space-y-3">
                  {items.map((s) => (
                    <div key={s.id} className={`rounded-xl border p-4 ${s.state === 'not-optimal' ? 'border-purple/40 bg-purple/[0.04]' : 'border-line bg-panel2/50'}`}>
                      <div className="grid grid-cols-[28px_1fr_auto] items-start gap-3">
                        <StateIcon s={s.state} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{s.title}</span>
                            <Badge tone={s.impact === 'high' ? 'bad' : s.impact === 'medium' ? 'warn' : 'muted'}>{s.impact.toUpperCase()} IMPACT</Badge>
                            <Badge tone={s.risk === 'none' ? 'good' : s.risk === 'low' ? 'info' : 'warn'}>RISK: {s.risk.toUpperCase()}</Badge>
                            {s.needsAdmin && <Badge tone="info">ADMIN</Badge>}{s.rebootRequired && <Badge tone="info">RESTART PC</Badge>}
                          </div>
                          <div className="mt-1 text-sm"><span className="label mr-2">Now</span><span className={s.state === 'optimal' ? 'text-neon2' : s.state === 'not-optimal' ? 'text-lilac' : 'text-muted'}>{s.current}</span></div>
                          <div className="mt-0.5 text-sm text-muted">{s.why}</div>
                          {s.id === 'startup-apps-off' && s.state === 'not-optimal' && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {startup.filter((e) => e.enabled && !e.essential).map((e) => (
                                <label key={e.name} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-sm" title={e.command}>
                                  <input type="checkbox" className="accent-[#B44CFF]" checked={pick.has(e.name)} onChange={() => setPick((p) => { const n = new Set(p); if (n.has(e.name)) n.delete(e.name); else n.add(e.name); return n; })} />
                                  <span className="truncate">{e.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {msg[s.id] && <div className={`mt-2 text-sm ${msg[s.id].ok ? 'text-neon2' : 'text-bad'}`}>{msg[s.id].text}</div>}
                        </div>
                        <div className="flex gap-2">
                          {s.restorable && <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={!!busy} onClick={() => undo(s.id)}><RotateCcw size={13} /> Undo</button>}
                          {s.state === 'not-optimal' && <button className="btn-primary !px-4 !py-1.5 text-sm" disabled={!!busy || (s.needsAdmin && !info?.isAdmin)} onClick={() => apply(s)}>{busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Apply</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          <OverlaysCard />
          <SecurityTradeoff />
          <Card title="Checked, but intentionally not changed">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ['Fullscreen optimizations', 'Kept on: on Windows 11 they enable the flip model with lower latency. Fortnite exclusive fullscreen is set in the game profile.'],
                ['Background apps (global switch)', 'Breaks notifications and updates with no measurable FPS gain. TWECD closes specific apps instead (Auto-Boost).'],
                ['Windows Security / Defender', 'Never disabled or excluded. Real-time scanning has negligible impact while a game runs; scheduled scans run when the PC is idle.'],
                ['Windows Update & Gaming Services', 'Never disabled. Game Mode already pauses update installs while you play.'],
                ['Power Mode slider', 'Does not apply while the Ultimate/High Performance plan is active.'],
                ['"Gaming registry tweaks" (Win32PrioritySeparation, network throttling index, etc.)', 'Not applied: no measured benefit on Windows 11, and some cause audio or input problems.'],
              ].map(([t, r]) => <div key={t}><div className="flex items-center gap-2 font-semibold text-white"><ShieldAlert size={14} className="text-purple" />{t}</div><div className="text-muted">{r}</div></div>)}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function StateIcon({ s }: { s: OptStatus['state'] }) {
  if (s === 'optimal') return <CheckCircle2 size={22} className="text-neon" />;
  if (s === 'not-optimal') return <CircleAlert size={22} className="text-purple" />;
  if (s === 'unknown') return <HelpCircle size={22} className="text-muted" />;
  return <MinusCircle size={22} className="text-muted" />;
}

/** Memory Integrity / VBS: a real but security-relevant performance cost. Shown, never changed by TWECD. */
function SecurityTradeoff() {
  const [v, setV] = useState<{ memoryIntegrity: boolean | null; vbsRunning: boolean | null } | null>(null);
  useEffect(() => { api().vbs().then(setV).catch(() => setV({ memoryIntegrity: null, vbsRunning: null })); }, []);
  const on = v?.memoryIntegrity === true || v?.vbsRunning === true;
  return (
    <Card title="Security trade-off: your decision">
      <div className="grid grid-cols-[1fr_auto] items-start gap-6">
        <div className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">Memory Integrity (Core isolation) / Virtualization-based security</span>
            {v === null ? <Badge tone="muted">CHECKING</Badge> : on ? <Badge tone="warn">ON</Badge> : v.memoryIntegrity === false && v.vbsRunning === false ? <Badge tone="good">OFF</Badge> : <Badge tone="muted">UNKNOWN</Badge>}
            <Badge tone="warn">RISK: MEDIUM (SECURITY)</Badge>
          </div>
          <p className="mt-2 text-[#cfc3e3]">Microsoft states that Memory Integrity and the Virtual Machine Platform can reduce gaming performance, and suggests gamers may turn them off while playing and back on afterwards. In CPU-bound games the measured difference is usually a few percent, not a doubling.</p>
          <p className="mt-1 text-muted">It protects Windows against malicious drivers. TWECD will not change it for you. If you choose to: Windows Security &gt; Device security &gt; Core isolation &gt; Memory integrity Off, restart, benchmark. If the gain is not worth it to you, turn it back on.</p>
        </div>
        <button className="btn-ghost" onClick={() => api().openExternal('windowsdefender://coreisolation')}>Open Core isolation</button>
      </div>
    </Card>
  );
}

/** Overlays and recorders running right now, plus input-device advice for a CPU-bound PC. */
function OverlaysCard() {
  const [list, setList] = useState<{ name: string; advice: string }[] | null>(null);
  const load = () => api().overlays().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return (
    <Card title="Overlays, recorders & input devices" right={<button className="btn-ghost !py-1.5 text-sm" onClick={load}>Re-check</button>}>
      <div className="space-y-2 text-sm">
        {list === null ? <div className="text-muted">Checking running apps...</div> : list.length === 0 ? <div className="text-neon2">No FPS-costing overlays or background recorders are running.</div> : list.map((o) => (
          <div key={o.name} className="flex items-start gap-3 rounded-lg border border-line bg-panel2/60 p-3"><Badge tone="warn">{o.name}</Badge><span className="text-[#cfc3e3]">{o.advice}</span></div>
        ))}
        <div className="mt-3 rounded-lg border border-purple/30 bg-purple/[0.05] p-3 text-[#d9c6f5]">
          <b className="text-white">Mouse polling rate:</b> your PC is CPU-bound in Fortnite, and every mouse report costs CPU time. 4000-8000 Hz can lower FPS and 1% lows; <b className="text-white">1000-2000 Hz</b> is the right range. Change it in your mouse's software and compare with a Benchmark.
        </div>
      </div>
    </Card>
  );
}
