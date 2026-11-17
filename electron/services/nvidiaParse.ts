import type { GpuMetrics } from '../../shared/types';

export const NVSMI_FIELDS = [
  'name', 'driver_version', 'utilization.gpu', 'memory.used', 'memory.total', 'temperature.gpu',
  'clocks.gr', 'clocks.max.gr', 'power.draw', 'power.limit', 'clocks_event_reasons.active',
];

// Bitmask from NVML "clocks event reasons" (formerly throttle reasons).
const REASONS: [number, string][] = [
  [0x4, 'Power limit (SW power cap)'],
  [0x8, 'Hardware slowdown'],
  [0x20, 'Thermal limit (SW thermal slowdown)'],
  [0x40, 'Thermal limit (HW thermal slowdown)'],
  [0x80, 'Power brake (HW)'],
];

export function decodeReasons(hex: string): string[] {
  const v = parseInt(hex, 16);
  if (!Number.isFinite(v)) return [];
  return REASONS.filter(([bit]) => (v & bit) !== 0).map(([, s]) => s);
}

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim();
  if (!t || /n\/a|not supported|unknown|\[/i.test(t)) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

export function parseNvsmiLine(line: string): GpuMetrics | null {
  const p = line.split(',').map((s) => s.trim());
  if (p.length < 6 || !p[0] || /^name$/i.test(p[0])) return null;
  return {
    name: p[0], driver: p[1], usage: num(p[2]), vramUsedMB: num(p[3]), vramTotalMB: num(p[4]),
    tempC: num(p[5]), clockMHz: num(p[6]), maxClockMHz: num(p[7]), powerW: num(p[8]), powerLimitW: num(p[9]),
    throttleReasons: p[10] ? decodeReasons(p[10]) : [],
  };
}

/** BAR1 aperture from `nvidia-smi -q -d MEMORY`. ~256 MiB = Resizable BAR off; about the VRAM size = on. */
export function parseBar1TotalMB(text: string): number | null {
  const i = text.search(/BAR1 Memory Usage/i);
  if (i < 0) return null;
  const m = text.slice(i, i + 300).match(/Total\s*:\s*(\d+)\s*MiB/i);
  return m ? +m[1] : null;
}
export const rebarEnabled = (bar1MB: number | null, vramMB: number | null) => (bar1MB === null ? null : bar1MB >= Math.max(1024, (vramMB ?? 0) * 0.5));
