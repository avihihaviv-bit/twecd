import type { NetLive } from '../../shared/types';
import { pingOnce } from './network';

/** Light continuous ping (one ICMP echo every 2 s) for the dashboard and session network analysis. */
export class LivePinger {
  private ring: (number | null)[] = [];
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  last: number | null = null;
  error: string | null = null;
  lastMeasured = false;
  constructor(private host: () => string) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.probe(), 2000);
    void this.probe();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.lastMeasured = false; }

  private async probe() {
    if (this.busy) return;
    this.busy = true;
    try {
      const v = await pingOnce(this.host());
      this.last = v; this.lastMeasured = true;
      this.ring.push(v); if (this.ring.length > 30) this.ring.shift();
      this.error = null;
    } catch (e) { this.lastMeasured = false; this.error = (e as Error).message; }
    finally { this.busy = false; }
  }

  /** Takes the "measured since last call" flag so each sample is counted once in session analysis. */
  takeSample(): { ping: number | null; measured: boolean } { const r = { ping: this.last, measured: this.lastMeasured }; this.lastMeasured = false; return r; }

  snapshot(): NetLive | null {
    if (this.ring.length === 0) return null;
    const got = this.ring.filter((x): x is number => x !== null);
    let j = 0; for (let i = 1; i < got.length; i++) j += Math.abs(got[i] - got[i - 1]);
    return {
      host: this.host(), latency: this.ring[this.ring.length - 1], samples: this.ring.length,
      avg: got.length ? got.reduce((a, b) => a + b, 0) / got.length : null,
      jitter: got.length > 1 ? j / (got.length - 1) : null,
      lossPct: ((this.ring.length - got.length) / this.ring.length) * 100,
    };
  }
}
