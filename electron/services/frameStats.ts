// Frame-time statistics computed ONLY from measured frame times (PresentMon).

export interface FrameStats {
  count: number;
  avgFps: number;
  low1Fps: number;
  low01Fps: number | null;
  avgMs: number;
  medianMs: number;
  stdMs: number;
  spikes: number;
  stutters: number;
  stabilityScore: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * Stability score (0..100), explained in the UI:
 *  50% - 1% low vs average FPS ratio  (0.9+ = perfect, 0.3 or lower = 0)
 *  30% - frame-time coefficient of variation (0 = perfect, 0.5 or higher = 0)
 *  20% - stutter rate (0 per 1000 frames = perfect, 10+ per 1000 = 0)
 */
export function computeFrameStats(frameTimesMs: number[]): FrameStats | null {
  const ft = frameTimesMs.filter((v) => Number.isFinite(v) && v > 0 && v < 5000);
  if (ft.length < 30) return null;
  const sorted = [...ft].sort((a, b) => a - b);
  const total = ft.reduce((s, v) => s + v, 0);
  const avgMs = total / ft.length;
  const medianMs = percentile(sorted, 50);
  const variance = ft.reduce((s, v) => s + (v - avgMs) ** 2, 0) / ft.length;
  const stdMs = Math.sqrt(variance);
  const p99 = percentile(sorted, 99);
  const p999 = ft.length >= 1000 ? percentile(sorted, 99.9) : null;
  let spikes = 0;
  let stutters = 0;
  for (const v of ft) {
    if (v > medianMs * 2) spikes++;
    if (v > medianMs * 2.5 && v - medianMs > 8) stutters++;
  }
  const avgFps = 1000 / avgMs;
  const low1Fps = 1000 / p99;
  const ratioScore = clamp01((low1Fps / avgFps - 0.3) / 0.6);
  const cvScore = clamp01(1 - stdMs / avgMs / 0.5);
  const stutterScore = clamp01(1 - (stutters / ft.length) * 1000 / 10);
  const stabilityScore = Math.round(100 * (0.5 * ratioScore + 0.3 * cvScore + 0.2 * stutterScore));
  return {
    count: ft.length, avgFps, low1Fps, low01Fps: p999 ? 1000 / p999 : null,
    avgMs, medianMs, stdMs, spikes, stutters, stabilityScore,
  };
}
