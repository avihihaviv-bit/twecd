import { useEffect, useMemo, useState } from 'react';
import type { ProcessInfo } from '../../shared/types';
import { api, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Bar, Card, LiveChart, PageHeader, Ring, Stat } from '../components/ui';

export default function Hardware() {
  const { live, history, info } = useApp();
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => api().processes().then((p) => alive && setProcs(p)).catch(() => undefined);
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const g = live?.gpu ?? null;
  const vramPct = g?.vramUsedMB != null && g.vramTotalMB ? (g.vramUsedMB / g.vramTotalMB) * 100 : null;
  const chart = useMemo(() => history.map((h, i) => ({ i, cpu: h.cpu, gpu: h.gpu, ram: h.ram, vram: h.vram })), [history]);
  const temps = useMemo(() => history.map((h, i) => ({ i, gpuTemp: h.gpuTemp, cpuTemp: h.cpuTemp })), [history]);
  const topo = info?.cpu.topology ?? null;
  const pCores = topo && live ? topo.pCoreThreads.map((i) => live.cpu.perCore[i] ?? 0) : null;
  const eCores = topo && live ? topo.eCoreThreads.map((i) => live.cpu.perCore[i] ?? 0) : null;
  const avg = (a: number[] | null) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fnMem = live?.fortnite.memMB ?? null;
  const bgMem = procs.filter((p) => p.category === 'closable').reduce((a, p) => a + p.memMB, 0);

  return (
    <div className="animate-fadeUp">
      <PageHeader title="HARDWARE" subtitle="Live telemetry from your GPU, CPU and memory. Read-only: TWECD never overclocks, changes voltages, disables cores or touches firmware." />
      <div className="mb-6 card flex items-center justify-around py-6">
        <Ring label="CPU" value={live?.cpu.usage ?? null} sub={live?.cpu.effectiveClockMHz ? `${(live.cpu.effectiveClockMHz / 1000).toFixed(2)} GHz` : undefined} />
        <Ring label="GPU" value={g?.usage ?? null} sub={g?.clockMHz != null ? `${g.clockMHz} MHz` : undefined} />
        <Ring label="VRAM" value={vramPct} sub={g ? gb(g.vramUsedMB) : undefined} />
        <Ring label="RAM" value={live?.ram.percent ?? null} sub={live ? gb(live.ram.usedMB) : undefined} />
      </div>

      {/* GPU */}
      <Card title="NVIDIA GPU" right={<span className="text-sm font-semibold text-white">{g?.name ?? info?.gpu.name ?? 'Unavailable'}</span>}>
        {!g && <div className="mb-3 text-sm text-warn">{live?.gpuStatus ?? 'Waiting for data'}</div>}
        <div className="grid grid-cols-6 gap-3">
          <Stat label="Usage" value={g ? fmt(g.usage) : null} unit="%" />
          <Stat label="VRAM" value={g?.vramUsedMB != null ? (g.vramUsedMB / 1024).toFixed(2) : null} unit={g?.vramTotalMB ? `/ ${(g.vramTotalMB / 1024).toFixed(0)} GB` : 'GB'} />
          <Stat label="Temperature" value={g ? fmt(g.tempC) : null} unit="°C" tone={g?.tempC != null && g.tempC >= 83 ? 'warn' : 'default'} />
          <Stat label="Core clock" value={g ? fmt(g.clockMHz) : null} unit="MHz" sub={g?.maxClockMHz ? `max ${g.maxClockMHz} MHz` : undefined} />
          <Stat label="Power" value={g ? fmt(g.powerW, 0) : null} unit="W" sub={g?.powerLimitW ? `limit ${g.powerLimitW.toFixed(0)} W` : undefined} />
          <Stat label="Driver" value={g?.driver ?? info?.gpu.driver ?? null} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="label">Clock limits:</span>
          {g ? (g.throttleReasons.length ? g.throttleReasons.map((r) => <Badge key={r} tone={/thermal|slowdown|brake/i.test(r) ? 'bad' : 'warn'}>{r}</Badge>) : <Badge tone="good">None active</Badge>) : <span className="text-muted">Unavailable</span>}
          <button className="btn-ghost ml-auto !py-1.5 text-sm" onClick={() => api().openExternal('https://www.nvidia.com/en-us/software/nvidia-app/')}>Get latest NVIDIA driver</button>
        </div>
        <div className="mt-3 rounded-xl border border-line bg-panel2/60 p-3 text-sm text-[#c3cdc7]">
          <b className="text-neon">RTX 5060 tips:</b> Power management mode "Prefer maximum performance" for Fortnite, VSync off in driver and game, NVIDIA Reflex "On + Boost" in Fortnite, keep 1+ GB VRAM free (Textures Medium in Performance mode). Power-limit flags at full load are normal; thermal flags are not.
        </div>
      </Card>

      {/* CPU */}
      <Card className="mt-6" title="CPU" right={<span className="text-sm font-semibold text-white">{info?.cpu.model ?? ''}</span>}>
        <div className="grid grid-cols-5 gap-3">
          <Stat label="Utilization" value={live ? fmt(live.cpu.usage) : null} unit="%" />
          <Stat label="Effective clock" value={live?.cpu.effectiveClockMHz != null ? (live.cpu.effectiveClockMHz / 1000).toFixed(2) : null} unit="GHz" sub={info?.cpu.baseClockMHz ? `base ${(info.cpu.baseClockMHz / 1000).toFixed(1)} GHz` : undefined} />
          <Stat label="Temperature" value={live?.cpu.tempC != null ? fmt(live.cpu.tempC) : null} unit="°C" tone={live?.cpu.tempC != null && live.cpu.tempC >= 95 ? 'bad' : 'default'} sub={live?.cpu.tempC == null ? 'Windows does not expose it without a vendor sensor driver' : undefined} />
          <Stat label="P-core avg" value={pCores ? fmt(avg(pCores)) : null} unit="%" sub={topo ? `${topo.pCoreThreads.length / 2} cores / ${topo.pCoreThreads.length} threads` : 'Layout unknown for this CPU'} />
          <Stat label="E-core avg" value={eCores ? fmt(avg(eCores)) : null} unit="%" sub={topo ? `${topo.eCoreThreads.length} cores` : undefined} />
        </div>
        <ThrottleNote live={live} base={info?.cpu.baseClockMHz ?? null} />
        <div className="mt-4">
          <div className="label mb-2">Per-thread load {topo && <span className="normal-case tracking-normal text-muted">(P = performance core thread, E = efficient core; layout from the published i5-14600K design)</span>}</div>
          <div className="grid grid-cols-10 gap-2">
            {(live?.cpu.perCore ?? []).map((v, i) => {
              const kind = topo ? (topo.pCoreThreads.includes(i) ? 'P' : 'E') : null;
              return (
                <div key={i} className={`rounded-lg border p-2 ${kind === 'P' ? 'border-neon/25 bg-neon/[0.03]' : 'border-line bg-panel2/60'}`}>
                  <div className="flex justify-between text-[10px] text-muted"><span>{kind ?? '#'}{i}</span><span className="num text-white">{v.toFixed(0)}%</span></div>
                  <div className="mt-1.5"><Bar value={v} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* RAM */}
      <div className="mt-6 grid grid-cols-[1fr_1fr] gap-6">
        <Card title="Memory (16 GB)">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total" value={live ? gb(live.ram.totalMB) : null} />
            <Stat label="Available" value={live ? gb(live.ram.availableMB) : null} tone={live && live.ram.availableMB < 3000 ? 'warn' : 'default'} />
            <Stat label="Used" value={live ? gb(live.ram.usedMB) : null} sub={live ? `${live.ram.percent.toFixed(0)}%` : undefined} />
            <Stat label="Fortnite" value={fnMem !== null ? gb(fnMem) : null} sub={live?.fortnite.running ? 'Working set' : 'Not running'} />
          </div>
          <div className="mt-3 text-sm text-muted">
            {info?.ram.modules.length ? <>Modules: {info.ram.modules.map((m) => `${(m.sizeMB / 1024).toFixed(0)} GB${m.speedMHz ? ` @ ${m.speedMHz}` : ''}`).join(' + ')} {info.ram.channelsHint === 'single' && <Badge tone="bad">Single channel</Badge>}</> : 'Module layout unavailable.'}
          </div>
          <div className="mt-2 text-sm text-muted">Closable background apps currently use <b className="text-white">{gb(bgMem)}</b>. TWECD does not use fake "RAM cleaning"; freeing memory means closing apps you don't need.</div>
        </Card>
        <Card title="Top memory users">
          <div className="max-h-[300px] overflow-y-auto pr-1">
            {procs.slice(0, 15).map((p) => (
              <div key={p.pid} className="flex items-center gap-3 border-b border-line/60 py-1.5 text-sm">
                <span className="flex-1 truncate">{p.name}</span>
                {p.category !== 'other' && <Badge tone={p.category === 'closable' ? 'warn' : p.category === 'game' ? 'good' : 'muted'}>{p.category}</Badge>}
                <span className="num w-20 text-right text-muted">{p.memMB.toFixed(0)} MB</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Card title="Utilization history"><LiveChart data={chart} series={[{ key: 'cpu', name: 'CPU', color: '#39FF14' }, { key: 'gpu', name: 'GPU', color: '#18C77A' }, { key: 'vram', name: 'VRAM', color: '#ffb020' }, { key: 'ram', name: 'RAM', color: '#7dd3fc' }]} /></Card>
        <Card title="Temperatures"><LiveChart data={temps} series={[{ key: 'gpuTemp', name: 'GPU', color: '#18C77A' }, { key: 'cpuTemp', name: 'CPU', color: '#39FF14' }]} max={110} unit="°C" area={false} /></Card>
      </div>
    </div>
  );
}

function ThrottleNote({ live, base }: { live: ReturnType<typeof useApp>['live']; base: number | null }) {
  if (!live) return null;
  const t = live.cpu.tempC; const clk = live.cpu.effectiveClockMHz;
  let msg: string; let tone: 'good' | 'warn' | 'bad' | 'muted' = 'muted';
  if (t !== null && t >= 100) { msg = `Thermal throttling likely: ${t.toFixed(0)} °C (i5-14600K limit is 100 °C).`; tone = 'bad'; }
  else if (clk !== null && base && live.cpu.usage > 60 && clk < base * 0.9) { msg = `Clock below base (${(clk / 1000).toFixed(2)} GHz) under load: possible power or thermal limit.`; tone = 'warn'; }
  else if (t === null && clk === null) msg = 'Thermal throttling detection needs CPU temperature or clock data, which is unavailable on this system.';
  else { msg = 'No throttling detected.'; tone = 'good'; }
  return <div className="mt-3 flex items-center gap-2 text-sm"><span className="label">Throttling:</span><Badge tone={tone}>{msg}</Badge></div>;
}
