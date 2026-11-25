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
