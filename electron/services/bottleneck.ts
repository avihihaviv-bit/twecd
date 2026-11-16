import type { Finding } from '../../shared/types';

export interface PerfSample { cpu: number; maxCore: number; gpu: number | null; vramPct: number | null; ramPct: number; cpuBusyMs?: number | null; gpuBusyMs?: number | null; frameMs?: number | null }

/** Bottleneck analysis from real samples. Prefers PresentMon CPU/GPU busy times when present. */
export function analyzeBottleneck(samples: PerfSample[]): Finding[] {
  const out: Finding[] = [];
  if (samples.length === 0) return out;
  const avg = (f: (s: PerfSample) => number | null | undefined) => {
    const v = samples.map(f).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const gpu = avg((s) => s.gpu);
  const maxCore = avg((s) => s.maxCore);
  const vram = avg((s) => s.vramPct);
  const ram = avg((s) => s.ramPct)!;
  const cpuBusy = avg((s) => s.cpuBusyMs);
  const gpuBusy = avg((s) => s.gpuBusyMs);
  const frame = avg((s) => s.frameMs);

  if (cpuBusy !== null && gpuBusy !== null && frame !== null) {
    if (gpuBusy > cpuBusy * 1.15 && gpuBusy > frame * 0.85) {
      out.push({ id: 'bn-gpu', area: 'Bottleneck', severity: 'warn', title: 'GPU-bound (measured per frame)', detail: `GPU work ${gpuBusy.toFixed(2)} ms vs CPU ${cpuBusy.toFixed(2)} ms per frame. Lower 3D Resolution, shadows or effects to raise FPS.` });
    } else if (cpuBusy > gpuBusy * 1.15) {
      out.push({ id: 'bn-cpu', area: 'Bottleneck', severity: 'warn', title: 'CPU-bound (measured per frame)', detail: `CPU work ${cpuBusy.toFixed(2)} ms vs GPU ${gpuBusy.toFixed(2)} ms per frame. Close background apps, use Performance mode, lower View Distance.` });
    } else {
      out.push({ id: 'bn-bal', area: 'Bottleneck', severity: 'good', title: 'CPU and GPU are balanced', detail: `CPU ${cpuBusy.toFixed(2)} ms / GPU ${gpuBusy.toFixed(2)} ms per frame.` });
    }
  } else if (gpu !== null) {
    if (gpu >= 95) out.push({ id: 'bn-gpu', area: 'Bottleneck', severity: 'info', title: 'GPU fully utilized', detail: `Average GPU usage ${gpu.toFixed(0)}%. Under game load this means the GPU limits FPS.` });
    else if (maxCore !== null && maxCore >= 90 && gpu < 85) out.push({ id: 'bn-cpu', area: 'Bottleneck', severity: 'warn', title: 'Possible CPU limit', detail: `Busiest core at ${maxCore.toFixed(0)}% while GPU is at ${gpu.toFixed(0)}%. Under game load this indicates a CPU/main-thread limit.` });
  }
  if (vram !== null && vram >= 90) out.push({ id: 'bn-vram', area: 'VRAM', severity: 'warn', title: 'High VRAM pressure', detail: `VRAM ${vram.toFixed(0)}% used. With 8 GB, lower Textures or use Performance mode to avoid stutter.` });
  if (ram >= 85) out.push({ id: 'bn-ram', area: 'RAM', severity: 'warn', title: 'High RAM pressure', detail: `RAM ${ram.toFixed(0)}% used. Close background apps before playing; 16 GB is tight with browsers + Discord + Fortnite.` });
  return out;
}
