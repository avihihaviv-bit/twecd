import os from 'node:os';
import si from 'systeminformation';

/** Per-core CPU utilisation from OS time counters (no external process), plus effective clock and temperature when supported. */
export class CpuMonitor {
  private prev = os.cpus().map((c) => c.times);
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

}
