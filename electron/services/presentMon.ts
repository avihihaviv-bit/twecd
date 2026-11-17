import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { FpsMetrics } from '../../shared/types';
import { computeFrameStats } from './frameStats';
import { parseHeader, parseRow, type PmColumns } from './presentmonParse';

const WINDOW = 6000;    // frames kept for rolling stats (~8-30 s depending on FPS)
const GRAPH = 240;      // frames sent to the UI graph

/**
 * Real FPS / frame-time capture through Intel PresentMon (MIT licensed, ETW based).
 * PresentMon reads presentation events from Windows; it does not touch the game process,
 * its memory, or anti-cheat. ETW capture needs administrator rights or membership in
 * the "Performance Log Users" group.
 */
export class PresentMonCapture {
  status = 'Waiting for Fortnite';
  private child: ChildProcess | null = null;
  private frames: number[] = [];
  private cpuBusy: number[] = [];
  private gpuBusy: number[] = [];
  private dispLat: number[] = [];
  private lastSec: number[] = [];
  private recording: number[] | null = null;
  private totalStutters = 0;
  private median = 0;
  processName = '';
  private triedLegacy = false;
  // Whole-session frame-time histogram: 0.05 ms bins up to 200 ms (exact enough for 1% low, constant memory).
  private hist = new Uint32Array(4001);
  private histN = 0;
  resetSession() { this.hist.fill(0); this.histN = 0; }
  /** 1% low FPS over every frame captured since resetSession(). Null with < 1000 frames. */
  sessionLow1(): number | null {
    if (this.histN < 1000) return null;
    const target = this.histN * 0.99;
    let acc = 0;
    for (let i = 0; i < this.hist.length; i++) { acc += this.hist[i]; if (acc >= target) return 1000 / Math.max(0.05, i * 0.05); }
    return null;
  }

  constructor(private exePath: () => string | null) {}

  get running() { return !!this.child; }

  static resolve(custom: string | null, resourcesPath: string): string | null {
    const candidates = [custom, path.join(resourcesPath, 'bin', 'PresentMon.exe'), path.join(process.cwd(), 'resources', 'bin', 'PresentMon.exe')];
    return candidates.find((c) => !!c && fs.existsSync(c)) ?? null;
  }

  start(processName: string, legacy = false) {
    if (this.child) return;
    const exe = this.exePath();
    if (!exe) { this.status = 'PresentMon not installed: FPS capture unavailable'; return; }
    this.processName = processName;
    this.frames = []; this.cpuBusy = []; this.gpuBusy = []; this.lastSec = [];
    const d = legacy ? '-' : '--';
    const args = [`${d}process_name`, processName, `${d}output_stdout`, `${d}stop_existing_session`, `${d}session_name`, 'TWECD_FPS', `${d}terminate_on_proc_exit`];
    let cols: PmColumns | null = null;
    let stderr = '';
    const startedAt = Date.now();
    try { this.child = spawn(exe, args, { windowsHide: true }); } catch (e) { this.status = `PresentMon failed to start: ${e}`; return; }
    this.status = 'Starting frame capture...';
    const rl = readline.createInterface({ input: this.child.stdout! });
    rl.on('line', (line) => {
      if (!cols) { cols = parseHeader(line); if (cols) this.status = 'Capturing'; return; }
      const f = parseRow(line, cols);
      if (!f) return;
      this.push(f.frameTimeMs, f.cpuBusyMs, f.gpuBusyMs);
      if (f.displayLatencyMs !== null && f.displayLatencyMs > 0 && f.displayLatencyMs < 500) { this.dispLat.push(f.displayLatencyMs); if (this.dispLat.length > 600) this.dispLat.shift(); }
    });
    this.child.stderr?.on('data', (b) => (stderr += b.toString()));
    this.child.on('error', (e) => { this.status = `PresentMon error: ${e.message}`; this.child = null; });
    this.child.on('exit', (code) => {
      this.child = null;
      const quick = Date.now() - startedAt < 3000;
      if (quick && !legacy && !this.triedLegacy && /unrecognized|unknown|invalid/i.test(stderr)) { this.triedLegacy = true; this.start(processName, true); return; }
      if (/access|denied|privilege|elevat|admin/i.test(stderr) || code === 5) this.status = 'FPS capture needs administrator rights. Use "Restart as administrator" in Settings.';
      else if (quick) this.status = `PresentMon exited (${stderr.trim().slice(0, 160) || 'code ' + code})`;
      else this.status = 'Capture stopped';
    });
  }

  stop() { this.child?.kill(); this.child = null; if (!this.status.startsWith('FPS capture needs')) this.status = 'Waiting for Fortnite'; }

  private push(ft: number, cpu: number | null, gpu: number | null) {
    this.frames.push(ft); if (this.frames.length > WINDOW) this.frames.shift();
    this.lastSec.push(ft);
    if (cpu !== null) { this.cpuBusy.push(cpu); if (this.cpuBusy.length > 600) this.cpuBusy.shift(); }
    if (gpu !== null) { this.gpuBusy.push(gpu); if (this.gpuBusy.length > 600) this.gpuBusy.shift(); }
    if (this.recording) this.recording.push(ft);
    this.hist[Math.min(4000, Math.round(ft / 0.05))]++; this.histN++;
    if (this.median > 0 && ft > this.median * 2.5 && ft - this.median > 8) this.totalStutters++;
  }

  /** Called once per tick: returns metrics for the last ~1 s and rolling window, or null when no frames. */
  metrics(): FpsMetrics | null {
    const sec = this.lastSec; this.lastSec = [];
    const stats = computeFrameStats(this.frames);
    if (!stats || sec.length === 0) return null;
    this.median = stats.medianMs;
    const secMs = sec.reduce((a, b) => a + b, 0);
    const secSorted = [...sec].sort((a, b) => a - b);
    const tickP99Ms = secSorted[Math.min(secSorted.length - 1, Math.ceil(secSorted.length * 0.99) - 1)];
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return {
      source: 'presentmon', processName: this.processName,
      fps: (sec.length / secMs) * 1000, avg: stats.avgFps, low1: stats.low1Fps, low01: stats.low01Fps,
      frameTimesMs: this.frames.slice(-GRAPH), frameTimeAvgMs: stats.avgMs, frameTimeStdMs: stats.stdMs,
      spikes: stats.spikes, stutters: stats.stutters, stabilityScore: stats.stabilityScore,
      cpuBusyMs: mean(this.cpuBusy), gpuBusyMs: mean(this.gpuBusy), sampleCount: stats.count,
      tickP99Ms, tickMaxMs: secSorted[secSorted.length - 1], displayLatencyMs: mean(this.dispLat),
    };
  }

  takeStutterCount() { const n = this.totalStutters; this.totalStutters = 0; return n; }
  startRecording() { this.recording = []; }
  stopRecording(): number[] { const r = this.recording ?? []; this.recording = null; return r; }
}
