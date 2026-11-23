import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type { GpuMetrics } from '../../shared/types';
import { NVSMI_FIELDS, parseNvsmiLine } from './nvidiaParse';
import { run } from './exec';

/**
 * One long-lived `nvidia-smi --loop-ms` process instead of spawning per sample: cheap and real.
 * Stopped whenever monitoring is paused.
 */
export class GpuMonitor {
  latest: GpuMetrics | null = null;
  status = 'Not started';
  private child: ChildProcess | null = null;
  private fields = [...NVSMI_FIELDS];
  private wanted = false;
  private failures = 0;

  async probe(): Promise<GpuMetrics | null> {
    const r = await run('nvidia-smi', [`--query-gpu=${this.fields.join(',')}`, '--format=csv,noheader,nounits'], 8000);
    if (r.code !== 0 && /not a valid field|Invalid combination/i.test(r.stdout + r.stderr)) {
      this.fields = this.fields.map((f) => (f === 'clocks_event_reasons.active' ? 'clocks_throttle_reasons.active' : f));
      return this.probe();
    }
    if (r.code !== 0) { this.status = r.error?.includes('ENOENT') ? 'NVIDIA driver tool (nvidia-smi) not found' : 'nvidia-smi failed'; return null; }
    const m = parseNvsmiLine(r.stdout.split(/\r?\n/)[0] ?? '');
    if (m) { this.latest = m; this.status = 'OK'; }
    return m;
  }

  start(intervalMs: number) {
    this.wanted = true;
    if (this.child) return;
    this.loopMs = intervalMs;
    try {
      this.child = spawn('nvidia-smi', [`--query-gpu=${this.fields.join(',')}`, '--format=csv,noheader,nounits', `--loop-ms=${intervalMs}`], { windowsHide: true });
    } catch { this.status = 'nvidia-smi not available'; return; }
    const rl = readline.createInterface({ input: this.child.stdout! });
    rl.on('line', (l) => { const m = parseNvsmiLine(l); if (m) { this.latest = m; this.status = 'OK'; this.failures = 0; } });
    this.child.on('error', () => { this.status = 'NVIDIA driver tool (nvidia-smi) not found'; this.latest = null; });
    this.child.on('exit', () => {
      this.child = null;
      if (this.wanted && ++this.failures < 5) setTimeout(() => this.wanted && this.start(intervalMs), 2000);
    });
  }

  /** Restarts the stream at a new interval only if it differs (avoids respawning nvidia-smi every mode change). */
  private loopMs = 0;
  restartAt(intervalMs: number) { if (this.child && this.loopMs === intervalMs) return; this.stop(); this.start(intervalMs); }

  stop() {
    this.wanted = false;
    this.child?.kill();
    this.child = null;
  }
}
