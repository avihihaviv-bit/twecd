import type { AutoModeStatus, OptimizationId, SessionSummary, Settings } from '../../shared/types';
import type { Optimizer } from './optimizer';
import { applyFortniteCap, applyFortniteProfile, readFortniteConfig } from './fortniteFiles';
import { PROFILES } from './fortniteConfig';

/** Safe, reversible Windows changes Auto Mode keeps applied (never closes apps, never deletes files). */
export const AUTO_WINDOWS: OptimizationId[] = ['game-mode-on', 'power-plan-high', 'background-recording-off', 'game-capture-off', 'windowed-optimizations-on', 'fortnite-gpu-preference'];

/**
 * Decides the Stable FPS Lock from REAL measured data:
 * the target (e.g. 500) only when the PC held it 90% of the last match, otherwise the highest FPS it actually held.
 */
export function chooseLock(s: Pick<SessionSummary, 'sustainedFps' | 'recommendedCap'> | null, target: number): { cap: number; reason: string } | null {
  if (!s || s.sustainedFps === null || s.recommendedCap === null) return null;
  if (s.sustainedFps >= target) return { cap: target, reason: `Your PC held ${Math.round(s.sustainedFps)} FPS 90% of the last match, so it is locked at your ${target} FPS target.` };
  return { cap: s.recommendedCap, reason: `Your PC held ${Math.round(s.sustainedFps)} FPS 90% of the last match (below the ${target} target), so it is locked at ${s.recommendedCap}: the highest FPS it can keep stable.` };
}

export class AutoMode {
  status: AutoModeStatus = { enabled: false, lastRun: null, trigger: null, changed: [], skipped: 0, failed: [], lock: null };
  private running = false;

  constructor(
    private optimizer: Optimizer,
    private settings: () => Settings,
    private fortniteRunning: () => boolean,
    private lastSession: () => SessionSummary | null,
    private fortniteBackupDir: string,
    private emit: (s: AutoModeStatus) => void,
  ) { this.status.enabled = settings().autoMode; }

  async run(trigger: string): Promise<AutoModeStatus> {
    const st = this.settings();
    this.status.enabled = st.autoMode;
    if (!st.autoMode || this.running) return this.status;
    this.running = true;
    const changed: string[] = []; const failed: string[] = []; let skipped = 0; let lock: string | null = null;
    try {
      const r = await this.optimizer.apply({ ids: AUTO_WINDOWS, skipRestorePoint: true });
      for (const x of r.results) {
        if (x.status === 'success') changed.push(x.title);
        else if (x.status === 'failed') failed.push(`${x.title}: ${x.message}`);
        else skipped++;
      }
      if (!this.fortniteRunning()) {
        const sess = this.lastSession();
        const prof = PROFILES[st.autoProfile];
        const p = applyFortniteProfile(this.fortniteBackupDir, st.autoProfile, prof.needsCap ? sess?.recommendedCap ?? undefined : undefined);
        if (p.ok && p.changed.length) changed.push(`Fortnite profile: ${prof.name}`); else if (!p.ok) failed.push(`Fortnite profile: ${p.message}`); else skipped++;
        if (st.autoLock) {
          const c = chooseLock(sess, st.autoLockTarget);
          if (c) {
            const cur = readFortniteConfig().frameRateLimit ?? null;
            if (cur === null || Math.round(cur) !== c.cap) {
              const w = applyFortniteCap(this.fortniteBackupDir, c.cap);
              if (w.ok) changed.push(`Stable FPS Lock: ${c.cap} FPS`); else failed.push(`FPS lock: ${w.message}`);
            } else skipped++;
            lock = c.reason;
          } else lock = 'Play one match with FPS capture on (TWECD as administrator) so Auto Mode can measure the right lock.';
        }
      }
      if (changed.length) this.optimizer.note(`Auto Mode (${trigger})`, changed.join(', '));
    } finally { this.running = false; }
    this.status = { enabled: true, lastRun: Date.now(), trigger, changed, skipped, failed, lock };
    this.emit(this.status);
    return this.status;
  }
}
