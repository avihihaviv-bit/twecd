import os from 'node:os';
import type { FortniteState, LiveMetrics, PerfDropEvent, SessionSummary } from '../../shared/types';
import { CpuMonitor } from './cpuMonitor';
import { GpuMonitor } from './gpuMonitor';
import { PresentMonCapture } from './presentMon';
import { PerfAgent } from './perfAgent';
import { LivePinger } from './livePing';
import { FORTNITE_EXE } from './processCatalog';
import { isWin, run } from './exec';
import { recommendCap } from './fortniteConfig';
import { diagnoseSession, loadProfiles, type Tick } from './sessionAnalysis';
import { listProcesses } from './windows';

export interface HubOptions {
  intervalMs: () => number;
  trackWhileHidden: () => boolean;
  baseClockMHz: () => number | null;
  presentMonPath: () => string | null;
  pingHost: () => string;
  isDx12: () => boolean;
  emit: (m: LiveMetrics) => void;
  onFortniteStart?: () => void;
  onFortniteStop?: () => void;
}

interface Session { startedAt: number; endedAt: number | null; ticks: Tick[]; drops: PerfDropEvent[]; dx12: boolean; bgAppsMB: number | null; lastBgCheck: number }

const MAX_TICKS = 3600;

/**
 * Orchestrates all live monitoring.
 *  - Visible window: full sampling at the configured interval (GPU stream, perf counters, live ping), pushed to the UI.
 *  - Hidden/minimized with Fortnite running: only a light 2 s sampler (GPU stream + ping) records the session.
 *  - Hidden otherwise: everything stops except a Fortnite check every 10 s.
 */
export class MonitorHub {
  readonly cpu = new CpuMonitor();
  readonly gpu = new GpuMonitor();
  readonly agent = new PerfAgent();
  readonly pinger: LivePinger;
  readonly pm: PresentMonCapture;
  latest: LiveMetrics | null = null;
  private visible = true;
  private timer: NodeJS.Timeout | null = null;
  private fnTimer: NodeJS.Timeout | null = null;
  private fortnite: FortniteState = { running: false, pid: null, memMB: null, startedAt: null };
  private session: Session | null = null;
  private lastSession: SessionSummary | null = null;
  private lastDropTs = 0;
  private listeners = new Set<(m: LiveMetrics) => void>();

  constructor(private o: HubOptions) {
    this.pm = new PresentMonCapture(o.presentMonPath);
    this.pinger = new LivePinger(o.pingHost);
  }

  start() { this.applyMode(); void this.checkFortnite(); }

  setVisible(v: boolean) { if (this.visible === v) return; this.visible = v; this.applyMode(); }

  onSample(fn: (m: LiveMetrics) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  restart() { this.stopTimers(); this.gpu.stop(); this.applyMode(); }

  private stopTimers() { if (this.timer) clearInterval(this.timer); if (this.fnTimer) clearInterval(this.fnTimer); this.timer = this.fnTimer = null; }

  private applyMode() {
    this.stopTimers();
    const tracking = this.fortnite.running && this.o.trackWhileHidden();
    if (this.visible || this.listeners.size > 0) {
      const iv = this.o.intervalMs();
      this.gpu.start(iv); this.agent.start(); this.pinger.start();
      this.timer = setInterval(() => void this.tick(true), iv);
      this.fnTimer = setInterval(() => void this.checkFortnite(), 3000);
    } else if (tracking) {
      this.gpu.start(2000); this.agent.stop(); this.pinger.start();
      this.timer = setInterval(() => void this.tick(false), 2000);
      this.fnTimer = setInterval(() => void this.checkFortnite(), 10000);
    } else {
      this.gpu.stop(); this.agent.stop(); this.pinger.stop();
      this.fnTimer = setInterval(() => void this.checkFortnite(), 10000);
    }
  }

  /** Benchmarks and scans hold the sampler on even when minimized. */
  hold(fn: (m: LiveMetrics) => void) { const off = this.onSample(fn); this.applyMode(); return () => { off(); this.applyMode(); }; }

  private async tick(emitToUi: boolean) {
    const c = this.cpu.sample();
    void this.cpu.refreshTemp();
    const total = os.totalmem() / 1048576;
    const avail = os.freemem() / 1048576;
    const base = this.o.baseClockMHz();
    const fps = this.pm.metrics();
    const perf = this.agent.perfPct;
    const m: LiveMetrics = {
      ts: Date.now(),
      cpu: { usage: c.usage, perCore: c.perCore, effectiveClockMHz: perf !== null && base ? (base * perf) / 100 : null, tempC: this.cpu.tempC },
      ram: { totalMB: total, availableMB: avail, usedMB: total - avail, percent: ((total - avail) / total) * 100 },
      gpu: this.gpu.latest, gpuStatus: this.gpu.latest ? 'OK' : this.gpu.status,
      fortnite: { ...this.fortnite },
      fps, fpsStatus: fps ? 'Capturing' : this.fortnite.running ? this.pm.status : 'Start Fortnite to measure FPS',
      net: this.pinger.snapshot(),
      netStatus: this.pinger.error ?? (this.pinger.snapshot() ? 'OK' : 'Measuring...'),
      mem: this.agent.mem,
      bottleneck: null,
    };
    if (fps) m.bottleneck = likelyCause(m);
    this.latest = m;
    this.recordSession(m);
    for (const l of this.listeners) l(m);
    if (emitToUi && this.visible) this.o.emit(m);
  }

  private async checkFortnite() {
    let pid: number | null = null; let memMB: number | null = null;
    if (isWin) {
      const r = await run('tasklist', ['/fi', `IMAGENAME eq ${FORTNITE_EXE}`, '/fo', 'csv', '/nh'], 8000);
      const mm = r.stdout.match(/^"[^"]+","(\d+)","[^"]*","[^"]*","([^"]*)"/m);
      if (mm) { pid = +mm[1]; memMB = (parseInt(mm[2].replace(/\D/g, ''), 10) || 0) / 1024; }
    }
    const was = this.fortnite.running;
    this.fortnite = { running: pid !== null, pid, memMB, startedAt: pid !== null ? this.fortnite.startedAt ?? Date.now() : null };
    if (!was && pid !== null) this.onFortniteStart();
    if (was && pid === null) this.onFortniteStop();
  }

  private onFortniteStart() {
    try { this.o.onFortniteStart?.(); } catch { /* never block monitoring */ }
    this.pm.resetSession();
    this.pm.start(FORTNITE_EXE);
    let dx12 = false; try { dx12 = this.o.isDx12(); } catch { /* unknown */ }
    this.session = { startedAt: Date.now(), endedAt: null, ticks: [], drops: [], dx12, bgAppsMB: null, lastBgCheck: 0 };
    this.applyMode();
  }

  private onFortniteStop() {
    this.pm.stop();
    if (this.session) { this.session.endedAt = Date.now(); this.lastSession = this.summary(this.session); }
    this.session = null;
    this.applyMode();
    // Fortnite writes its settings file on exit; wait before touching it.
    setTimeout(() => { try { this.o.onFortniteStop?.(); } catch { /* ignore */ } }, 8000);
  }

  private recordSession(m: LiveMetrics) {
    const s = this.session;
    if (!s) return;
    // Background app memory, sampled cheaply every 30 s (tasklist, no CPU sampling)
    if (Date.now() - s.lastBgCheck > 30000) {
      s.lastBgCheck = Date.now();
      void listProcesses(false).then((ps) => { s.bgAppsMB = ps.filter((p) => p.category === 'closable').reduce((a, p) => a + p.memMB, 0); }).catch(() => undefined);
    }
    const ping = this.pinger.takeSample();
    const stutters = this.pm.takeStutterCount();
    if (!m.fps) return;
    const vramPct = m.gpu?.vramUsedMB != null && m.gpu.vramTotalMB ? (m.gpu.vramUsedMB / m.gpu.vramTotalMB) * 100 : null;
    s.ticks.push({
      ts: m.ts, fps: m.fps.fps, p99Ms: m.fps.tickP99Ms, cpuBusyMs: m.fps.cpuBusyMs, gpuBusyMs: m.fps.gpuBusyMs,
      cpu: m.cpu.usage, maxCore: Math.max(0, ...m.cpu.perCore), gpu: m.gpu?.usage ?? null, vramPct, ramPct: m.ram.percent,
      pagesPerSec: m.mem?.pagesPerSec ?? null, cpuTemp: m.cpu.tempC, gpuTemp: m.gpu?.tempC ?? null, gpuReasons: m.gpu?.throttleReasons ?? [],
      ping: ping.ping, pingMeasured: ping.measured, stutters, bgAppsMB: s.bgAppsMB,
    });
    if (s.ticks.length > MAX_TICKS) s.ticks.shift();

    // Drop detection against the session's own median (needs 20 samples)
    if (Date.now() - this.lastDropTs < 5000 || s.ticks.length < 20) return;
    const sorted = s.ticks.map((t) => t.fps).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const cause = likelyCause(m);
    if (median > 30 && m.fps.fps < median * 0.7) this.pushDrop(s, { ts: m.ts, kind: 'fps-drop', detail: `FPS fell to ${m.fps.fps.toFixed(0)} (session median ${median.toFixed(0)})`, likelyCause: cause });
    else if (stutters >= 3) this.pushDrop(s, { ts: m.ts, kind: 'stutter', detail: `${stutters} frame-time spikes in the last sample`, likelyCause: cause });
  }

  private pushDrop(s: Session, e: PerfDropEvent) {
    this.lastDropTs = e.ts;
    s.drops.push(e);
    if (s.drops.length > 100) s.drops.shift();
  }

  private summary(s: Session): SessionSummary {
    const t = s.ticks;
    const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const rec = recommendCap(t.map((x) => x.fps));
    const latestFps = this.latest?.fps;
    return {
      startedAt: s.startedAt, endedAt: s.endedAt, durationSec: Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000),
      avgFps: avg(t.map((x) => x.fps)), low1: latestFps?.low1 ?? null, stabilityScore: latestFps?.stabilityScore ?? null,
      sustainedFps: rec?.sustained ?? null, fpsSamples: t.length, recommendedCap: rec?.cap ?? null,
      avgCpu: avg(t.map((x) => x.cpu)) ?? 0, avgGpu: avg(t.map((x) => x.gpu)),
      peakVramMB: this.latest?.gpu?.vramTotalMB && t.length ? (Math.max(...t.map((x) => x.vramPct ?? 0)) / 100) * this.latest.gpu.vramTotalMB : null,
      peakRamPct: t.length ? Math.max(...t.map((x) => x.ramPct)) : 0,
      drops: [...s.drops],
      maxFps: t.length ? Math.max(...t.map((x) => x.fps)) : null, minFps: t.length ? Math.min(...t.map((x) => x.fps)) : null,
      low1Session: this.pm.sessionLow1(),
      loads: loadProfiles(t), diagnosis: diagnoseSession(t, { dx12: s.dx12, sessionStart: s.startedAt }),
    };
  }

  getSession(): { current: SessionSummary | null; last: SessionSummary | null } { return { current: this.session ? this.summary(this.session) : null, last: this.lastSession }; }

  shutdown() { this.stopTimers(); this.gpu.stop(); this.agent.stop(); this.pinger.stop(); this.pm.stop(); }
}

export function likelyCause(m: LiveMetrics): string {
  const vramPct = m.gpu?.vramUsedMB != null && m.gpu.vramTotalMB ? (m.gpu.vramUsedMB / m.gpu.vramTotalMB) * 100 : null;
  const maxCore = Math.max(0, ...m.cpu.perCore);
  const f = m.fps;
  if (vramPct !== null && vramPct >= 95) return `VRAM nearly full (${vramPct.toFixed(0)}%) - lower Textures`;
  if (m.ram.percent >= 90) return `RAM nearly full (${m.ram.percent.toFixed(0)}%) - close background apps`;
  if ((m.mem?.pagesPerSec ?? 0) >= 1000) return `Heavy paging (${m.mem!.pagesPerSec!.toFixed(0)} pages/s) - memory pressure`;
  if (m.gpu?.throttleReasons.some((r) => /thermal/i.test(r))) return 'GPU thermal limit - check cooling';
  if ((m.cpu.tempC ?? 0) >= 95) return `CPU at ${m.cpu.tempC} °C - thermal throttling likely`;
  if (f && f.cpuBusyMs !== null && f.gpuBusyMs !== null) {
    if (f.gpuBusyMs > f.cpuBusyMs * 1.15) return `GPU-bound (GPU ${f.gpuBusyMs.toFixed(2)} ms vs CPU ${f.cpuBusyMs.toFixed(2)} ms per frame)`;
    if (f.cpuBusyMs > f.gpuBusyMs * 1.15) return `CPU-bound (CPU ${f.cpuBusyMs.toFixed(2)} ms vs GPU ${f.gpuBusyMs.toFixed(2)} ms per frame)`;
  }
  if (m.gpu?.usage != null && m.gpu.usage >= 95) return `GPU at ${m.gpu.usage.toFixed(0)}% - GPU-bound scene`;
  if (maxCore >= 95 && (m.gpu?.usage ?? 100) < 85) return `CPU core at ${maxCore.toFixed(0)}% - CPU/main-thread bound`;
  if (m.net && (m.net.lossPct ?? 0) > 0 && m.net.latency === null) return 'Packet lost at the same moment - possible network hitch';
  return 'No single resource saturated (shader compilation, streaming or engine events are common causes)';
}
