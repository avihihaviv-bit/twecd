import type { Diagnosis, LoadProfileStats } from '../../shared/types';

/** One measured sample (one monitor tick) during a Fortnite session. */
export interface Tick {
  ts: number;
  fps: number;              // measured over the tick
  p99Ms: number;            // 99th percentile frame time in the tick
  cpuBusyMs: number | null; // PresentMon 2.x
  gpuBusyMs: number | null;
  cpu: number; maxCore: number;
  gpu: number | null; vramPct: number | null; ramPct: number;
  pagesPerSec: number | null;
  cpuTemp: number | null; gpuTemp: number | null; gpuReasons: string[];
  ping: number | null;      // null = lost or not measured
  pingMeasured: boolean;
  stutters: number;
  bgAppsMB: number | null;  // memory used by closable background apps (sampled)
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const r1 = (v: number | null) => (v === null ? '-' : v.toFixed(1));

/**
 * Splits measured seconds into LOW LOAD / NORMAL / INTENSE by their measured frame cost
 * (TWECD cannot see the screen; light scenes simply render faster). Needs >= 30 samples.
 */
export function loadProfiles(ticks: Tick[]): LoadProfileStats[] {
  if (ticks.length < 30) return [];
  const sorted = ticks.map((t) => t.fps).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.15)];
  const hi = sorted[Math.floor(sorted.length * 0.85)];
  const groups: Record<LoadProfileStats['id'], Tick[]> = { low: [], normal: [], intense: [] };
  for (const t of ticks) groups[t.fps >= hi ? 'low' : t.fps < lo ? 'intense' : 'normal'].push(t);
  const label = { low: 'Low load (light scenes, sky, menus)', normal: 'Normal gameplay', intense: 'Intense (fights, builds, late game)' };
  return (['low', 'normal', 'intense'] as const).map((id) => {
    const g = groups[id];
    const f = g.map((t) => t.fps);
    return {
      id, label: label[id], seconds: g.length,
      avgFps: mean(f), worstSecond: f.length ? Math.min(...f) : null, bestSecond: f.length ? Math.max(...f) : null,
      avgP99Ms: mean(g.map((t) => t.p99Ms)), avgCpu: mean(g.map((t) => t.maxCore)), avgGpu: mean(g.map((t) => t.gpu).filter((x): x is number => x !== null)),
    };
  });
}

type Ctx = { dx12: boolean; sessionStart: number };

/** Evidence-based bottleneck diagnosis over a session. Every item cites the measured numbers it is based on. */
export function diagnoseSession(ticks: Tick[], ctx: Ctx): Diagnosis[] {
  const out: Diagnosis[] = [];
  const n = ticks.length;
  if (n < 20) return out;
  const intense = loadProfiles(ticks).find((l) => l.id === 'intense');

  // --- per-second classification of what limited the frame
  const cls = { cpu: 0, gpu: 0, engine: 0 };
  let busyN = 0;
  for (const t of ticks) {
    const frame = 1000 / t.fps;
    if (t.cpuBusyMs !== null && t.gpuBusyMs !== null) {
      busyN++;
      if (t.gpuBusyMs >= frame * 0.85 && t.gpuBusyMs > t.cpuBusyMs) cls.gpu++;
      else if (t.cpuBusyMs >= frame * 0.85) cls.cpu++;
      else cls.engine++;
    } else if (t.gpu !== null && t.gpu >= 95) cls.gpu++;
    else if (t.maxCore >= 90 && (t.gpu ?? 100) < 85) cls.cpu++;
    else cls.engine++;
  }
  const cpuBusy = mean(ticks.map((t) => t.cpuBusyMs).filter((x): x is number => x !== null));
  const gpuBusy = mean(ticks.map((t) => t.gpuBusyMs).filter((x): x is number => x !== null));
  const avgFrame = mean(ticks.map((t) => 1000 / t.fps))!;
  const gpuAvg = mean(ticks.map((t) => t.gpu).filter((x): x is number => x !== null));
  const coreAvg = mean(ticks.map((t) => t.maxCore))!;
  const busyLine = cpuBusy !== null && gpuBusy !== null ? `Average per frame: CPU busy ${cpuBusy.toFixed(2)} ms, GPU busy ${gpuBusy.toFixed(2)} ms, frame time ${avgFrame.toFixed(2)} ms (${busyN} measured seconds).` : `PresentMon CPU/GPU busy times unavailable; based on utilization: GPU avg ${r1(gpuAvg)}%, busiest CPU core avg ${coreAvg.toFixed(0)}%.`;

  const primary = (Object.entries(cls) as [keyof typeof cls, number][]).sort((a, b) => b[1] - a[1])[0];
  if (primary[0] === 'gpu') out.push({
    kind: 'gpu', id: 'dx-gpu', area: 'Bottleneck', severity: 'warn', sharePct: pct(primary[1], n),
    title: `GPU-bound ${pct(primary[1], n)}% of the time`, detail: 'The RTX 5060 is the limit in most measured seconds.',
    evidence: [busyLine, `GPU limited the frame in ${primary[1]} of ${n} seconds.`],
    fix: 'Use Performance rendering mode, lower 3D Resolution (try 85-90%) or Textures; keep Shadows/Effects off.',
    expected: 'Lower GPU busy time per frame; measure with a Benchmark before and after.', risk: 'none', rollback: 'Restore Defaults restores your Fortnite settings file.',
  });
  else if (primary[0] === 'cpu') out.push({
    kind: 'cpu', id: 'dx-cpu', area: 'Bottleneck', severity: 'warn', sharePct: pct(primary[1], n),
    title: `CPU-bound ${pct(primary[1], n)}% of the time`, detail: 'The game\'s main/render thread on the i5-14600K is the limit; the GPU is waiting.',
    evidence: [busyLine, `CPU limited the frame in ${primary[1]} of ${n} seconds.`],
    fix: 'Close background apps (or enable Auto-Boost), lower View Distance, use the Ultimate Performance power plan. Lowering graphics will NOT help much here.',
    expected: 'Higher and steadier FPS in fights; verify with a Benchmark.', risk: 'low', rollback: 'Restore Defaults; re-open closed apps any time.',
  });
  else out.push({
    kind: 'engine', id: 'dx-engine', area: 'Bottleneck', severity: 'info', sharePct: pct(primary[1], n),
    title: `Game-engine limited ${pct(primary[1], n)}% of the time`, detail: 'Neither the CPU nor the GPU is saturated in most seconds: frames are limited by the engine (frame cap, synchronization, streaming).',
    evidence: [busyLine],
    fix: 'Check the Frame Rate Limit / Stable FPS Lock and that VSync is off. At this point a stable lock usually gives the best frame pacing.',
    expected: 'Flatter frame times rather than higher peaks.', risk: 'none', rollback: 'Set Unlimited in Stable FPS Lock.',
  });

  // --- thermal
  const hotCpu = ticks.filter((t) => (t.cpuTemp ?? 0) >= 95).length;
  const gpuThermal = ticks.filter((t) => t.gpuReasons.some((r) => /thermal/i.test(r))).length;
  if (hotCpu + gpuThermal > n * 0.05) out.push({
    kind: 'thermal', id: 'dx-thermal', area: 'Thermals', severity: 'bad', sharePct: pct(Math.max(hotCpu, gpuThermal), n),
    title: 'Thermal throttling detected', detail: 'Clocks were reduced because of temperature.',
    evidence: [hotCpu ? `CPU at 95 °C or more in ${hotCpu} seconds (max ${Math.max(...ticks.map((t) => t.cpuTemp ?? 0))} °C).` : '', gpuThermal ? `GPU reported a thermal clock limit in ${gpuThermal} seconds.` : ''].filter(Boolean),
    fix: 'Clean dust filters, check cooler mounting and fan curves, improve case airflow. Keep Intel Default Settings in BIOS.',
    expected: 'Fewer clock drops during long fights.', risk: 'none', rollback: 'Hardware change; nothing to roll back in Windows.',
  });

  // --- power limit (only meaningful when GPU-bound)
  const power = ticks.filter((t) => t.gpuReasons.some((r) => /power/i.test(r)) && (t.gpu ?? 0) >= 90).length;
  if (power > n * 0.3) out.push({
    kind: 'power', id: 'dx-power', area: 'GPU', severity: 'info', sharePct: pct(power, n),
    title: 'GPU at its power limit', detail: 'Normal under full load for the RTX 5060: the card boosts until its power limit.',
    evidence: [`GPU reported the power-limit flag while at 90%+ usage in ${power} of ${n} seconds.`],
    fix: 'No action needed. Raising power limits means overclocking, which TWECD does not do.', risk: 'none', rollback: '-',
  });

  // --- VRAM / RAM
  const vram = ticks.filter((t) => (t.vramPct ?? 0) >= 95).length;
  if (vram > n * 0.05) out.push({
    kind: 'vram', id: 'dx-vram', area: 'VRAM', severity: 'warn', sharePct: pct(vram, n),
    title: 'VRAM nearly full', detail: '8 GB VRAM was saturated; textures get swapped and cause hitches.',
    evidence: [`VRAM at 95%+ in ${vram} of ${n} seconds (peak ${Math.max(...ticks.map((t) => t.vramPct ?? 0)).toFixed(0)}%).`],
    fix: 'Lower Textures to Medium/Low, close browsers (they use VRAM too), use Performance mode.', expected: 'Fewer texture-streaming stutters.', risk: 'none', rollback: 'Restore Defaults.',
  });
  const ramHigh = ticks.filter((t) => t.ramPct >= 90).length;
  const paging = ticks.filter((t) => (t.pagesPerSec ?? 0) >= 1000).length;
  if (ramHigh > n * 0.05 || paging > n * 0.05) out.push({
    kind: 'ram', id: 'dx-ram', area: 'RAM', severity: 'warn', sharePct: pct(Math.max(ramHigh, paging), n),
    title: 'Memory pressure during play', detail: 'Windows had to move memory to disk, which causes stutters.',
    evidence: [ramHigh ? `RAM at 90%+ in ${ramHigh} seconds (peak ${Math.max(...ticks.map((t) => t.ramPct)).toFixed(0)}%).` : '', paging ? `Heavy paging (1000+ pages/s) in ${paging} seconds.` : ''].filter(Boolean),
    fix: 'Close memory-heavy apps before playing (Auto-Boost). With 16 GB, browsers + Discord + Fortnite can fill memory.', expected: 'Fewer long frame-time spikes.', risk: 'low', rollback: 'Re-open the apps.',
  });

  // --- background apps
  const bg = mean(ticks.map((t) => t.bgAppsMB).filter((x): x is number => x !== null));
  if (bg !== null && bg >= 1000) out.push({
    kind: 'background', id: 'dx-bg', area: 'Background apps', severity: 'warn', sharePct: null,
    title: 'Background apps running during matches', detail: 'Closable apps were using memory and CPU time while you played.',
    evidence: [`Closable background apps averaged ${(bg / 1024).toFixed(1)} GB of RAM during the session.`],
    fix: 'Turn on Auto-Boost in Settings so they close automatically when Fortnite starts.', expected: 'More free CPU time and memory for the game.', risk: 'low', rollback: 'Turn Auto-Boost off.',
  });

  // --- shader compilation (DX12): stutters concentrated in the first 3 minutes
  if (ctx.dx12) {
    const early = ticks.filter((t) => t.ts - ctx.sessionStart < 180000);
    const late = ticks.filter((t) => t.ts - ctx.sessionStart >= 180000);
    const rate = (a: Tick[]) => (a.length ? a.reduce((s, t) => s + t.stutters, 0) / a.length : 0);
    if (early.length >= 30 && late.length >= 30 && rate(early) > Math.max(0.5, rate(late) * 3)) out.push({
      kind: 'shader', id: 'dx-shader', area: 'Stutter', severity: 'info', sharePct: null,
      title: 'Likely shader compilation stutter (DirectX 12)', detail: 'Stutters were concentrated at the start of the session, typical of DX12 shader compilation.',
      evidence: [`${rate(early).toFixed(2)} stutters/s in the first 3 minutes vs ${rate(late).toFixed(2)}/s afterwards.`],
      fix: 'Expected after driver or game updates; it fades as shaders get cached. Do not clear the shader cache. Performance mode avoids it entirely.', risk: 'none', rollback: '-',
    });
  }

  // --- network
  const measured = ticks.filter((t) => t.pingMeasured);
  if (measured.length >= 20) {
    const lost = measured.filter((t) => t.ping === null).length;
    const got = measured.map((t) => t.ping).filter((x): x is number => x !== null);
    let jit = 0; for (let i = 1; i < got.length; i++) jit += Math.abs(got[i] - got[i - 1]);
    const jitter = got.length > 1 ? jit / (got.length - 1) : 0;
    const loss = (lost / measured.length) * 100;
    if (loss >= 2 || jitter >= 10) out.push({
      kind: 'network', id: 'dx-net', area: 'Network', severity: 'warn', sharePct: null,
      title: 'Unstable connection during play', detail: 'Ping spikes or packet loss feel like lag even when FPS is fine.',
      evidence: [`${loss.toFixed(1)}% packet loss and ${jitter.toFixed(1)} ms jitter across ${measured.length} probes during the session.`],
      fix: 'Use Ethernet instead of Wi-Fi, pause downloads/streams on other devices, then run the Ping Optimizer test to locate the problem.', risk: 'none', rollback: '-',
    });
  }

  if (intense && intense.avgFps !== null && intense.seconds > 0) {
    const first = out[0];
    first.evidence = [...(first.evidence ?? []), `Intense moments averaged ${intense.avgFps.toFixed(0)} FPS (worst second ${intense.worstSecond?.toFixed(0)}).`];
  }
  return out;
}
