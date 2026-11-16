import os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import si from 'systeminformation';
import { isWin } from './exec';

/** Per-core CPU utilisation from OS time counters (no external process), plus effective clock and temperature when supported. */
export class CpuMonitor {
  private prev = os.cpus().map((c) => c.times);
  private perfChild: ChildProcess | null = null;
  perfPct: number | null = null; // Windows "% Processor Performance" (relative to base clock)
  tempC: number | null = null;
  tempSupported = true;
  private lastTemp = 0;

  sample(): { usage: number; perCore: number[] } {
    const now = os.cpus().map((c) => c.times);
    const perCore = now.map((t, i) => {
      const p = this.prev[i] ?? t;
      const idle = t.idle - p.idle;
      const total = t.user + t.nice + t.sys + t.idle + t.irq - (p.user + p.nice + p.sys + p.idle + p.irq);
      return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
    });
    this.prev = now;
    const usage = perCore.reduce((a, b) => a + b, 0) / Math.max(1, perCore.length);
    return { usage, perCore };
  }

  /** Temperature is polled at most every 10 s and abandoned when the platform does not expose it. */
  async refreshTemp() {
    if (!this.tempSupported || Date.now() - this.lastTemp < 10000) return;
    this.lastTemp = Date.now();
    try {
      const t = await si.cpuTemperature();
      if (typeof t.main === 'number' && t.main > 0 && t.main < 125) this.tempC = t.main;
      else { this.tempC = null; this.tempSupported = false; }
    } catch { this.tempSupported = false; this.tempC = null; }
  }

  startClock() {
    if (!isWin || this.perfChild) return;
    try {
      this.perfChild = spawn('typeperf', ['\\Processor Information(_Total)\\% Processor Performance', '-si', '2'], { windowsHide: true });
    } catch { return; }
    const rl = readline.createInterface({ input: this.perfChild.stdout! });
    rl.on('line', (l) => {
      const m = l.match(/^"[^"]*","([\d.]+)"/);
      if (m) this.perfPct = parseFloat(m[1]);
    });
    this.perfChild.on('error', () => { this.perfChild = null; });
    this.perfChild.on('exit', () => { this.perfChild = null; });
  }

  stopClock() { this.perfChild?.kill(); this.perfChild = null; }
}
