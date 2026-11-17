import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleDashed, Info, Loader2, MinusCircle, Play, Rocket, ScanSearch, ShieldCheck, Timer, XCircle, Zap } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { OptimizationId, Recommendation, ScanStep, StepStatus } from '../../shared/types';
import { api, errMsg, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, FrameTimeChart, LiveChart } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { FindingGrid } from '../components/Report';
import { AutoModeCard } from '../components/AutoModeCard';

const STEP_LABELS: [ScanStep['id'], string][] = [
  ['cpu', 'Scan CPU'], ['gpu', 'Scan GPU & display'], ['vram', 'Scan VRAM'], ['ram', 'Scan RAM'], ['processes', 'Scan background apps'],
  ['fortnite-config', 'Analyze Fortnite configuration'], ['game-mode', 'Check Windows Game Mode'], ['power', 'Inspect power settings'],
  ['network', 'Check network stability'], ['bottlenecks', 'Identify bottlenecks'],
];
const initialSteps = (): ScanStep[] => STEP_LABELS.map(([id, label]) => ({ id, label, status: 'pending', summary: '' }));

export default function Dashboard({ onLaunch, onBenchmark }: { onLaunch: () => void; onBenchmark: () => void }) {
  const { boost, setBoost, live, info, history } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pids, setPids] = useState<Set<number>>(new Set());
  const [startupSel, setStartupSel] = useState<Set<string>>(new Set());
  const [undone, setUndone] = useState<Record<string, string>>({});
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);

  useEffect(() => api().onScanStep((s) => setBoost((b) => ({ ...b, steps: b.steps.map((x) => (x.id === s.id ? s : x)) }))), [setBoost]);

  const start = async (mode: 'scan' | 'boost') => {
    setBoost(() => ({ phase: 'scanning', mode, steps: initialSteps(), result: null, applied: null, error: null }));
    try {
      const result = await api().scan();
      setSelected(new Set(result.recommendations.filter((r) => r.selectedByDefault && r.optimizationId).map((r) => r.id)));
      setPids(new Set()); setStartupSel(new Set()); setUndone({});
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
    const startRec = chosen.find((r) => r.optimizationId === 'startup-apps-off');
    const startNames = startRec ? [...startupSel] : [];
    const summary = chosen.map((r) => `- ${r.title}${!r.reversible ? '  (cannot be undone)' : ''}${r.rebootRequired ? '  (needs a PC restart)' : ''}`).join('\n');
    if (!window.confirm(`Apply these ${ids.length} optimization(s)?\n\n${summary}${names.length ? `\n\nApps that will be closed (save your work first):\n${[...new Set(names)].join(', ')}` : ''}${startNames.length ? `\n\nStartup entries that will be disabled:\n${startNames.join(', ')}` : ''}\n\nOriginal settings are saved. Use "Restore Defaults" in Settings to undo.`)) return;
    setBoost((b) => ({ ...b, phase: 'applying' }));
    try { const applied = await api().apply({ ids, pids: [...pids], startupNames: startNames }); setBoost((b) => ({ ...b, phase: 'done', applied })); }
    catch (e) { setBoost((b) => ({ ...b, phase: 'review', error: errMsg(e) })); }
  };

  const launch = async () => { const r = await api().launchFortnite(); setLaunchMsg(r.message); if (r.ok) onLaunch(); };

  const done = boost.steps.filter((s) => s.status !== 'pending' && s.status !== 'running').length;
  const pct = boost.phase === 'scanning' ? (done / 10) * 100 : boost.phase === 'idle' ? 0 : 100;
  const stage = boost.phase === 'idle' ? -1 : boost.phase === 'scanning' ? 0 : boost.phase === 'review' ? 1 : boost.phase === 'applying' ? 2 : 3;

  const series = useMemo(() => ({
    fps: history.map((h) => h.fps), cpu: history.map((h) => h.cpu), gpu: history.map((h) => h.gpu), ram: history.map((h) => h.ram), ping: history.map((h) => h.ping),
  }), [history]);
  const chartData = useMemo(() => history.map((h, i) => ({ i, fps: h.fps, low1: h.low1, cpu: h.cpu, gpu: h.gpu, ping: h.ping })), [history]);
  const net = live?.net ?? null;
  const fnRunning = live?.fortnite.running ?? false;
  const d = info?.display;

  return (
    <div className="animate-fadeUp space-y-6">
      {/* TOP: logo + status | BOOST | actions */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_280px_at_50%_50%,rgba(57,255,20,0.10),transparent_70%)]" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-8 p-7">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <LogoMark size={76} />
              <div>
                <div className="font-display text-[40px] font-extrabold leading-none tracking-[0.22em] text-white">TWECD</div>
                <div className="mt-2 font-display text-[11px] font-semibold tracking-[0.34em] text-neon">ULTRA WIDE EXTREME EDITION</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-[110px_1fr] gap-y-2 text-[14px]">
              <span className="label pt-0.5">System</span>
              <span className="truncate text-white">{info ? `${info.gpu.name?.replace('NVIDIA GeForce ', '') ?? 'GPU unavailable'} · ${info.cpu.model.replace(/^Intel(\(R\))? Core(\(TM\))? /, '')} · ${(info.ram.totalMB / 1024).toFixed(0)} GB` : 'Detecting...'}</span>
              <span className="label pt-0.5">Display</span>
              <span className="text-white">{d?.currentHz ? `${d.width}x${d.height} @ ${d.currentHz} Hz` : 'Unavailable'}{d?.currentHz && d.maxHz && d.currentHz < d.maxHz - 1 && <span className="ml-2 text-warn">(supports {d.maxHz} Hz)</span>}</span>
              <span className="label pt-0.5">Status</span>
              <span className="flex items-center gap-2"><StatusDot ok={!!live} />{live ? 'Monitoring' : 'Starting...'}{info && !info.isAdmin && info.isWindows && <span className="text-xs text-warn">· FPS capture needs admin</span>}</span>
              <span className="label pt-0.5">Fortnite</span>
              <span className="flex items-center gap-2"><StatusDot ok={fnRunning} />{fnRunning ? `Running · ${live?.fpsStatus}` : 'Not running'}</span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="title-glow mb-2 font-display text-[12px] font-bold tracking-[0.35em]">EXTREME OPTIMIZATION</div>
            <BigButton phase={boost.phase} pct={pct} onClick={() => (boost.phase === 'idle' || boost.phase === 'done' || boost.phase === 'review') && start('boost')} />
            <div className="mt-3 h-5 text-center text-sm text-muted">
              {boost.phase === 'idle' && 'Scan · explain · apply only what you approve'}
              {boost.phase === 'scanning' && `Scanning ${done}/10`}
              {boost.phase === 'review' && 'Review the report below'}
              {boost.phase === 'applying' && 'Applying...'}
              {boost.phase === 'done' && 'Done - benchmark to measure'}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Action n={1} icon={ScanSearch} label="SCAN PC" sub="Find bottlenecks with evidence" onClick={() => start('scan')} disabled={boost.phase === 'scanning' || boost.phase === 'applying'} />
            <Action n={2} icon={Zap} label="BOOST PC" sub="Scan, review, apply" onClick={() => start('boost')} disabled={boost.phase === 'scanning' || boost.phase === 'applying'} primary />
            <Action n={3} icon={Play} label="START FORTNITE" sub="Via Epic Games Launcher" onClick={launch} disabled={!info?.isWindows} />
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.14em]">
              {['SCAN', 'ANALYZE', 'APPLY', 'BENCHMARK'].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5"><span className={stage >= i ? 'text-neon' : 'text-[#5d4f7a]'}>{s}</span>{i < 3 && <ArrowRight size={11} className="text-[#4a3b66]" />}</span>
              ))}
            </div>
            {launchMsg && <div className="text-center text-sm text-neon2">{launchMsg}</div>}
            {boost.error && <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{boost.error}</div>}
          </div>
        </div>
      </section>

      <AutoModeCard />

      {/* MIDDLE: performance cards */}
      <div className="grid grid-cols-6 gap-4">
        <BigCard label="CURRENT FPS" value={live?.fps ? fmt(live.fps.fps) : null} sub={live?.fps ? `stability ${live.fps.stabilityScore}/100` : live?.fpsStatus} data={series.fps} color="#39FF14" accent />
        <BigCard label="AVERAGE FPS" value={live?.fps ? fmt(live.fps.avg) : null} sub={live?.fps ? `${live.fps.sampleCount} frames` : 'measured in game'} color="#39FF14" />
        <BigCard label="1% LOW" value={live?.fps ? fmt(live.fps.low1) : null} sub={live?.fps?.low01 != null ? `0.1% low ${fmt(live.fps.low01)}` : 'measured in game'} color="#39FF14" />
        <BigCard label="CPU" value={live ? fmt(live.cpu.usage) : null} unit="%" sub={live?.cpu.effectiveClockMHz ? `${(live.cpu.effectiveClockMHz / 1000).toFixed(2)} GHz` : info?.cpu.model.replace(/^(Intel|AMD)(\(R\))?\s*(Core|Ryzen)?(\(TM\))?\s*/i, '') ?? ''} data={series.cpu} color="#39FF14" max={100} />
        <BigCard label="GPU" value={live?.gpu ? fmt(live.gpu.usage) : null} unit="%" sub={live?.gpu ? `${live.gpu.clockMHz ?? '-'} MHz · ${gb(live.gpu.vramUsedMB)} VRAM` : live?.gpuStatus} data={series.gpu} color="#18C77A" max={100} />
        <BigCard label="RAM" value={live ? gb(live.ram.usedMB) : null} sub={live ? `${live.ram.percent.toFixed(0)}% of ${gb(live.ram.totalMB, 0)}` : undefined} data={series.ram} color="#7dd3fc" max={100} />
      </div>
      <div className="grid grid-cols-6 gap-4">
        <BigCard label="CPU TEMP" value={live?.cpu.tempC != null ? fmt(live.cpu.tempC) : null} unit="°C" sub={live?.cpu.tempC == null ? 'needs a motherboard sensor driver' : live.cpu.tempC >= 95 ? 'throttling likely' : 'OK'} tone={(live?.cpu.tempC ?? 0) >= 90 ? 'warn' : undefined} />
        <BigCard label="GPU TEMP" value={live?.gpu?.tempC != null ? fmt(live.gpu.tempC) : null} unit="°C" sub={live?.gpu ? (live.gpu.throttleReasons.length ? live.gpu.throttleReasons[0] : 'no clock limits') : live?.gpuStatus} tone={(live?.gpu?.tempC ?? 0) >= 83 ? 'warn' : undefined} />
        <div className="card col-span-2 p-5">
          <div className="label">BOTTLENECK DETECTION</div>
          <div className={`mt-3 font-display text-[17px] font-bold leading-snug ${live?.bottleneck ? 'text-lilac' : 'text-[#6b5d85]'}`}>{live?.bottleneck ?? 'Unavailable'}</div>
          <div className="mt-2 text-xs text-muted">{live?.bottleneck ? 'Live, from measured CPU/GPU busy time, utilization, VRAM, RAM and temperatures.' : 'Appears while Fortnite runs with FPS capture (TWECD as administrator). Full evidence report on the FPS Optimizer page.'}</div>
        </div>
        <BigCard label="PING" value={net?.latency != null ? fmt(net.latency, 0) : null} unit="ms" sub={net ? `avg ${fmt(net.avg, 0, ' ms')} · jitter ${fmt(net.jitter, 1, ' ms')}` : live?.netStatus} data={series.ping} color="#c084fc" />
        <BigCard label="PACKET LOSS" value={net?.lossPct != null ? fmt(net.lossPct, 0) : null} unit="%" sub={net ? `last ${net.samples} probes · ${net.host}` : live?.netStatus} tone={net && (net.lossPct ?? 0) > 0 ? 'warn' : undefined} />
      </div>

      {/* SCAN REPORT */}
      {boost.phase !== 'idle' && (
        <Card title={boost.phase === 'scanning' ? 'Scanning' : 'Scan results'} right={<span className="num text-sm text-neon">{Math.round(pct)}%</span>}>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-purple to-neon shadow-neon transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          <div className="grid grid-cols-5 gap-x-6 gap-y-3">
            {boost.steps.map((s, i) => (
              <div key={s.id} className="flex min-w-0 items-start gap-2.5">
                <StepIcon status={s.status} />
                <div className="min-w-0"><div className={`text-[14px] font-semibold ${s.status === 'pending' ? 'text-muted' : 'text-white'}`}>{i + 1}. {s.label}</div>{s.summary && <div className="line-clamp-2 text-xs text-muted" title={s.summary}>{s.summary}</div>}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {boost.result && boost.phase !== 'scanning' && (
        <Card title={`Optimization report · ${boost.result.findings.length} findings`}><FindingGrid items={[...boost.result.findings].sort((a, b) => rank(b) - rank(a))} /></Card>
      )}
      {boost.result && (boost.phase === 'review' || boost.phase === 'applying') && (
        <Card title="Recommended optimizations" right={<span className="flex items-center gap-1 text-xs text-muted"><ShieldCheck size={14} className="text-neon" /> Safe, explained, reversible unless marked</span>}>
          {actionable.length === 0 && <div className="mb-4 text-sm text-muted">{info?.isWindows ? 'No automatic changes needed: every setting TWECD can change is already optimal.' : 'Windows settings can only be checked and changed on Windows; nothing was changed.'}</div>}
          <div className="grid grid-cols-2 gap-3">
            {actionable.map((r) => <RecRow key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} pids={pids} setPids={setPids} startupSel={startupSel} setStartupSel={setStartupSel} />)}
          </div>
          <NotApplied items={boost.result.notApplied} />
          {manual.length > 0 && (<><div className="label mb-2 mt-6">Manual tips (TWECD does not change these)</div><div className="grid grid-cols-2 gap-3">{manual.map((r) => <RecRow key={r.id} r={r} manual />)}</div></>)}
          <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
            <div className="text-sm text-muted">TWECD never promises a specific FPS gain. Benchmark before and after to measure the real difference.</div>
            <button className="btn-primary px-10 py-3.5 font-display text-sm tracking-[0.15em]" disabled={!chosen.length || boost.phase === 'applying'} onClick={apply}>
              {boost.phase === 'applying' ? <Loader2 className="animate-spin" size={18} /> : <Rocket size={18} />} APPLY {chosen.length || ''}
            </button>
          </div>
        </Card>
      )}
      {boost.phase === 'done' && boost.applied && (
        <Card title="Before / after report" right={<div className="flex gap-2"><Badge tone={boost.applied.backupSaved ? 'good' : 'warn'}>{boost.applied.backupSaved ? 'Original values saved' : 'Backup could not be saved'}</Badge>{boost.applied.restorePoint && <Badge tone={boost.applied.restorePoint.ok ? 'good' : 'muted'}>{boost.applied.restorePoint.ok ? 'Restore point OK' : 'No restore point'}</Badge>}</div>}>
          {boost.applied.restorePoint && <div className="mb-3 text-xs text-muted">System Restore: {boost.applied.restorePoint.message}</div>}
          <table className="w-full text-sm">
            <thead><tr className="label text-left"><th className="pb-2">Optimization</th><th>Before</th><th>After</th><th>Verified</th><th>Status</th><th /></tr></thead>
            <tbody>{boost.applied.results.map((r) => (
              <tr key={r.id} className="border-t border-line/60 align-top">
                <td className="py-2.5 pr-4"><div className="font-semibold text-white">{r.title}</div><div className="text-xs text-muted">{undone[r.id] ?? r.message}</div></td>
                <td className="py-2.5 pr-3 text-xs text-muted">{r.before ?? '-'}</td>
                <td className="py-2.5 pr-3 text-xs text-lilac">{r.after ?? '-'}</td>
                <td className="py-2.5">{r.verified === true ? <span className="flex items-center gap-1 text-neon"><CheckCircle2 size={15} /> read back OK</span> : r.verified === false ? <span className="text-bad">not confirmed</span> : <span className="text-muted">-</span>}</td>
                <td className="py-2.5"><Badge tone={r.status === 'success' ? 'good' : r.status === 'failed' ? 'bad' : 'muted'}>{r.status.toUpperCase()}</Badge></td>
                <td className="py-2.5 text-right">{r.status === 'success' && !undone[r.id] && r.id !== 'clean-temp-files' && r.id !== 'close-background-apps' && <button className="btn-ghost !px-3 !py-1 text-xs" onClick={async () => { const x = await api().restore([r.id]); setUndone((u) => ({ ...u, [r.id]: x[0]?.message ?? 'Restored.' })); }}>Undo</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="mt-4 rounded-xl border border-purple/30 bg-purple/[0.06] p-3 text-sm text-[#d9c6f5]">These are configuration changes, not FPS results. TWECD only shows an FPS improvement after it has been measured: run a Benchmark in the same Fortnite scene to compare.</div>
          <NotApplied items={boost.result?.notApplied ?? []} />
          <div className="mt-5 flex justify-end gap-3">
            <button className="btn-ghost" onClick={() => start('boost')}>Scan again</button>
            <button className="btn-ghost" onClick={onBenchmark}><Timer size={16} /> BENCHMARK</button>
            <button className="btn-go px-6" onClick={launch} disabled={!info?.isWindows}><Play size={16} /> START FORTNITE</button>
          </div>
        </Card>
      )}

      {/* BOTTOM: wide graphs */}
      <div className="grid grid-cols-2 gap-6">
        <Card title="Real-time FPS" right={live?.fps ? <span className="num text-xs text-muted">avg {fmt(live.fps.avg)} · 1% low {fmt(live.fps.low1)}</span> : null}><LiveChart data={chartData} series={[{ key: 'fps', name: 'FPS', color: '#39FF14' }, { key: 'low1', name: '1% low', color: '#18C77A' }]} max="auto" unit="" height={220} /></Card>
        <Card title="Frame time (ms)"><FrameTimeChart frames={live?.fps?.frameTimesMs ?? []} height={220} /></Card>
        <Card title="CPU & GPU utilization"><LiveChart data={chartData} series={[{ key: 'cpu', name: 'CPU', color: '#39FF14' }, { key: 'gpu', name: 'GPU', color: '#18C77A' }]} height={220} /></Card>
        <Card title="Network stability (ping, ms)" right={net ? <span className="num text-xs text-muted">{net.host} · loss {fmt(net.lossPct, 0, '%')}</span> : null}><LiveChart data={chartData} series={[{ key: 'ping', name: 'Ping', color: '#c084fc' }]} max="auto" unit=" ms" height={220} area={false} /></Card>
      </div>
    </div>
  );
}

const rank = (f: { severity: string }) => ({ bad: 3, warn: 2, info: 1, good: 0 } as Record<string, number>)[f.severity] ?? 0;
const StatusDot = ({ ok }: { ok: boolean }) => <span className={`h-2 w-2 rounded-full ${ok ? 'bg-neon shadow-neon' : 'bg-[#4a3b66]'}`} />;

function BigCard({ label, value, unit, sub, data, color = '#39FF14', max, accent, tone }: { label: string; value: string | null; unit?: string; sub?: string; data?: (number | null)[]; color?: string; max?: number; accent?: boolean; tone?: 'warn' }) {
  const un = value === null || value === 'Unavailable';
  const pts = (data ?? []).map((v, i) => ({ i, v }));
  const has = pts.some((p) => p.v !== null);
  return (
    <div className={`card card-hover relative overflow-hidden p-5 ${accent ? 'border-purple/50 shadow-purple' : ''}`}>
      <div className="label">{label}</div>
      <div className={`mt-2 flex items-baseline gap-1 ${un ? 'text-[#6b5d85]' : tone === 'warn' ? 'text-warn' : accent ? 'text-neon' : 'text-white'}`}>
        <span className={`num whitespace-nowrap font-bold ${un ? 'text-lg' : 'text-[clamp(24px,2.3vw,44px)] leading-none'}`}>{un ? 'Unavailable' : value}</span>
        {!un && unit && <span className="text-base font-semibold text-muted">{unit}</span>}
      </div>
      <div className="mt-1.5 h-4 truncate text-xs text-muted" title={sub}>{sub}</div>
      <div className="-mx-5 -mb-5 mt-3 h-14">
        {has && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs><linearGradient id={`bc-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <YAxis hide domain={[0, max ?? 'auto']} />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#bc-${label})`} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function BigButton({ phase, pct, onClick }: { phase: string; pct: number; onClick: () => void }) {
  const busy = phase === 'scanning' || phase === 'applying';
  const r = 128; const c = 2 * Math.PI * r;
  return (
    <button onClick={onClick} disabled={busy} className="group relative flex h-[290px] w-[290px] items-center justify-center rounded-full outline-none" aria-label="Max FPS - optimize everything">
      {!busy && <span className="absolute inset-6 rounded-full border-2 border-purple/60 animate-pulseRing" />}
      <svg className="absolute inset-0 -rotate-90" width="290" height="290">
        <circle cx="145" cy="145" r={r} fill="none" stroke="#21163a" strokeWidth="6" />
        <circle cx="145" cy="145" r={r} fill="none" stroke="#39FF14" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .5s', filter: 'drop-shadow(0 0 8px #39FF14)' }} />
      </svg>
      <span className={`absolute inset-[30px] rounded-full border border-neon/20 ${busy ? 'animate-spinSlow' : ''}`} style={{ background: 'conic-gradient(from 0deg, transparent 0 70%, rgba(57,255,20,0.25) 85%, transparent)' }} />
      <span className="relative flex h-[200px] w-[200px] flex-col items-center justify-center rounded-full bg-gradient-to-b from-[#170f26] to-[#08050d] shadow-purpleLg transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.98] group-disabled:scale-100">
        {busy ? <Loader2 size={44} className="animate-spin text-purple" /> : <Rocket size={44} className="text-purple drop-shadow-[0_0_12px_#B44CFF]" />}
        <span className="mt-3 font-display text-[26px] font-extrabold leading-tight tracking-[0.14em] text-white">{busy ? (phase === 'scanning' ? 'SCANNING' : 'APPLYING') : 'MAX FPS'}</span>
        <span className="mt-1 font-display text-[10.5px] font-semibold tracking-[0.22em] text-purple">{busy ? `${Math.round(pct)}%` : 'OPTIMIZE EVERYTHING'}</span>
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

function RecRow({ r, checked, onToggle, manual, pids, setPids, startupSel, setStartupSel }: { r: Recommendation; checked?: boolean; onToggle?: () => void; manual?: boolean; pids?: Set<number>; setPids?: (fn: (s: Set<number>) => Set<number>) => void; startupSel?: Set<string>; setStartupSel?: (fn: (s: Set<string>) => Set<string>) => void }) {
  const impact = { high: 'bad', medium: 'warn', low: 'muted' } as const;
  return (
    <div className={`rounded-xl border p-4 transition-colors ${checked ? 'border-neon/40 bg-neon/[0.04]' : 'border-line bg-panel2/50'}`}>
      <div className="flex items-start gap-3">
        {!manual ? (
          <button onClick={onToggle} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-neon bg-neon text-black' : 'border-[#4a3b66]'}`} aria-label="Select">{checked && <CheckCircle2 size={14} />}</button>
        ) : <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{r.title}</span>
            <Badge tone={impact[r.impact]}>{r.impact.toUpperCase()} IMPACT</Badge>
            <Badge tone="muted">{r.area}</Badge>
            {!manual && (r.reversible ? <Badge tone="good">REVERSIBLE</Badge> : <Badge tone="warn">NOT REVERSIBLE</Badge>)}
            {r.needsAdmin && <Badge tone="info">NEEDS ADMIN</Badge>}{r.rebootRequired && <Badge tone="info">RESTART PC</Badge>}
          </div>
          <div className="mt-1 text-sm text-[#cfc3e3]">{r.why}</div>
          <div className="mt-1 text-xs text-muted"><span className="text-neon2">What changes:</span> {r.change}</div>
          {r.startup && checked && setStartupSel && startupSel && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {r.startup.map((e) => (
                <label key={e.name} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-sm" title={e.command}>
                  <input type="checkbox" className="accent-[#B44CFF]" checked={startupSel.has(e.name)} onChange={() => setStartupSel((s) => { const n = new Set(s); if (n.has(e.name)) n.delete(e.name); else n.add(e.name); return n; })} />
                  <span className="flex-1 truncate">{e.name}</span>
                </label>
              ))}
              <div className="col-span-2 text-xs text-muted">Tick the entries to disable at startup. Nothing changes unless ticked.</div>
            </div>
          )}
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
  return <CircleDashed size={18} className="mt-0.5 shrink-0 text-[#4a3b66]" />;
}


function NotApplied({ items }: { items: { title: string; reason: string }[] }) {
  if (!items?.length) return null;
  return (
    <details className="mt-5 rounded-xl border border-line bg-black/20 p-4">
      <summary className="cursor-pointer font-semibold text-lilac">Not applied, and why ({items.length})</summary>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {items.map((i) => <div key={i.title}><b className="text-white">{i.title}</b><div className="text-muted">{i.reason}</div></div>)}
      </div>
    </details>
  );
}
