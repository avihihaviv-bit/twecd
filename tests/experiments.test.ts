import { describe, expect, it } from 'vitest';
import { compareMetric, pcoreMask, processScript, verdict, welchT, EXPERIMENTS } from '../electron/services/experiments';
import { topologyFor } from '../electron/services/topology';
import { ExpRunSchema } from '../electron/validation';

const runs = (xs: number[], low = 0.6) => xs.map((x) => ({ avgFps: x, low1: x * low, low01: null, stdMs: null }));

describe('Experiment verdict (noise-aware)', () => {
  it('reports a clear, repeatable gain as improved', () => {
    const v = verdict(runs([598, 603, 601]), runs([652, 648, 655]));
    expect(v.status).toBe('improved');
    expect(v.avgGainPct!).toBeGreaterThan(7);
  });
  it('does NOT call a difference inside run-to-run noise an improvement', () => {
    // means differ by ~4%, but runs overlap heavily
    expect(verdict(runs([560, 640, 600]), runs([650, 580, 640])).status).toBe('same');
  });
  it('does not call a tiny but consistent change (<3%) an improvement', () => {
    expect(verdict(runs([600, 601, 600]), runs([610, 611, 610])).status).toBe('same');
  });
  it('reports a clear loss as worse', () => expect(verdict(runs([600, 602, 598]), runs([540, 545, 542])).status).toBe('worse'));
  it('needs at least 2 runs per side', () => expect(verdict(runs([600]), runs([700, 710])).status).toBe('insufficient'));
  it('mixed results (avg up, 1% low down) are not called an improvement', () => {
    const a = [{ avgFps: 600, low1: 400, low01: null, stdMs: null }, { avgFps: 602, low1: 402, low01: null, stdMs: null }, { avgFps: 601, low1: 401, low01: null, stdMs: null }];
    const b = [{ avgFps: 660, low1: 350, low01: null, stdMs: null }, { avgFps: 662, low1: 352, low01: null, stdMs: null }, { avgFps: 661, low1: 351, low01: null, stdMs: null }];
    expect(verdict(a, b).status).toBe('same');
  });
  it('welch t handles identical runs', () => {
    expect(welchT([600, 600], [600, 600])).toBe(0);
    expect(compareMetric([600, 600], [700, 700]).status).toBe('improved');
  });
});

describe('P-core affinity', () => {
  it('i5-14600K: P-core threads 0-11 -> mask 0xFFF', () => expect(pcoreMask(topologyFor('Intel Core i5-14600K', 20))).toBe(0xfff));
  it('refuses to guess for unknown layouts or HT off', () => {
    expect(pcoreMask(null)).toBeNull();
    expect(pcoreMask(topologyFor('Intel Core i5-14600K', 14))).toBeNull();
  });
});

describe('Process scripts are built only from validated integers', () => {
  it('builds read/affinity/priority scripts', () => {
    expect(processScript(1234, { kind: 'read' })).toContain('Get-Process -Id 1234');
    expect(processScript(1234, { kind: 'affinity', mask: 0xfff })).toContain('[IntPtr]4095');
    expect(processScript(1234, { kind: 'priority', value: 'High' })).toContain("PriorityClass = 'High'");
  });
  it('rejects bad PIDs, masks and RealTime priority', () => {
    expect(() => processScript(1.5, { kind: 'read' })).toThrow();
    expect(() => processScript(4, { kind: 'read' })).toThrow();
    expect(() => processScript(1234, { kind: 'affinity', mask: 0 })).toThrow();
    expect(() => processScript(1234, { kind: 'priority', value: 'RealTime' })).toThrow();
  });
  it('IPC only accepts known experiment ids and phases', () => {
    expect(() => ExpRunSchema.parse({ id: 'disable-defender', phase: 'A' })).toThrow();
    expect(() => ExpRunSchema.parse({ id: 'pcore-affinity', phase: 'C' })).toThrow();
    expect(ExpRunSchema.parse({ id: 'pcore-affinity', phase: 'B' }).id).toBe('pcore-affinity');
  });
  it('every experiment explains how to undo it', () => {
    for (const e of EXPERIMENTS) { expect(e.revertStep.length).toBeGreaterThan(10); expect(e.what.length).toBeGreaterThan(20); }
  });
});

import { Ring } from '../electron/services/ring';
import { PresentMonCapture } from '../electron/services/presentMon';
import { computeFrameStats } from '../electron/services/frameStats';
import { decideMode } from '../electron/services/monitor';

describe('Low-overhead frame capture (regression: TWECD costing FPS)', () => {
  it('ring buffer keeps the newest values in order', () => {
    const r = new Ring(4);
    [1, 2, 3, 4, 5, 6].forEach((v) => r.push(v));
    expect(r.toArray()).toEqual([3, 4, 5, 6]);
    expect(r.tail(2)).toEqual([5, 6]);
    expect(r.mean()).toBe(4.5);
  });
  it('ring-based stats equal array-based stats on the same frames', () => {
    const ft = Array.from({ length: 9000 }, (_, i) => 1.6 + (i % 37) * 0.01 + (i % 500 === 0 ? 12 : 0));
    const r = new Ring(6000); ft.forEach((v) => r.push(v));
    expect(computeFrameStats(r.toArray())).toEqual(computeFrameStats(ft.slice(-6000)));
  });
  it('pushing 100k frames is fast (per-frame work is O(1))', () => {
    const pm = new PresentMonCapture(() => null);
    const push = (pm as unknown as { push: (a: number, b: number | null, c: number | null) => void }).push.bind(pm);
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) push(1.7, 1.2, 1.4);
    expect(performance.now() - t0).toBeLessThan(150);
  });
  it('no in-game sampling when "Record every match" is off (trackWhileHidden gated by it)', () => {
    expect(decideMode({ visible: true, focused: false, fortniteRunning: true, holding: false, trackWhileHidden: false })).toBe('idle');
    expect(decideMode({ visible: true, focused: false, fortniteRunning: true, holding: true, trackWhileHidden: false })).toBe('game-light');
  });
});

import { AutoMode } from '../electron/services/autoMode';
describe('Auto Mode keeps the user\'s own Fortnite settings by default', () => {
  const fakeOpt = { apply: async () => ({ results: [], backupSaved: true, restorePoint: null }), note: () => undefined } as never;
  const base = { autoMode: true, autoLock: false, autoLockTarget: 500, autoProfile: 'high-fps', autoProfileChosen: false } as never;
  it('does not apply a Fortnite profile when the user never picked one', async () => {
    const st = await new AutoMode(fakeOpt, () => base, () => false, () => null, '/nonexistent', () => undefined).run('test');
    expect(st.failed.join(' ')).not.toMatch(/Fortnite profile/);
    expect(st.changed.join(' ')).not.toMatch(/Fortnite profile/);
  });
  it('applies the profile only when explicitly chosen', async () => {
    const chosen = { ...(base as object), autoProfileChosen: true } as never;
    const st = await new AutoMode(fakeOpt, () => chosen, () => false, () => null, '/nonexistent', () => undefined).run('test');
    expect(st.failed.join(' ')).toMatch(/Fortnite profile/); // tried (file absent in the test environment)
  });
});
