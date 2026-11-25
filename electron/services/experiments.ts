import type { BenchmarkResult, CpuTopology, ExpDef, ExpId, ExpProgress, ExpRun, ExpState, ExpVerdict } from '../../shared/types';
import { isWin, run } from './exec';
import type { MonitorHub } from './monitor';
import { runBenchmark } from './benchmark';
import { JsonStore } from './store';

/**
 * Experiments Lab: tests candidates that help on some PCs and not on others, on THIS PC,
 * with repeated runs and a noise-aware verdict. Nothing here promises a number.
 */
export const EXPERIMENTS: ExpDef[] = [
  {
    id: 'pcore-affinity', name: 'Fortnite on P-cores only', kind: 'software', risk: 'low', restart: false,
    what: 'Pins Fortnite to the 6 Performance cores (12 threads) of the i5-14600K so the game never lands on the slower E-cores. Same Windows API Task Manager uses; no game files or memory are touched. Lasts until Fortnite closes.',
    applyStep: 'TWECD applies it automatically.', revertStep: 'TWECD restores the original core mask automatically.',
  },
  {
    id: 'priority-high', name: 'Fortnite priority: High', kind: 'software', risk: 'low', restart: false,
    what: 'Gives Fortnite a higher CPU priority than background apps. Same Windows API Task Manager uses. Lasts until Fortnite closes.',
    applyStep: 'TWECD applies it automatically.', revertStep: 'TWECD restores the original priority automatically.',
  },
  {
    id: 'view-distance-near', name: 'View Distance: Near', kind: 'guided', risk: 'none', restart: false,
    what: 'Less to draw far away means less CPU work per frame. Players still render at every distance; buildings and terrain far away appear later.',
    applyStep: 'In Fortnite: Settings > Video > View Distance > Near. Apply, then return to the same spot.', revertStep: 'Set View Distance back to what it was (Far or Medium).',
  },
  {
    id: 'reflex-off', name: 'NVIDIA Reflex: Off', kind: 'guided', risk: 'none', restart: false,
    what: 'Reflex lowers input latency by keeping the render queue short, which can cost a little peak FPS. This measures how much FPS it costs on your PC so you can choose latency or FPS.',
    applyStep: 'In Fortnite: Settings > Video > NVIDIA Reflex Low Latency > Off. Apply, return to the same spot.', revertStep: 'Set NVIDIA Reflex back to On + Boost (recommended for competitive play).',
  },
  {
    id: 'memory-integrity-off', name: 'Memory Integrity: Off', kind: 'guided', risk: 'medium', restart: true,
    what: 'Microsoft says Memory Integrity can lower gaming performance. It is a security feature against malicious drivers: turning it off is your decision.',
    applyStep: 'Windows Security > Device security > Core isolation > Memory integrity: Off. Restart the PC, open TWECD and Fortnite, same spot, then run phase B.', revertStep: 'Turn Memory integrity back On and restart (recommended unless the gain is worth it to you).',
  },
  {
    id: 'ecores-off', name: 'E-cores off (BIOS)', kind: 'guided', risk: 'low', restart: true,
    what: 'Some players get higher 1% lows in Fortnite with the E-cores disabled. Other apps lose multi-thread performance. BIOS change, fully reversible.',
    applyStep: 'Restart > DEL > F2 (Advanced) > Tweaker > Advanced CPU Settings > Active E-Cores: 0 (or "Disabled"). F10 save. Open TWECD and Fortnite, same spot, run phase B.', revertStep: 'Same menu: Active E-Cores back to "All"/Auto.',
  },
  {
    id: 'ht-off', name: 'Hyper-Threading off (BIOS)', kind: 'guided', risk: 'low', restart: true,
    what: 'Some CPU-bound games run slightly smoother with Hyper-Threading off. Other apps lose multi-thread performance. BIOS change, fully reversible.',
    applyStep: 'Restart > DEL > F2 > Tweaker > Advanced CPU Settings > Hyper-Threading Technology: Disabled. F10 save. Open TWECD and Fortnite, same spot, run phase B.', revertStep: 'Same menu: Hyper-Threading Technology back to Enabled.',
  },
];

// ---------- statistics ----------
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, x.length - 1)); };

/** Welch's t statistic for B vs A (positive = B higher). */
export function welchT(a: number[], b: number[]): number {
  const va = sd(a) ** 2 / a.length; const vb = sd(b) ** 2 / b.length;
  const d = mean(b) - mean(a);
  const se = Math.sqrt(va + vb);
  if (se === 0) return d === 0 ? 0 : d > 0 ? Infinity : -Infinity;
  return d / se;
}

/** One metric: "improved"/"worse" only when the change is both ≥ 3% AND clearly beyond run-to-run noise (|t| ≥ 2.5). */
export function compareMetric(a: number[], b: number[]): { status: 'improved' | 'worse' | 'same' | 'insufficient'; gainPct: number | null; t: number | null } {
  if (a.length < 2 || b.length < 2) return { status: 'insufficient', gainPct: null, t: null };
  const gainPct = ((mean(b) - mean(a)) / mean(a)) * 100;
  const t = welchT(a, b);
  if (gainPct >= 3 && t >= 2.5) return { status: 'improved', gainPct, t };
  if (gainPct <= -3 && t <= -2.5) return { status: 'worse', gainPct, t };
  return { status: 'same', gainPct, t };
}

export function verdict(a: ExpRun[], b: ExpRun[]): ExpVerdict {
  const avg = compareMetric(a.map((r) => r.avgFps), b.map((r) => r.avgFps));
  const low = compareMetric(a.map((r) => r.low1), b.map((r) => r.low1));
  if (avg.status === 'insufficient' || low.status === 'insufficient') return { status: 'insufficient', avgGainPct: null, low1GainPct: null, detail: 'Needs at least 2 runs with and 2 without the change.' };
  const s = [avg.status, low.status];
  const status: ExpVerdict['status'] = s.includes('improved') && !s.includes('worse') ? 'improved' : s.includes('worse') && !s.includes('improved') ? 'worse' : 'same';
  const f = (x: number | null) => (x === null ? '-' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);
  const detail = status === 'improved' ? `Measured gain beyond run-to-run noise: average ${f(avg.gainPct)}, 1% low ${f(low.gainPct)}.`
    : status === 'worse' ? `Measured loss: average ${f(avg.gainPct)}, 1% low ${f(low.gainPct)}.`
    : `No measurable difference: average ${f(avg.gainPct)}, 1% low ${f(low.gainPct)} are within normal run-to-run variation.`;
  return { status, avgGainPct: avg.gainPct, low1GainPct: low.gainPct, detail };
}

/** Affinity mask covering the P-core threads, or null when the layout is unknown (e.g. Hyper-Threading already off). */
export function pcoreMask(topo: CpuTopology | null): number | null {
  if (!topo || topo.pCoreThreads.length === 0 || topo.eCoreThreads.length === 0) return null;
  const max = Math.max(...topo.pCoreThreads);
  if (max >= 31) return null;
  return topo.pCoreThreads.reduce((m, i) => m | (1 << i), 0) >>> 0;
}

/** PowerShell script for one process operation. PID and mask are validated integers, never raw strings. */
export function processScript(pid: number, op: { kind: 'read' } | { kind: 'affinity'; mask: number } | { kind: 'priority'; value: 'High' | 'Normal' | 'AboveNormal' | 'BelowNormal' | 'Idle' | 'RealTime' }): string {
  if (!Number.isInteger(pid) || pid <= 4 || pid > 0x7fffffff) throw new Error('Invalid process id');
  const head = `$ErrorActionPreference='Stop'; try { $p = Get-Process -Id ${pid}; `;
  const tail = ` } catch { 'ERR:' + $_.Exception.Message }`;
  if (op.kind === 'read') return `${head}'OK:' + [int64]$p.ProcessorAffinity + '|' + $p.PriorityClass${tail}`;
  if (op.kind === 'affinity') {
    if (!Number.isInteger(op.mask) || op.mask <= 0 || op.mask > 0xffffffff) throw new Error('Invalid mask');
    return `${head}$p.ProcessorAffinity = [IntPtr]${op.mask}; 'OK:' + [int64]$p.ProcessorAffinity${tail}`;
  }
  if (op.value === 'RealTime') throw new Error('RealTime priority is never used');
  return `${head}$p.PriorityClass = '${op.value}'; 'OK:' + $p.PriorityClass${tail}`;
}

async function ps(script: string): Promise<{ ok: boolean; out: string }> {
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 15000);
  const out = r.stdout.trim();
  return { ok: out.startsWith('OK:'), out: out.replace(/^(OK|ERR):/, '') };
}

const PRIORITIES = ['Normal', 'AboveNormal', 'BelowNormal', 'High', 'Idle'] as const;

// ---------- the lab ----------
interface Saved { states: Partial<Record<ExpId, ExpState>>; originals: Partial<Record<ExpId, { pid: number; value: string }>> }

export class ExperimentsLab {
  private busy = false;
  constructor(
    private store: JsonStore<Saved>,
    private hub: MonitorHub,
    private topology: () => CpuTopology | null,
    private saveBench: (r: BenchmarkResult) => void,
    private log: (action: string, detail: string) => void,
  ) {}

  list(): { defs: ExpDef[]; states: ExpState[] } {
    const s = this.store.read();
    return { defs: EXPERIMENTS, states: EXPERIMENTS.map((d) => s.states[d.id] ?? { id: d.id, a: [], b: [], verdict: null, applied: false, kept: false, updatedAt: null }) };
  }

  private fortnitePid(): number | null { return this.hub.latest?.fortnite.running ? this.hub.latest.fortnite.pid : null; }

  /** Applies a software experiment to the running Fortnite process; saves the original value first. */
  async applySoftware(id: ExpId, pid: number): Promise<{ ok: boolean; message: string }> {
    if (!isWin) return { ok: false, message: 'Windows only.' };
    const read = await ps(processScript(pid, { kind: 'read' }));
    if (!read.ok) return { ok: false, message: `Windows did not allow access to the Fortnite process (${read.out.slice(0, 120)}). Easy Anti-Cheat protects it on this system, so this experiment is not possible here.` };
    const [mask, prio] = read.out.split('|');
    const saved = this.store.read();
    if (id === 'pcore-affinity') {
      const m = pcoreMask(this.topology());
      if (m === null) return { ok: false, message: 'P-core layout unknown for this CPU (or Hyper-Threading is off), so TWECD will not guess a core mask.' };
      saved.originals[id] = { pid, value: mask }; this.store.write(saved);
      const r = await ps(processScript(pid, { kind: 'affinity', mask: m }));
      return r.ok ? { ok: true, message: `Fortnite pinned to P-core threads (mask 0x${m.toString(16).toUpperCase()}).` } : { ok: false, message: `Not allowed: ${r.out.slice(0, 160)}` };
    }
    if (id === 'priority-high') {
      saved.originals[id] = { pid, value: prio }; this.store.write(saved);
      const r = await ps(processScript(pid, { kind: 'priority', value: 'High' }));
      return r.ok ? { ok: true, message: 'Fortnite priority set to High.' } : { ok: false, message: `Not allowed: ${r.out.slice(0, 160)}` };
    }
    return { ok: false, message: 'Not a software experiment.' };
  }

  async revertSoftware(id: ExpId): Promise<void> {
    const saved = this.store.read(); const o = saved.originals[id];
    if (!o) return;
    const pid = this.fortnitePid();
    if (pid === o.pid) {
      if (id === 'pcore-affinity' && /^\d+$/.test(o.value)) await ps(processScript(pid, { kind: 'affinity', mask: Number(o.value) }));
      if (id === 'priority-high') { const v = PRIORITIES.find((p) => p === o.value) ?? 'Normal'; await ps(processScript(pid, { kind: 'priority', value: v })); }
    }
    delete saved.originals[id]; // a closed process needs no revert: the change ended with it
    this.store.write(saved);
  }

  /** Runs one phase (A = without the change, B = with it): `runs` × `seconds` real benchmarks in the same scene. */
  async runPhase(id: ExpId, phase: 'A' | 'B', onProgress: (p: ExpProgress) => void, runs = 3, seconds = 20): Promise<ExpState> {
    if (this.busy) throw new Error('An experiment is already running.');
    const def = EXPERIMENTS.find((e) => e.id === id)!;
    const pid = this.fortnitePid();
    if (!pid) throw new Error('Start Fortnite first, go to the empty 1v1 map and stand still in the same spot.');
    this.busy = true;
    try {
      if (def.kind === 'software') {
        if (phase === 'A') await this.revertSoftware(id);
        else { const r = await this.applySoftware(id, pid); if (!r.ok) throw new Error(r.message); }
      }
      const results: ExpRun[] = [];
      for (let i = 0; i < runs; i++) {
        const r = await runBenchmark({ label: `exp:${id}:${phase}`, durationSec: seconds, pingHost: '1.1.1.1', scenario: '1v1' }, this.hub, (p) => onProgress({ id, phase, run: i + 1, runs, elapsedSec: p.elapsedSec, durationSec: p.durationSec }));
        this.saveBench(r);
        if (r.avgFps === null || r.low1 === null) throw new Error('FPS was not measured. Open TWECD as administrator (FPS capture) and keep Fortnite running.');
        results.push({ avgFps: r.avgFps, low1: r.low1, low01: r.low01 ?? null, stdMs: r.frameTimeStdMs });
      }
      const saved = this.store.read();
      const st: ExpState = saved.states[id] ?? { id, a: [], b: [], verdict: null, applied: false, kept: false, updatedAt: null };
      if (phase === 'A') { st.a = results; st.b = []; st.verdict = null; st.applied = false; }
      else {
        st.b = results; st.verdict = verdict(st.a, st.b);
        if (def.kind === 'software') {
          if (st.verdict.status === 'improved') st.applied = true;
          else { await this.revertSoftware(id); st.applied = false; }
        }
        this.log(`Experiment: ${def.name}`, st.verdict.detail);
      }
      st.updatedAt = Date.now();
      const after = this.store.read(); after.states[id] = st; this.store.write(after);
      return st;
    } finally { this.busy = false; }
  }

  setKept(id: ExpId, kept: boolean): ExpState | null {
    const s = this.store.read(); const st = s.states[id];
    if (!st || st.verdict?.status !== 'improved') return null;
    st.kept = kept; s.states[id] = st; this.store.write(s);
    return st;
  }

  reset(id: ExpId): void { const s = this.store.read(); delete s.states[id]; this.store.write(s); void this.revertSoftware(id); }

  /** On each Fortnite launch, re-apply only software experiments that were proven AND that the user chose to keep. */
  async applyKept(pid: number, ids: ExpId[]): Promise<void> {
    for (const id of ids) {
      const st = this.store.read().states[id];
      if (st?.kept && st.verdict?.status === 'improved' && EXPERIMENTS.find((e) => e.id === id)?.kind === 'software') {
        const r = await this.applySoftware(id, pid);
        this.log(`Kept experiment on launch: ${id}`, r.message);
      }
    }
  }
}

export type { Saved as ExperimentsSaved };
