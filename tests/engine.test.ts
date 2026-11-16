import { describe, expect, it } from 'vitest';
import { diagnoseSession, loadProfiles, type Tick } from '../electron/services/sessionAnalysis';
import { channelLayout, parseMicrocode, parseProbe } from '../electron/services/winProbe';
import { parseAgentLine } from '../electron/services/perfAgent';
import { applyProfile, detectProfile, analyzeFortniteConfig } from '../electron/services/fortniteConfig';

const tick = (o: Partial<Tick>, i = 0): Tick => ({ ts: 1_000_000 + i * 1000, fps: 400, p99Ms: 3.5, cpuBusyMs: null, gpuBusyMs: null, cpu: 30, maxCore: 60, gpu: 70, vramPct: 50, ramPct: 50, pagesPerSec: 0, cpuTemp: 70, gpuTemp: 60, gpuReasons: [], ping: 20, pingMeasured: true, stutters: 0, bgAppsMB: 200, ...o });
const many = (n: number, f: (i: number) => Partial<Tick>) => Array.from({ length: n }, (_, i) => tick(f(i), i));

describe('scene-load profiles', () => {
  it('separates empty-scene peaks from real gameplay', () => {
    // 900+ FPS when looking at the sky, ~350 normally, ~220 in fights
    const t = many(100, (i) => ({ fps: i < 15 ? 920 + i : i < 85 ? 340 + (i % 20) : 210 + (i % 10) }));
    const l = loadProfiles(t);
    const low = l.find((x) => x.id === 'low')!, normal = l.find((x) => x.id === 'normal')!, intense = l.find((x) => x.id === 'intense')!;
    expect(low.avgFps!).toBeGreaterThan(900);
    expect(normal.avgFps!).toBeGreaterThan(330);
    expect(normal.avgFps!).toBeLessThan(370);
    expect(intense.avgFps!).toBeLessThan(230);
    expect(low.seconds + normal.seconds + intense.seconds).toBe(100);
  });
  it('needs 30 samples', () => expect(loadProfiles(many(29, () => ({})))).toEqual([]));
});

describe('bottleneck diagnosis', () => {
  const ctx = { dx12: false, sessionStart: 1_000_000 };
  it('detects CPU-bound from per-frame busy times, with evidence', () => {
    const d = diagnoseSession(many(60, () => ({ fps: 350, cpuBusyMs: 2.8, gpuBusyMs: 1.6 })), ctx);
    expect(d[0].kind).toBe('cpu');
    expect(d[0].evidence!.join(' ')).toMatch(/CPU busy 2\.80 ms/);
    expect(d[0].fix).toBeTruthy();
    expect(d[0].rollback).toBeTruthy();
  });
  it('detects GPU-bound', () => {
    expect(diagnoseSession(many(60, () => ({ fps: 300, cpuBusyMs: 1.5, gpuBusyMs: 3.2 })), ctx)[0].kind).toBe('gpu');
  });
  it('flags RAM pressure, thermal, network and background apps only with evidence', () => {
    const d = diagnoseSession(many(60, (i) => ({ ramPct: 93, pagesPerSec: 1500, cpuTemp: i < 10 ? 98 : 80, ping: i % 5 === 0 ? null : 25 + (i % 3) * 20, bgAppsMB: 2500 })), ctx);
    const kinds = d.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ram', 'thermal', 'network', 'background']));
    expect(d.find((x) => x.kind === 'network')!.evidence![0]).toMatch(/20\.0% packet loss/);
  });
  it('does not invent problems on a healthy session', () => {
    const d = diagnoseSession(many(60, () => ({})), ctx);
    expect(d.map((x) => x.kind)).toEqual(['engine']);
  });
  it('detects DX12 shader-compilation stutter concentrated at the start', () => {
    const t = many(400, (i) => ({ stutters: i < 180 ? 2 : 0 }));
    expect(diagnoseSession(t, { dx12: true, sessionStart: 1_000_000 }).some((x) => x.kind === 'shader')).toBe(true);
    expect(diagnoseSession(t, { dx12: false, sessionStart: 1_000_000 }).some((x) => x.kind === 'shader')).toBe(false);
  });
});

describe('Windows probe parsers', () => {
  it('parses display, memory, BIOS', () => {
    const p = parseProbe(JSON.stringify({ disp: { name: 'NVIDIA GeForce RTX 5060', hz: 240, maxReported: 520, w: 1920, h: 1080, maxModes: 520 }, mem: [{ cap: 8589934592, speed: 4800, conf: 6000, type: 34, bank: 'BANK 0', loc: 'Controller0-ChannelA-DIMM1' }, { cap: 8589934592, speed: 4800, conf: 6000, type: 34, bank: 'BANK 2', loc: 'Controller1-ChannelB-DIMM1' }], bios: { vendor: 'American Megatrends', ver: '1.A0', date: '2024-03-01' }, board: 'MSI PRO Z790-A' }))!;
    expect(p.display).toEqual({ name: 'NVIDIA GeForce RTX 5060', currentHz: 240, maxHz: 520, width: 1920, height: 1080 });
    expect(p.modules[0]).toMatchObject({ sizeMB: 8192, speedMHz: 6000, ratedMHz: 4800, type: 'DDR5' });
    expect(channelLayout(p.modules).hint).toBe('dual-or-more');
    expect(p.biosDate).toBe('2024-03-01');
  });
  it('detects single channel from slot names and from one stick', () => {
    const m = (slot: string) => ({ sizeMB: 8192, speedMHz: 6000, ratedMHz: 4800, type: 'DDR5', slot });
    expect(channelLayout([m('DIMM_A1'), m('DIMM_A2')]).hint).toBe('single');
    expect(channelLayout([m('DIMM_A2'), m('DIMM_B2')]).hint).toBe('dual-or-more');
    expect(channelLayout([m('ChannelA-DIMM0')]).hint).toBe('single');
    expect(channelLayout([]).hint).toBeNull();
    expect(channelLayout([{ sizeMB: 16384, speedMHz: null, ratedMHz: null, type: null, slot: null }]).hint).toBeNull(); // VM: no evidence, no claim
  });
  it('reads Intel microcode revision from the registry binary', () => {
    expect(parseMicrocode('000000002B010000')).toBe(0x12b);
    expect(parseMicrocode('0000000029010000')).toBe(0x129);
    expect(parseMicrocode(null)).toBeNull();
  });
  it('parses perf agent lines and empty counters', () => {
    expect(parseAgentLine('112|35|2|41|7')).toEqual({ perfPct: 112, mem: { pagesPerSec: 35, pageReadsPerSec: 2, commitPct: 41, pageFileUsagePct: 7 } });
    expect(parseAgentLine('||||')!.perfPct).toBeNull();
    expect(parseAgentLine('garbage')).toBeNull();
  });
});

describe('Fortnite profiles', () => {
  const base = '[/Script/FortniteGame.FortGameUserSettings]\nFrameRateLimit=144.000000\nbUseVSync=True\n[ScalabilityGroups]\nsg.ShadowQuality=3\nsg.ViewDistanceQuality=1\n[D3DRHIPreference]\nPreferredRHI=dx12\n';
  it('each profile is detected after applying it', () => {
    expect(detectProfile(applyProfile(base, 'high-fps').text)).toBe('high-fps');
    expect(detectProfile(applyProfile(base, 'ultra').text)).toBe('ultra');
    expect(detectProfile(applyProfile(base, 'competitive').text)).toBe('competitive');
    expect(detectProfile(applyProfile(base, 'stability', 380).text)).toBe('stability');
    expect(detectProfile(applyProfile(base, 'dx12').text)).toBe('dx12');
    expect(detectProfile(base)).toBeNull();
  });
  it('stability profile sets the measured lock and requires data', () => {
    expect(applyProfile(base, 'stability', 380).text).toContain('FrameRateLimit=380.000000');
    expect(() => applyProfile(base, 'stability')).toThrow(/one match/);
  });
  it('competitive uses Epic view distance and passes the analyzer', () => {
    const t = applyProfile(base, 'competitive').text;
    expect(t).toContain('sg.ViewDistanceQuality=3');
    expect(analyzeFortniteConfig(t, 'x').settings.filter((s) => s.ok === false)).toEqual([]);
  });
  it('dx12 profile switches renderer without touching the frame cap logic', () => {
    const t = applyProfile(base, 'dx12').text;
    expect(t).toContain('PreferredRHI=dx12');
    expect(t).toContain('PreferredFeatureLevel=sm6');
    expect(t).toContain('sg.ShadowQuality=0');
  });
});

describe('Ultra FPS profile', () => {
  it('lowers the CPU-heavy settings and keeps everything else on the Max FPS profile', () => {
    const t = applyProfile('[ScalabilityGroups]\nsg.ViewDistanceQuality=3\nsg.TextureQuality=2\n', 'ultra').text;
    expect(t).toContain('sg.ViewDistanceQuality=1');
    expect(t).toContain('sg.TextureQuality=0');
    expect(t).toContain('PreferredFeatureLevel=es31');
    expect(t).toContain('bUseVSync=False');
  });
});
