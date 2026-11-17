// Streaming CSV parser for PresentMon output. Column names are discovered from the header
// so both PresentMon 1.x ("MsBetweenPresents") and 2.x ("FrameTime", "CPUBusy", "GPUBusy") work.

export interface PmColumns { app: number; frameTime: number; cpuBusy: number; gpuBusy: number; displayLatency: number }
export interface PmFrame { app: string; frameTimeMs: number; cpuBusyMs: number | null; gpuBusyMs: number | null; displayLatencyMs: number | null }

export function parseHeader(line: string): PmColumns | null {
  const cols = line.split(',').map((c) => c.trim());
  const find = (...names: string[]) => cols.findIndex((c) => names.includes(c));
  const frameTime = find('FrameTime', 'MsBetweenPresents');
  if (frameTime < 0) return null;
  return { app: find('Application', 'ProcessName'), frameTime, cpuBusy: find('CPUBusy'), gpuBusy: find('GPUBusy', 'MsGPUActive'), displayLatency: find('DisplayLatency', 'MsUntilDisplayed') };
}

export function parseRow(line: string, c: PmColumns): PmFrame | null {
  const parts = line.split(',');
  const ft = parseFloat(parts[c.frameTime]);
  if (!Number.isFinite(ft) || ft <= 0) return null;
  const num = (i: number) => { if (i < 0) return null; const v = parseFloat(parts[i]); return Number.isFinite(v) ? v : null; };
  return { app: c.app >= 0 ? parts[c.app] : '', frameTimeMs: ft, cpuBusyMs: num(c.cpuBusy), gpuBusyMs: num(c.gpuBusy), displayLatencyMs: num(c.displayLatency) };
}
