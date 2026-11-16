import os from 'node:os';
import type { FortniteState, LiveMetrics, PerfDropEvent, SessionSummary } from '../../shared/types';
import { CpuMonitor } from './cpuMonitor';
import { GpuMonitor } from './gpuMonitor';
import { PresentMonCapture } from './presentMon';
import { FORTNITE_EXE } from './processCatalog';
import { isWin, run } from './exec';

export interface HubOptions {
  intervalMs: () => number;
  trackWhileHidden: () => boolean;
  baseClockMHz: () => number | null;
  presentMonPath: () => string | null;
  emit: (m: LiveMetrics) => void;
}

/**
 * Orchestrates all live monitoring.
 *  - Visible window: full sampling at the configured interval, pushed to the UI.
 *  - Hidden/minimized: GPU/clock streams stop; only a cheap Fortnite check every 10 s.
 *    If Fortnite is running and session tracking is enabled, a light 2 s sampler records the session.
 */
export class MonitorHub {
  readonly cpu = new CpuMonitor();
  readonly gpu = new GpuMonitor();
  readonly pm: PresentMonCapture;
  latest: LiveMetrics | null = null;
  private visible = true;
  private timer: NodeJS.Timeout | null = null;
  private fnTimer: NodeJS.Timeout | null = null;
  private fortnite: FortniteState = { running: false, pid: null, memMB: null, startedAt: null };
  private session: (SessionSummary & { _n: number; _cpu: number; _gpu: number; _gpuN: number; _fps: number[] }) | null = null;
  private lastSession: SessionSummary | null = null;
  private lastDropTs = 0;
  private listeners = new Set<(m: LiveMetrics) => void>();

  constructor(private o: HubOptions) {
    this.pm = new PresentMonCapture(o.presentMonPath);
  }

  start() { this.applyMode(); this.checkFortnite(); }

  setVisible(v: boolean) {
    if (this.visible === v) return;
    this.visible = v;
    this.applyMode();
  }

  onSample(fn: (m: LiveMetrics) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  restart() { this.stopTimers(); this.gpu.stop(); this.applyMode(); }

  private stopTimers() { if (this.timer) clearInterval(this.timer); if (this.fnTimer) clearInterval(this.fnTimer); this.timer = this.fnTimer = null; }

  private applyMode() {
    this.stopTimers();
    const tracking = this.fortnite.running && this.o.trackWhileHidden();
    if (this.visible || this.listeners.size > 0) {
      const iv = this.o.intervalMs();
      this.gpu.start(iv);
      this.cpu.startClock();
      this.timer = setInterval(() => void this.tick(true), iv);
      this.fnTimer = setInterval(() => void this.checkFortnite(), 3000);
    } else if (tracking) {
      this.gpu.start(2000);
      this.cpu.stopClock();
      this.timer = setInterval(() => void this.tick(false), 2000);
      this.fnTimer = setInterval(() => void this.checkFortnite(), 10000);
    } else {
      this.gpu.stop();
      this.cpu.stopClock();
      this.fnTimer = setInterval(() => void this.checkFortnite(), 10000);
    }
  }

  /** Benchmarks hold the sampler on even when minimized. */
  hold(fn: (m: LiveMetrics) => void) { const off = this.onSample(fn); this.applyMode(); return () => { off(); this.applyMode(); }; }

  private async tick(emitToUi: boolean) {
    const c = this.cpu.sample();
    void this.cpu.refreshTemp();
    const total = os.totalmem() / 1048576;
    const avail = os.freemem() / 1048576;
    const base = this.o.baseClockMHz();
    const fps = this.pm.metrics();
    const m: LiveMetrics = {
      ts: Date.now(),
      cpu: { usage: c.usage, perCore: c.perCore, effectiveClockMHz: this.cpu.perfPct !== null && base ? (base * this.cpu.perfPct) / 100 : null, tempC: this.cpu.tempC },
      ram: { totalMB: total, availableMB: avail, usedMB: total - avail, percent: ((total - avail) / total) * 100 },
      gpu: this.gpu.latest, gpuStatus: this.gpu.latest ? 'OK' : this.gpu.status,
      fortnite: { ...this.fortnite },
      fps, fpsStatus: fps ? 'Capturing' : this.fortnite.running ? this.pm.status : 'Start Fortnite to measure FPS',
    };
    this.latest = m;
    this.recordSession(m);
    for (const l of this.listeners) l(m);
    if (emitToUi && this.visible) this.o.emit(m);
  }

  private async checkFortnite() {
    let pid: number | null = null; let memMB: number | null = null;
    if (isWin) {
      const r = await run('tasklist', ['/fi', `IMAGENAME eq ${FORTNITE_EXE}`, '/fo', 'csv', '/nh'], 8000);
      const m = r.stdout.match(/^"[^"]+","(\d+)","[^"]*","[^"]*","([^"]*)"/m);
      if (m) { pid = +m[1]; memMB = (parseInt(m[2].replace(/\D/g, ''), 10) || 0) / 1024; }
    }
    const was = this.fortnite.running;
    this.fortnite = { running: pid !== null, pid, memMB, startedAt: pid !== null ? this.fortnite.startedAt ?? Date.now() : null };
    if (!was && pid !== null) this.onFortniteStart();
    if (was && pid === null) this.onFortniteStop();
  }

  private onFortniteStart() {
    this.pm.start(FORTNITE_EXE);
    this.session = { startedAt: Date.now(), endedAt: null, durationSec: 0, avgFps: null, low1: null, stabilityScore: null, avgCpu: 0, avgGpu: null, peakVramMB: null, peakRamPct: 0, drops: [], _n: 0, _cpu: 0, _gpu: 0, _gpuN: 0, _fps: [] };
    this.applyMode();
  }

  private onFortniteStop() {
    this.pm.stop();
    if (this.session) { this.session.endedAt = Date.now(); this.lastSession = this.publicSession(); }
    this.session = null;
    this.applyMode();
  }

  private recordSession(m: LiveMetrics) {
    const s = this.session;
    if (!s) return;
    s._n++; s._cpu += m.cpu.usage;
    if (m.gpu?.usage != null) { s._gpu += m.gpu.usage; s._gpuN++; }
    if (m.gpu?.vramUsedMB != null) s.peakVramMB = Math.max(s.peakVramMB ?? 0, m.gpu.vramUsedMB);
    s.peakRamPct = Math.max(s.peakRamPct, m.ram.percent);
    s.durationSec = Math.round((Date.now() - s.startedAt) / 1000);
    if (!m.fps) return;
    s._fps.push(m.fps.fps); if (s._fps.length > 3600) s._fps.shift();
    s.avgFps = m.fps.avg; s.low1 = m.fps.low1; s.stabilityScore = m.fps.stabilityScore;
    // Drop detection against the session's own median (needs 20 s of data)
    const stutters = this.pm.takeStutterCount();
    if (Date.now() - this.lastDropTs < 5000) return;
    const sorted = [...s._fps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const cause = likelyCause(m);
    if (s._fps.length >= 20 && median > 30 && m.fps.fps < median * 0.7) {
      this.pushDrop({ ts: m.ts, kind: 'fps-drop', detail: `FPS fell to ${m.fps.fps.toFixed(0)} (session median ${median.toFixed(0)})`, likelyCause: cause });
    } else if (stutters >= 3) {
      this.pushDrop({ ts: m.ts, kind: 'stutter', detail: `${stutters} frame-time spikes in the last sample`, likelyCause: cause });
    }
  }

  private pushDrop(e: PerfDropEvent) {
    this.lastDropTs = e.ts;
    this.session!.drops.push(e);
    if (this.session!.drops.length > 100) this.session!.drops.shift();
  }

  private publicSession(): SessionSummary | null {
    const s = this.session;
    if (!s) return null;
    return { startedAt: s.startedAt, endedAt: s.endedAt, durationSec: s.durationSec, avgFps: s.avgFps, low1: s.low1, stabilityScore: s.stabilityScore, avgCpu: s._n ? s._cpu / s._n : 0, avgGpu: s._gpuN ? s._gpu / s._gpuN : null, peakVramMB: s.peakVramMB, peakRamPct: s.peakRamPct, drops: [...s.drops] };
  }

  getSession(): { current: SessionSummary | null; last: SessionSummary | null } { return { current: this.publicSession(), last: this.lastSession }; }

  shutdown() { this.stopTimers(); this.gpu.stop(); this.cpu.stopClock(); this.pm.stop(); }
}

export function likelyCause(m: LiveMetrics): string {
  const vramPct = m.gpu?.vramUsedMB != null && m.gpu.vramTotalMB ? (m.gpu.vramUsedMB / m.gpu.vramTotalMB) * 100 : null;
  const maxCore = Math.max(0, ...m.cpu.perCore);
  if (vramPct !== null && vramPct >= 95) return `VRAM nearly full (${vramPct.toFixed(0)}%) - lower Textures`;
  if (m.ram.percent >= 90) return `RAM nearly full (${m.ram.percent.toFixed(0)}%) - close background apps`;
  if (m.gpu?.throttleReasons.length) return `GPU limited: ${m.gpu.throttleReasons.join(', ')}`;
  if (m.gpu?.usage != null && m.gpu.usage >= 95) return `GPU at ${m.gpu.usage.toFixed(0)}% - GPU-bound scene`;
  if (maxCore >= 95 && (m.gpu?.usage ?? 100) < 85) return `CPU core at ${maxCore.toFixed(0)}% - CPU/main-thread bound`;
  return 'No single resource saturated (shader compilation, streaming or network events are common causes)';
}
