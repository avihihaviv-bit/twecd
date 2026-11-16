import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, MinusCircle, Play, Rocket, ScanSearch, ShieldCheck, XCircle, Zap } from 'lucide-react';
import type { ApplyStatus, OptimizationId, Recommendation, ScanStep, Severity, StepStatus } from '../../shared/types';
import { api, errMsg, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, Stat } from '../components/ui';

const STEP_LABELS: [ScanStep['id'], string][] = [
  ['cpu', 'Scan CPU'], ['gpu', 'Scan GPU'], ['vram', 'Scan VRAM'], ['ram', 'Scan RAM'], ['processes', 'Scan running processes'],
  ['fortnite-config', 'Analyze Fortnite configuration'], ['game-mode', 'Check Windows Game Mode'], ['power', 'Inspect power settings'],
  ['network', 'Check network stability'], ['bottlenecks', 'Identify performance bottlenecks'],
];
const initialSteps = (): ScanStep[] => STEP_LABELS.map(([id, label]) => ({ id, label, status: 'pending', summary: '' }));

export default function Boost({ onLaunch }: { onLaunch: () => void }) {
  const { boost, setBoost, live, info } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pids, setPids] = useState<Set<number>>(new Set());
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);

  useEffect(() => api().onScanStep((s) => setBoost((b) => ({ ...b, steps: b.steps.map((x) => (x.id === s.id ? s : x)) }))), [setBoost]);

  const start = async (mode: 'scan' | 'boost') => {
    setBoost(() => ({ phase: 'scanning', mode, steps: initialSteps(), result: null, applied: null, error: null }));
    try {
      const result = await api().scan();
      setSelected(new Set(result.recommendations.filter((r) => r.selectedByDefault && r.optimizationId).map((r) => r.id)));
      setPids(new Set());
      setBoost((b) => ({ ...b, phase: 'review', result, steps: result.steps }));
    } catch (e) { setBoost((b) => ({ ...b, phase: 'idle', error: errMsg(e) })); }
  };

  const recs = boost.result?.recommendations ?? [];
  const actionable = recs.filter((r) => r.optimizationId);
  const manual = recs.filter((r) => !r.optimizationId);
  const chosen = actionable.filter((r) => selected.has(r.id));

  const apply = async () => {
    const ids = chosen.map((r) => r.optimizationId!) as OptimizationId[];
    if (!ids.length) return;
    const closeRec = chosen.find((r) => r.optimizationId === 'close-background-apps');
    const names = closeRec ? (closeRec.processes ?? []).filter((p) => pids.has(p.pid)).map((p) => p.name) : [];
    const summary = chosen.map((r) => `- ${r.title}${!r.reversible ? '  (cannot be undone)' : ''}`).join('\n');
    if (!window.confirm(`Apply these ${ids.length} optimization(s)?\n\n${summary}${names.length ? `\n\nApps that will be closed (save your work first):\n${[...new Set(names)].join(', ')}` : ''}\n\nOriginal settings are saved. Use "Restore Defaults" in Settings to undo.`)) return;
    setBoost((b) => ({ ...b, phase: 'applying' }));
    try {
      const applied = await api().apply({ ids, pids: [...pids] });
      setBoost((b) => ({ ...b, phase: 'done', applied }));
    } catch (e) { setBoost((b) => ({ ...b, phase: 'review', error: errMsg(e) })); }
  };

  const launch = async () => { const r = await api().launchFortnite(); setLaunchMsg(r.message); if (r.ok) onLaunch(); };

  const done = boost.steps.filter((s) => s.status !== 'pending' && s.status !== 'running').length;
  const pct = boost.phase === 'scanning' ? (done / 10) * 100 : boost.phase === 'idle' ? 0 : 100;

  return (
    <div className="animate-fadeUp">
      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* HERO */}
        <div className="card relative overflow-hidden p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_300px_at_50%_45%,rgba(57,255,20,0.10),transparent_70%)]" />
          <div className="relative flex flex-col items-center">
            <div className="label mb-1 !tracking-[0.3em]">TWECD Gaming Booster</div>
            <div className="mb-6 text-sm text-muted">Built for <span className="text-white">RTX 5060 8GB</span> · <span className="text-white">i5-14600K</span> · <span className="text-white">16GB</span> · Fortnite</div>
            <BigButton phase={boost.phase} pct={pct} onClick={() => (boost.phase === 'idle' || boost.phase === 'done' || boost.phase === 'review') && start('boost')} />
            <div className="mt-6 h-6 text-center text-sm text-muted">
              {boost.phase === 'idle' && 'Scans your PC, explains every change, and applies only what you approve.'}
              {boost.phase === 'scanning' && `Scanning... ${done}/10`}
              {boost.phase === 'review' && 'Scan complete. Review the recommendations below.'}
              {boost.phase === 'applying' && 'Applying approved optimizations...'}
              {boost.phase === 'done' && 'Done. Launch Fortnite when ready.'}
            </div>
            {boost.error && <div className="mt-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{boost.error}</div>}
            <div className="mt-6 grid w-full max-w-2xl grid-cols-3 gap-3">
              <Action n={1} icon={ScanSearch} label="SCAN PC" sub="Find bottlenecks" onClick={() => start('scan')} disabled={boost.phase === 'scanning' || boost.phase === 'applying'} />
              <Action n={2} icon={Zap} label="BOOST PC" sub="Scan, review, apply" onClick={() => start('boost')} disabled={boost.phase === 'scanning' || boost.phase === 'applying'} primary />
              <Action n={3} icon={Play} label="START FORTNITE" sub="Via Epic Launcher" onClick={launch} disabled={!info?.isWindows} />
            </div>
            {launchMsg && <div className="mt-3 text-sm text-neon2">{launchMsg}</div>}
          </div>
        </div>

        {/* LIVE */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="CPU" value={live ? fmt(live.cpu.usage) : null} unit="%" />
            <Stat label="GPU" value={live?.gpu ? fmt(live.gpu.usage) : null} unit="%" />
            <Stat label="RAM" value={live ? gb(live.ram.usedMB) : null} sub={live ? `of ${gb(live.ram.totalMB, 0)}` : undefined} />
            <Stat label="VRAM" value={live?.gpu ? gb(live.gpu.vramUsedMB) : null} sub={live?.gpu?.vramTotalMB ? `of ${gb(live.gpu.vramTotalMB, 0)}` : undefined} />
            <Stat label="GPU Temp" value={live?.gpu?.tempC != null ? fmt(live.gpu.tempC) : null} unit="°C" />
            <Stat label="CPU Temp" value={live?.cpu.tempC != null ? fmt(live.cpu.tempC) : null} unit="°C" />
          </div>
          <Stat label="Current FPS" value={live?.fps ? fmt(live.fps.fps) : null} tone="neon" big sub={live?.fps ? `Avg ${fmt(live.fps.avg)} · 1% low ${fmt(live.fps.low1)}` : live?.fpsStatus} />
        </div>
      </div>

      {/* PROGRESS */}
      {boost.phase !== 'idle' && (
        <Card className="mt-6" title={boost.phase === 'scanning' ? 'Scanning' : 'Scan results'} right={<span className="num text-sm text-neon">{Math.round(pct)}%</span>}>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-neon2 to-neon shadow-neon transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {boost.steps.map((s, i) => (
              <div key={s.id} className="flex items-start gap-3 py-1">
                <StepIcon status={s.status} />
                <div className="min-w-0">
                  <div className={`text-[15px] font-semibold ${s.status === 'pending' ? 'text-muted' : 'text-white'}`}>{i + 1}. {s.label}</div>
                  {s.summary && <div className="truncate text-xs text-muted" title={s.summary}>{s.summary}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* FINDINGS */}
      {boost.result && (boost.phase === 'review' || boost.phase === 'done' || boost.phase === 'applying') && (
        <Card className="mt-6" title={`Findings (${boost.result.findings.length})`}>
          <div className="grid grid-cols-2 gap-3">
            {boost.result.findings.map((f) => (
              <div key={f.id} className="flex gap-3 rounded-xl border border-line bg-panel2/60 p-3">
                <SevIcon s={f.severity} />
                <div><div className="font-semibold text-white">{f.title}</div><div className="text-sm text-muted">{f.detail}</div></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* RECOMMENDATIONS */}
      {boost.result && (boost.phase === 'review' || boost.phase === 'applying') && (
        <Card className="mt-6" title="Recommended optimizations" right={<span className="flex items-center gap-1 text-xs text-muted"><ShieldCheck size={14} className="text-neon" /> Safe, explained, confirm before applying</span>}>
          {actionable.length === 0 && <div className="mb-4 text-sm text-muted">No automatic changes needed: your Windows settings already look good.</div>}
          <div className="flex flex-col gap-3">
            {actionable.map((r) => <RecRow key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} pids={pids} setPids={setPids} />)}
          </div>
          {manual.length > 0 && (
            <>
              <div className="label mb-2 mt-6">Manual tips (TWECD does not change these for you)</div>
              <div className="flex flex-col gap-3">{manual.map((r) => <RecRow key={r.id} r={r} manual />)}</div>
            </>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
            <div className="text-sm text-muted">Results vary by PC and scene. Run a Benchmark before and after to measure the real difference.</div>
            <button className="btn-primary px-8 py-3 font-display text-sm tracking-[0.15em]" disabled={!chosen.length || boost.phase === 'applying'} onClick={apply}>
              {boost.phase === 'applying' ? <Loader2 className="animate-spin" size={18} /> : <Rocket size={18} />} APPLY {chosen.length || ''}
            </button>
          </div>
        </Card>
      )}

      {/* RESULTS */}
      {boost.phase === 'done' && boost.applied && (
        <Card className="mt-6" title="Applied" right={<Badge tone={boost.applied.backupSaved ? 'good' : 'warn'}>{boost.applied.backupSaved ? 'Original settings saved' : 'Backup could not be saved'}</Badge>}>
          <div className="flex flex-col gap-2">
            {boost.applied.results.map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel2/60 p-3">
                <ApplyIcon s={r.status} />
                <div className="flex-1"><div className="font-semibold text-white">{r.title}</div><div className="text-sm text-muted">{r.message}</div></div>
                <Badge tone={r.status === 'success' ? 'good' : r.status === 'failed' ? 'bad' : 'muted'}>{r.status.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button className="btn-ghost" onClick={() => start('boost')}>Scan again</button>
            <button className="btn-primary px-6" onClick={launch} disabled={!info?.isWindows}><Play size={16} /> START FORTNITE</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function BigButton({ phase, pct, onClick }: { phase: string; pct: number; onClick: () => void }) {
  const busy = phase === 'scanning' || phase === 'applying';
  const r = 128; const c = 2 * Math.PI * r;
  return (
    <button onClick={onClick} disabled={busy} className="group relative flex h-[290px] w-[290px] items-center justify-center rounded-full outline-none" aria-label="Boost my PC">
      {!busy && <span className="absolute inset-6 rounded-full border-2 border-neon/50 animate-pulseRing" />}
      <svg className="absolute inset-0 -rotate-90" width="290" height="290">
        <circle cx="145" cy="145" r={r} fill="none" stroke="#132019" strokeWidth="6" />
        <circle cx="145" cy="145" r={r} fill="none" stroke="#39FF14" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .5s', filter: 'drop-shadow(0 0 8px #39FF14)' }} />
      </svg>
      <span className={`absolute inset-[30px] rounded-full border border-neon/20 ${busy ? 'animate-spinSlow' : ''}`} style={{ background: 'conic-gradient(from 0deg, transparent 0 70%, rgba(57,255,20,0.25) 85%, transparent)' }} />
      <span className="relative flex h-[200px] w-[200px] flex-col items-center justify-center rounded-full bg-gradient-to-b from-[#0f1a13] to-[#060a07] shadow-neonLg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98] group-disabled:scale-100">
        {busy ? <Loader2 size={44} className="animate-spin text-neon" /> : <Rocket size={44} className="text-neon drop-shadow-[0_0_10px_#39FF14]" />}
        <span className="mt-3 font-display text-[22px] font-extrabold leading-tight tracking-[0.14em] text-white">{busy ? (phase === 'scanning' ? 'SCANNING' : 'APPLYING') : 'BOOST'}</span>
        <span className="font-display text-[13px] font-semibold tracking-[0.3em] text-neon">{busy ? `${Math.round(pct)}%` : 'MY PC'}</span>
      </span>
    </button>
  );
}

function Action({ n, icon: Icon, label, sub, onClick, disabled, primary }: { n: number; icon: typeof Rocket; label: string; sub: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`card card-hover flex items-center gap-3 p-4 text-left transition-all disabled:opacity-40 ${primary ? 'border-neon/40 bg-neon/[0.06]' : ''}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${primary ? 'bg-neon text-black' : 'bg-panel2 text-neon'}`}><Icon size={20} /></span>
      <span><span className="block font-display text-[13px] font-bold tracking-[0.12em] text-white"><span className="text-neon">{n}.</span> {label}</span><span className="text-xs text-muted">{sub}</span></span>
    </button>
  );
}

function RecRow({ r, checked, onToggle, manual, pids, setPids }: { r: Recommendation; checked?: boolean; onToggle?: () => void; manual?: boolean; pids?: Set<number>; setPids?: (fn: (s: Set<number>) => Set<number>) => void }) {
  const impact = { high: 'bad', medium: 'warn', low: 'muted' } as const;
  return (
    <div className={`rounded-xl border p-4 transition-colors ${checked ? 'border-neon/40 bg-neon/[0.04]' : 'border-line bg-panel2/50'}`}>
      <div className="flex items-start gap-3">
        {!manual ? (
          <button onClick={onToggle} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-neon bg-neon text-black' : 'border-[#3a4840]'}`} aria-label="Select">{checked && <CheckCircle2 size={14} />}</button>
        ) : <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{r.title}</span>
            <Badge tone={impact[r.impact]}>{r.impact.toUpperCase()} IMPACT</Badge>
            <Badge tone="muted">{r.area}</Badge>
            {!manual && (r.reversible ? <Badge tone="good">REVERSIBLE</Badge> : <Badge tone="warn">NOT REVERSIBLE</Badge>)}
          </div>
          <div className="mt-1 text-sm text-[#c3cdc7]">{r.why}</div>
          <div className="mt-1 text-xs text-muted"><span className="text-neon2">What changes:</span> {r.change}</div>
          {r.processes && checked && setPids && pids && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {r.processes.map((p) => (
                <label key={p.pid} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-sm">
                  <input type="checkbox" className="accent-[#39FF14]" checked={pids.has(p.pid)} onChange={() => setPids((s) => { const n = new Set(s); if (n.has(p.pid)) n.delete(p.pid); else n.add(p.pid); return n; })} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="num text-xs text-muted">{p.memMB.toFixed(0)} MB{p.cpuPercent != null ? ` · ${p.cpuPercent.toFixed(1)}%` : ''}</span>
                </label>
              ))}
              <div className="col-span-2 text-xs text-muted">Tick the apps to close. Nothing is closed unless ticked.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-neon" />;
  if (status === 'done') return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />;
  if (status === 'unavailable') return <MinusCircle size={18} className="mt-0.5 shrink-0 text-muted" />;
  if (status === 'error') return <XCircle size={18} className="mt-0.5 shrink-0 text-bad" />;
  return <CircleDashed size={18} className="mt-0.5 shrink-0 text-[#3a4840]" />;
}
function SevIcon({ s }: { s: Severity }) {
  if (s === 'good') return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />;
  if (s === 'warn') return <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />;
  if (s === 'bad') return <XCircle size={18} className="mt-0.5 shrink-0 text-bad" />;
  return <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />;
}
function ApplyIcon({ s }: { s: ApplyStatus }) {
  if (s === 'success') return <CheckCircle2 size={20} className="shrink-0 text-neon" />;
  if (s === 'failed') return <XCircle size={20} className="shrink-0 text-bad" />;
  return <MinusCircle size={20} className="shrink-0 text-muted" />;
}

