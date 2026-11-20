import { describe, expect, it } from 'vitest';
import { parseVsb, pickCpu } from '../electron/services/hwinfo';
import { parseBar1TotalMB, rebarEnabled } from '../electron/services/nvidiaParse';
import { gradeBloat, summarizeBloat } from '../electron/services/bufferbloat';
import { pickWinner } from '../src/lib/bench';
import { parseHeader, parseRow } from '../electron/services/presentmonParse';
import { parseAdapters, canWriteKey, DO_KEY } from '../electron/services/windows';
import { parseProbe } from '../electron/services/winProbe';
import type { BenchmarkResult } from '../shared/types';

describe('HWiNFO Gadget registry', () => {
  const vals = [
    { name: 'Sensor0', data: 'CPU [#0]: Intel Core i5-14600K' }, { name: 'Label0', data: 'CPU Package' }, { name: 'Value0', data: '71 °C' }, { name: 'ValueRaw0', data: '71' },
    { name: 'Sensor1', data: 'CPU [#0]: Intel Core i5-14600K: Enhanced' }, { name: 'Label1', data: 'CPU Package Power' }, { name: 'Value1', data: '96.3 W' }, { name: 'ValueRaw1', data: '96,3' },
    { name: 'Label2', data: 'PL1 Power Limit (Static)' }, { name: 'ValueRaw2', data: '125' },
  ];
  it('parses published sensors (comma decimals too)', () => {
    const s = parseVsb(vals);
    expect(s).toHaveLength(3);
    const c = pickCpu(s);
    expect(c.packageTemp).toBe(71); expect(c.packagePower).toBe(96.3); expect(c.pl1).toBe(125); expect(c.pl2).toBeNull();
  });
  it('returns nothing when HWiNFO is not publishing', () => expect(parseVsb([])).toEqual([]));
});

describe('Resizable BAR from nvidia-smi', () => {
  const q = (mb: number) => `    FB Memory Usage\n        Total : 8151 MiB\n    BAR1 Memory Usage\n        Total : ${mb} MiB\n        Used : 2 MiB\n`;
  it('reads BAR1 (not the framebuffer total)', () => { expect(parseBar1TotalMB(q(256))).toBe(256); expect(parseBar1TotalMB(q(8192))).toBe(8192); });
  it('classifies on/off', () => { expect(rebarEnabled(256, 8151)).toBe(false); expect(rebarEnabled(8192, 8151)).toBe(true); expect(rebarEnabled(null, 8151)).toBeNull(); });
});

describe('Bufferbloat', () => {
  it('grades added latency', () => { expect(gradeBloat(3)).toBe('A+'); expect(gradeBloat(25)).toBe('A'); expect(gradeBloat(150)).toBe('C'); expect(gradeBloat(500)).toBe('F'); expect(gradeBloat(null)).toBeNull(); });
  it('summarizes idle vs loaded and throughput', () => {
    const r = summarizeBloat([12, 13, 12, null], [80, 95, null, 90, 85], 125_000_000, 10);
    expect(r.idleMs).toBe(12); expect(r.loadedMs).toBe(90); expect(r.addedMs).toBe(78); expect(r.grade).toBe('C');
    expect(r.downloadMbps).toBe(100); expect(r.loadedLossPct).toBe(20);
    expect(r.advice).toMatch(/SQM/);
  });
  it('does not invent a grade without data', () => expect(summarizeBloat([null], [null], 0, 10).grade).toBeNull());
});

describe('Profile winner (measured only)', () => {
  const run = (profile: string, avgFps: number | null, low1: number | null, ts: number): BenchmarkResult => ({ id: profile + ts, label: 'x', ts, durationSec: 60, fortniteRunning: true, profile, maxFps: null, minFps: null, jitter: null, loads: [], avgFps, low1, frameTimeStdMs: null, stabilityScore: null, avgCpu: 0, avgGpu: null, avgRamMB: 0, avgVramMB: null, pingAvg: null, packetLossPct: null, pingHost: '', notes: [] });
  it('prefers clearly better 1% lows', () => expect(pickWinner([run('high-fps', 420, 210, 1), run('dx12', 360, 240, 2)]).winner!.profile).toBe('dx12'));
  it('falls back to average FPS when 1% lows are close', () => expect(pickWinner([run('high-fps', 420, 230, 1), run('dx12', 360, 228, 2)]).winner!.profile).toBe('high-fps'));
  it('needs two profiles with FPS data', () => {
    expect(pickWinner([run('high-fps', 420, 230, 1)]).winner).toBeNull();
    expect(pickWinner([run('high-fps', null, null, 1), run('dx12', null, null, 2)]).winner).toBeNull();
  });
  it('uses the latest run per profile', () => expect(pickWinner([run('high-fps', 300, 150, 1), run('high-fps', 420, 260, 5), run('dx12', 360, 240, 2)]).winner!.ts).toBe(5));
});

describe('misc parsers', () => {
  it('reads PresentMon DisplayLatency', () => {
    const c = parseHeader('Application,ProcessID,FrameTime,CPUBusy,GPUBusy,DisplayLatency')!;
    expect(parseRow('Fortnite,1,2.5,1.2,2.1,6.75', c)!.displayLatencyMs).toBe(6.75);
    expect(parseRow('Fortnite,1,2.5,1.2,2.1,NA', c)!.displayLatencyMs).toBeNull();
  });
  it('parses network adapters', () => {
    const a = parseAdapters(JSON.stringify({ Name: 'Ethernet', InterfaceDescription: 'Realtek Gaming 2.5GbE Family Controller', LinkSpeed: '1 Gbps', DriverVersion: '1168.4', DriverDate: '2025-01-01', Power: [{ DisplayName: 'Energy-Efficient Ethernet', DisplayValue: 'Enabled' }] }));
    expect(a[0].linkSpeed).toBe('1 Gbps'); expect(a[0].power[0].name).toMatch(/Energy/);
    expect(parseAdapters('')).toEqual([]);
  });
  it('board revision ignores OEM placeholders', () => {
    expect(parseProbe(JSON.stringify({ board: 'Gigabyte Technology Co., Ltd. B760 GAMING X AX DDR5', boardRev: '1.0' }))!.boardRevision).toBe('1.0');
    expect(parseProbe(JSON.stringify({ board: 'X', boardRev: 'Default string' }))!.boardRevision).toBeNull();
  });
  it('allows writing Delivery Optimization only at its exact key', () => {
    expect(canWriteKey(DO_KEY)).toBe(true);
    expect(canWriteKey('HKU\\S-1-5-20\\Software\\Microsoft\\Windows Defender')).toBe(false);
  });
});

import { nextTuneStep, applyTuneStep } from '../electron/services/fortniteConfig';
describe('FPS Tuner', () => {
  const ini = (res: number, vd: number, tex = 0) => `[ScalabilityGroups]\nsg.ResolutionQuality=${res}.000000\nsg.ViewDistanceQuality=${vd}\nsg.TextureQuality=${tex}\n`;
  it('GPU-bound: textures first, then 3D resolution 90 -> 80 -> 70, then stops', () => {
    expect(nextTuneStep(ini(100, 2, 1), 'gpu')!.label).toBe('Textures: Low');
    let t = ini(100, 2);
    const labels: string[] = [];
    for (let i = 0; i < 5; i++) { const s = nextTuneStep(t, 'gpu'); if (!s) break; labels.push(s.label); t = applyTuneStep(t, s).text; }
    expect(labels).toEqual(['3D Resolution: 90%', '3D Resolution: 80%', '3D Resolution: 70%']);
    expect(t).toContain('sg.ResolutionQuality=70.000000');
  });
  it('CPU-bound: view distance Far -> Medium -> Near, never touches resolution', () => {
    let t = ini(100, 2);
    const s1 = nextTuneStep(t, 'cpu')!; t = applyTuneStep(t, s1).text;
    const s2 = nextTuneStep(t, 'cpu')!; t = applyTuneStep(t, s2).text;
    expect([s1.label, s2.label]).toEqual(['View Distance: Medium', 'View Distance: Near']);
    expect(nextTuneStep(t, 'cpu')).toBeNull();
    expect(t).toContain('sg.ResolutionQuality=100.000000');
  });
  it('does nothing for other bottlenecks', () => expect(nextTuneStep(ini(100, 2), 'ram')).toBeNull());
});

import { xmpActive } from '../electron/services/winProbe';
import { parseRegQuery } from '../electron/services/windows';
describe('BIOS guide detection bugs (seen on the real PC)', () => {
  it('DDR5-6000 is XMP/EXPO even when Windows reports 6000 as the rated speed too', () => {
    expect(xmpActive('DDR5', 6000, 6000)).toBe(true);
    expect(xmpActive('DDR5', 4800, 4800)).toBe(false);
    expect(xmpActive('DDR5', 5200, 5200)).toBeNull();
    expect(xmpActive('DDR4', 3600, 3600)).toBe(true);
    expect(xmpActive('DDR5', null, null)).toBeNull();
  });
  it('reads registry values whose names contain spaces (CPU microcode)', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\r\n    Update Revision    REG_BINARY    000000002B010000\r\n\r\nEnd of search: 1 match(es) found.\r\n';
    expect(parseRegQuery(out, 'Update Revision')).toEqual({ type: 'REG_BINARY', data: '000000002B010000' });
    expect(parseRegQuery('    AutoGameModeEnabled    REG_DWORD    0x1\r\n', 'AutoGameModeEnabled')).toEqual({ type: 'REG_DWORD', data: '0x1' });
    expect(parseRegQuery('    Other    REG_SZ    x\r\n', 'Missing')).toBeNull();
  });
  it('board revision x.x placeholder is treated as not reported', () => {
    expect(parseProbe(JSON.stringify({ board: 'Gigabyte B760', boardRev: 'x.x' }))!.boardRevision).toBeNull();
  });
});
