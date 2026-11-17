import { randomUUID } from 'node:crypto';
import type { BenchmarkProgress, BenchmarkRequest, BenchmarkResult, LiveMetrics } from '../../shared/types';
import { computeFrameStats } from './frameStats';
import type { MonitorHub } from './monitor';
import { pingSeries } from './network';
import { loadProfiles, type Tick } from './sessionAnalysis';
import { currentProfile } from './fortniteFiles';

/** Records REAL metrics for a fixed duration. FPS fields stay null if no frames were captured. */
export async function runBenchmark(req: BenchmarkRequest, hub: MonitorHub, onProgress: (p: BenchmarkProgress) => void): Promise<BenchmarkResult> {
  const samples: LiveMetrics[] = [];
  const start = Date.now();
  hub.pm.startRecording();
  const release = hub.hold((m) => { samples.push(m); onProgress({ elapsedSec: Math.min(req.durationSec, Math.round((Date.now() - start) / 1000)), durationSec: req.durationSec }); });
  const ping = pingSeries({ label: 'Benchmark', host: req.pingHost }, Math.max(5, Math.floor(req.durationSec)));
  await new Promise((r) => setTimeout(r, req.durationSec * 1000));
  release();
  const frames = hub.pm.stopRecording();
  const net = await ping;
  const stats = computeFrameStats(frames);
  const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const fortniteRunning = samples.some((s) => s.fortnite.running);
  const fpsTicks: Tick[] = samples.filter((s) => s.fps).map((s) => ({ ts: s.ts, fps: s.fps!.fps, p99Ms: s.fps!.tickP99Ms, cpuBusyMs: s.fps!.cpuBusyMs, gpuBusyMs: s.fps!.gpuBusyMs, cpu: s.cpu.usage, maxCore: Math.max(0, ...s.cpu.perCore), gpu: s.gpu?.usage ?? null, vramPct: null, ramPct: s.ram.percent, pagesPerSec: null, cpuTemp: null, gpuTemp: null, gpuReasons: [], ping: null, pingMeasured: false, stutters: 0, bgAppsMB: null }));
  const notes: string[] = [];
  if (!stats) notes.push(fortniteRunning ? 'FPS not captured (PresentMon unavailable or needs administrator rights).' : 'Fortnite was not running: FPS not measured. Benchmark in the same Fortnite scene for a fair comparison.');
  return {
    id: randomUUID(), label: req.label, ts: start, durationSec: req.durationSec, fortniteRunning, profile: currentProfile(),
    maxFps: fpsTicks.length ? Math.max(...fpsTicks.map((t) => t.fps)) : null, minFps: fpsTicks.length ? Math.min(...fpsTicks.map((t) => t.fps)) : null,
    jitter: net.jitter, loads: loadProfiles(fpsTicks),
    scenario: req.scenario ?? 'other',
    low01: frames.length >= 1000 ? stats?.low01Fps ?? null : null,
    cpuTempAvg: avg(samples.map((s) => s.cpu.tempC)), gpuTempAvg: avg(samples.map((s) => s.gpu?.tempC)),
    cpuClockAvg: avg(samples.map((s) => s.cpu.effectiveClockMHz)), gpuClockAvg: avg(samples.map((s) => s.gpu?.clockMHz)),
    displayLatencyMs: avg(samples.map((s) => s.fps?.displayLatencyMs)),
    avgFps: stats?.avgFps ?? null, low1: stats?.low1Fps ?? null, frameTimeStdMs: stats?.stdMs ?? null, stabilityScore: stats?.stabilityScore ?? null,
    avgCpu: avg(samples.map((s) => s.cpu.usage)) ?? 0, avgGpu: avg(samples.map((s) => s.gpu?.usage)),
    avgRamMB: avg(samples.map((s) => s.ram.usedMB)) ?? 0, avgVramMB: avg(samples.map((s) => s.gpu?.vramUsedMB)),
    pingAvg: net.avg, packetLossPct: net.sent ? net.lossPct : null, pingHost: req.pingHost, notes,
  };
}
