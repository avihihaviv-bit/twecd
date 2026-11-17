import { useEffect, useMemo, useState } from 'react';
import type { SessionSummary } from '../../shared/types';
import { api } from '../lib/api';
import { FindingGrid, LoadProfiles } from '../components/Report';
import Benchmark from './Benchmark';
import { Target } from 'lucide-react';
import { fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, FrameTimeChart, LiveChart, PageHeader, Stat } from '../components/ui';
import { FpsLock } from '../components/FpsLock';

const TARGET = 750;

export default function Stability() {
  const { live, history, info } = useApp();
  const [sess, setSess] = useState<{ current: SessionSummary | null; last: SessionSummary | null }>({ current: null, last: null });
  useEffect(() => { const t = () => api().session().then(setSess); t(); const iv = setInterval(t, 3000); return () => clearInterval(iv); }, []);
  const s = sess.current ?? sess.last;
  const f = live?.fps ?? null;
  const data = useMemo(() => history.map((h, i) => ({ i, fps: h.fps, low1: h.low1 })), [history]);
  const score = f?.stabilityScore ?? null;
  const scoreTone = score === null ? 'default' : score >= 80 ? 'neon' : score >= 60 ? 'warn' : 'bad';
  const bottleneck = f && f.cpuBusyMs !== null && f.gpuBusyMs !== null
    ? f.gpuBusyMs > f.cpuBusyMs * 1.15 ? { t: 'GPU-bound', d: `GPU ${f.gpuBusyMs.toFixed(2)} ms vs CPU ${f.cpuBusyMs.toFixed(2)} ms per frame` }
      : f.cpuBusyMs > f.gpuBusyMs * 1.15 ? { t: 'CPU-bound', d: `CPU ${f.cpuBusyMs.toFixed(2)} ms vs GPU ${f.gpuBusyMs.toFixed(2)} ms per frame` }
      : { t: 'Balanced', d: `CPU ${f.cpuBusyMs.toFixed(2)} ms / GPU ${f.gpuBusyMs.toFixed(2)} ms` }
    : null;
  const vramPct = live?.gpu?.vramUsedMB != null && live.gpu.vramTotalMB ? (live.gpu.vramUsedMB / live.gpu.vramTotalMB) * 100 : null;

  return (
    <div className="animate-fadeUp">
      <PageHeader title="FPS OPTIMIZER" subtitle="Consistent frame delivery and 1% lows matter more than peak FPS. Every value is measured from real frame times captured with PresentMon (ETW) while Fortnite runs; nothing is injected into the game." />
      {!info?.presentMon.available && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">PresentMon is not installed, so FPS and frame times are unavailable. The installer bundles it; for development builds, set its path in Settings.</div>
      )}
      <div className="grid grid-cols-7 gap-3">
        <Stat label="Current FPS" value={f ? fmt(f.fps) : null} tone="neon" big />
        <Stat label="Average FPS" value={f ? fmt(f.avg) : s?.avgFps != null ? fmt(s.avgFps) : null} sub={f ? `${f.sampleCount} frames` : s ? 'last match' : live?.fpsStatus} />
        <Stat label="Max FPS (best second)" value={s?.maxFps != null ? fmt(s.maxFps) : null} sub="usually a light/empty scene" />
        <Stat label="Min FPS (worst second)" value={s?.minFps != null ? fmt(s.minFps) : null} />
        <Stat label="1% Low (match)" value={s?.low1Session != null ? fmt(s.low1Session) : f ? fmt(f.low1) : null} sub={s?.low1Session != null ? 'every frame of the match' : f ? 'rolling window' : undefined} />
        <Stat label="0.1% Low" value={f?.low01 != null ? fmt(f.low01) : null} />
        <Stat label="Stability Score" value={score !== null ? String(score) : s?.stabilityScore != null ? String(s.stabilityScore) : null} unit="/100" tone={scoreTone} />
      </div>

      <div className="mt-6 grid grid-cols-[1fr_320px] gap-6">
        <Card title="Frame time (ms) - lower and flatter is better" right={f ? <span className="num text-xs text-muted">avg {f.frameTimeAvgMs.toFixed(2)} ms · σ {f.frameTimeStdMs.toFixed(2)} ms</span> : null}>
          <FrameTimeChart frames={f?.frameTimesMs ?? []} height={240} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Target size={14} className="text-neon" /> 750 FPS target</span>}>
          <div className="num text-4xl font-bold text-white">{f ? Math.round(f.avg) : '--'}<span className="text-lg text-muted"> / {TARGET}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-purple to-neon" style={{ width: `${f ? Math.min(100, (f.avg / TARGET) * 100) : 0}%` }} /></div>
          <p className="mt-4 text-sm text-muted">750 FPS is an aspirational target, not a promise. On an RTX 5060 + i5-14600K it is only approachable in Performance mode, in light scenes, with the CPU free of background load. Late-game fights are usually CPU-bound and lower.</p>
        </Card>
      </div>

      <div className="mt-6">
        <Card title={`Performance by scene load ${sess.current ? '(this match)' : s ? '(last match)' : ''}`} right={<span className="text-xs text-muted">Peak FPS in empty scenes is not your real gameplay FPS</span>}>
          <LoadProfiles loads={s?.loads ?? []} />
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Why FPS drops: bottleneck report" right={s ? <span className="text-xs text-muted">{s.fpsSamples} measured samples</span> : null}>
          {s && s.diagnosis.length ? <FindingGrid items={s.diagnosis} /> : <div className="text-sm text-muted">Play one match with TWECD open (running as administrator for FPS capture). The report classifies each measured second as CPU-, GPU- or engine-limited and checks VRAM, RAM, thermals, power limits, shader compilation, background apps and network, with the evidence for each.</div>}
        </Card>
      </div>

      <div className="mt-6"><FpsLock /></div>

      <div className="mt-10"><Benchmark embedded /></div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Card title="FPS over time"><LiveChart data={data} series={[{ key: 'fps', name: 'FPS', color: '#39FF14' }, { key: 'low1', name: '1% low', color: '#18C77A' }]} max="auto" unit="" height={200} /></Card>
        <Card title="Stability analysis">
          <div className="grid grid-cols-2 gap-3">
            <Metric k="Frame-time spikes" v={f ? String(f.spikes) : null} hint=">2x median, in window" />
            <Metric k="Stutters" v={f ? String(f.stutters) : null} hint=">2.5x median and +8 ms" />
            <Metric k="Bottleneck" v={bottleneck?.t ?? null} hint={bottleneck?.d ?? 'Needs PresentMon 2.x CPU/GPU busy data'} />
            <Metric k="VRAM pressure" v={vramPct !== null ? `${vramPct.toFixed(0)}%` : null} hint={vramPct !== null && vramPct > 90 ? 'High - lower Textures' : 'of 8 GB'} />
            <Metric k="RAM pressure" v={live ? `${live.ram.percent.toFixed(0)}%` : null} hint={live && live.ram.percent > 85 ? 'High - close apps' : 'of 16 GB'} />
            <Metric k="GPU usage" v={live?.gpu?.usage != null ? `${live.gpu.usage.toFixed(0)}%` : null} hint="95%+ = GPU limited" />
          </div>
          <div className="mt-4 text-xs text-muted">Score = 50% (1% low ÷ average) + 30% frame-time consistency + 20% stutter rate. {score !== null && (score >= 80 ? <Badge tone="good">Smooth</Badge> : score >= 60 ? <Badge tone="warn">Some variance</Badge> : <Badge tone="bad">Unstable</Badge>)}</div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ k, v, hint }: { k: string; v: string | null; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-3">
      <div className="label">{k}</div>
      <div className={`num mt-1 text-lg font-bold ${v === null ? 'text-sm text-[#6b5d85]' : 'text-white'}`}>{v ?? 'Unavailable'}</div>
      <div className="text-[11px] text-muted">{hint}</div>
    </div>
  );
}
