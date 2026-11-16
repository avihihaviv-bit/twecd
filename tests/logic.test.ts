import { describe, expect, it } from 'vitest';
import { computeFrameStats } from '../electron/services/frameStats';
import { diagnose, isValidHost, parsePingLine, summarize } from '../electron/services/ping';
import { parseHeader, parseRow } from '../electron/services/presentmonParse';
import { decodeReasons, parseNvsmiLine } from '../electron/services/nvidiaParse';
import { analyzeFortniteConfig } from '../electron/services/fortniteConfig';
import { topologyFor } from '../electron/services/topology';
import { categorize } from '../electron/services/processCatalog';
import { analyzeBottleneck } from '../electron/services/bottleneck';
import { parseTasklist } from '../electron/services/windows';
import { ApplySchema, ExternalSchema, NetTestSchema } from '../electron/validation';

describe('frame stats', () => {
  it('returns null with too few frames', () => expect(computeFrameStats([2, 2, 2])).toBeNull());
  it('perfectly even frames give 100 stability', () => {
    const s = computeFrameStats(Array(500).fill(2))!;
    expect(s.avgFps).toBeCloseTo(500);
    expect(s.low1Fps).toBeCloseTo(500);
    expect(s.stabilityScore).toBe(100);
    expect(s.stutters).toBe(0);
  });
  it('detects stutters and lowers stability', () => {
    const ft = Array(1000).fill(2.5);
    for (let i = 0; i < 1000; i += 50) ft[i] = 25; // 20 big spikes
    const s = computeFrameStats(ft)!;
    expect(s.stutters).toBe(20);
    expect(s.low1Fps).toBeCloseTo(40);
    expect(s.stabilityScore).toBeLessThan(60);
  });
});

describe('ping', () => {
  it('parses Windows and Unix replies', () => {
    expect(parsePingLine('Reply from 1.1.1.1: bytes=32 time=12ms TTL=57')).toBe(12);
    expect(parsePingLine('Reply from 192.168.1.1: bytes=32 time<1ms TTL=64')).toBe(0.5);
    expect(parsePingLine('64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.3 ms')).toBe(12.3);
    expect(parsePingLine('Antwort von 1.1.1.1: Bytes=32 Zeit=14ms TTL=57')).toBe(14);
    expect(parsePingLine('Request timed out.')).toBeUndefined();
    expect(parsePingLine('Reply from 10.0.0.1: Destination host unreachable.')).toBeUndefined();
  });
  it('summarizes loss and jitter', () => {
    const r = summarize('x', 'h', [10, 20, null, 10]);
    expect(r.lossPct).toBe(25);
    expect(r.jitter).toBe(10);
    expect(r.avg).toBeCloseTo(13.33, 1);
  });
  it('rejects injection-like hosts', () => {
    expect(isValidHost('1.1.1.1')).toBe(true);
    expect(isValidHost('epicgames.com')).toBe(true);
    expect(isValidHost('-t 1.1.1.1')).toBe(false);
    expect(isValidHost('a.com & calc')).toBe(false);
    expect(isValidHost('-n')).toBe(false);
  });
  it('blames Wi-Fi when the router hop is bad on wireless', () => {
    const gw = summarize('r', '192.168.1.1', [2, 40, 3, 60, 2, null]);
    const ext = summarize('c', '1.1.1.1', [20, 60, 22, 80]);
    expect(diagnose({ connectionType: 'wireless', interfaceName: null, wifiSignalPct: 40, gateway: '192.168.1.1' }, gw, [ext]).source).toBe('wifi');
  });
  it('blames ISP when router clean but all external bad', () => {
    const gw = summarize('r', 'g', [1, 1, 1, 1]);
    const ext = [summarize('a', 'a', [90, 95, 100]), summarize('b', 'b', [120, 130, 125])];
    expect(diagnose({ connectionType: 'wired', interfaceName: null, wifiSignalPct: null, gateway: 'g' }, gw, ext).source).toBe('isp');
  });
  it('healthy connection', () => {
    const gw = summarize('r', 'g', [1, 1, 1, 1]);
    expect(diagnose({ connectionType: 'wired', interfaceName: null, wifiSignalPct: null, gateway: 'g' }, gw, [summarize('a', 'a', [12, 13, 12])]).source).toBe('healthy');
  });
});

describe('PresentMon parsing', () => {
  it('handles v2 columns', () => {
    const c = parseHeader('Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy,GPUWait')!;
    const f = parseRow('FortniteClient-Win64-Shipping.exe,1234,0x1,DXGI,0,0,1,Hardware: Independent Flip,Application,100.1,2.10,1.50,0.6,0.2,1.9,1.8,0.3', c)!;
    expect(f.frameTimeMs).toBe(2.1);
    expect(f.cpuBusyMs).toBe(1.5);
    expect(f.gpuBusyMs).toBe(1.8);
  });
  it('handles v1 columns', () => {
    const c = parseHeader('Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange')!;
    expect(parseRow('Fortnite.exe,1,0x1,DXGI,0,0,1,x,0,1.0,3.33,3.33', c)!.frameTimeMs).toBe(3.33);
    expect(parseHeader('garbage,line')).toBeNull();
  });
});

describe('nvidia-smi', () => {
  it('parses a query line', () => {
    const g = parseNvsmiLine('NVIDIA GeForce RTX 5060, 581.57, 97, 6120, 8151, 66, 2730, 3090, 142.31, 145.00, 0x0000000000000004')!;
    expect(g.name).toBe('NVIDIA GeForce RTX 5060');
    expect(g.usage).toBe(97);
    expect(g.vramTotalMB).toBe(8151);
    expect(g.throttleReasons).toEqual(['Power limit (SW power cap)']);
  });
  it('treats N/A as unavailable', () => {
    expect(parseNvsmiLine('GPU, 1.0, 5, 100, 8000, 50, 1000, 2000, [N/A], [N/A], 0x0')!.powerW).toBeNull();
    expect(decodeReasons('0x60')).toHaveLength(2);
  });
});

describe('Fortnite config', () => {
  const ini = `[/Script/FortniteGame.FortGameUserSettings]
bUseVSync=True
FrameRateLimit=144.000000
FullscreenMode=1
ResolutionSizeX=1920
ResolutionSizeY=1080
bMotionBlur=False
[ScalabilityGroups]
sg.ResolutionQuality=100.000000
sg.ShadowQuality=3
sg.TextureQuality=1
[D3DRHIPreference]
PreferredRHI=dx12
PreferredFeatureLevel=sm6`;
  const r = analyzeFortniteConfig(ini, 'x');
  const by = (k: string) => r.settings.find((s) => s.key === k)!;
  it('flags slow settings', () => {
    expect(by('PreferredFeatureLevel').ok).toBe(false);
    expect(by('bUseVSync').ok).toBe(false);
    expect(by('FrameRateLimit').current).toBe('144 FPS');
    expect(by('sg.ShadowQuality').current).toBe('Epic');
    expect(by('sg.ShadowQuality').ok).toBe(false);
  });
  it('accepts good settings and marks missing as unknown', () => {
    expect(by('sg.TextureQuality').ok).toBe(true);
    expect(by('bMotionBlur').ok).toBe(true);
    expect(by('sg.FoliageQuality').ok).toBeNull();
  });
  it('detects performance mode', () => {
    expect(analyzeFortniteConfig('PreferredRHI=dx11\nPreferredFeatureLevel=es31', 'x').settings[0].ok).toBe(true);
  });
});

describe('hardware helpers', () => {
  it('maps i5-14600K topology', () => {
    const t = topologyFor('Intel Core i5-14600K', 20)!;
    expect(t.pCoreThreads).toHaveLength(12);
    expect(t.eCoreThreads).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(topologyFor('Intel Core i5-14600K', 14)).toBeNull();
    expect(topologyFor('AMD Ryzen 7 7800X3D', 16)).toBeNull();
  });
  it('never marks system or anti-cheat processes closable', () => {
    expect(categorize('EasyAntiCheat_EOS.exe')).toBe('anti-cheat');
    expect(categorize('MsMpEng.exe')).toBe('system');
    expect(categorize('svchost.exe')).toBe('system');
    expect(categorize('chrome.exe')).toBe('closable');
    expect(categorize('FortniteClient-Win64-Shipping.exe')).toBe('game');
  });
  it('parses tasklist CSV with localized separators', () => {
    const p = parseTasklist('"chrome.exe","1234","Console","1","312,456 K"\r\n"System","4","Services","0","1.024 K"');
    expect(p[0].memMB).toBeCloseTo(305.13, 1);
    expect(p[1].category).toBe('system');
  });
});

describe('bottleneck', () => {
  it('uses per-frame busy times when available', () => {
    const r = analyzeBottleneck([{ cpu: 30, maxCore: 60, gpu: 99, vramPct: 50, ramPct: 50, cpuBusyMs: 1.2, gpuBusyMs: 2.4, frameMs: 2.5 }]);
    expect(r[0].id).toBe('bn-gpu');
  });
  it('flags CPU limit from usage', () => {
    expect(analyzeBottleneck([{ cpu: 40, maxCore: 97, gpu: 60, vramPct: null, ramPct: 40 }])[0].id).toBe('bn-cpu');
  });
});

describe('IPC validation', () => {
  it('rejects unknown optimizations and bad hosts', () => {
    expect(() => ApplySchema.parse({ ids: ['disable-defender'] })).toThrow();
    expect(() => NetTestSchema.parse({ targets: [{ label: 'x', host: '1.1.1.1; rm -rf' }], count: 10 })).toThrow();
    expect(NetTestSchema.parse({ targets: [{ label: 'x', host: '1.1.1.1' }], count: 10 }).count).toBe(10);
  });
  it('only allows whitelisted external links', () => {
    expect(() => ExternalSchema.parse('ms-settings:gaming-gamemode')).not.toThrow();
    expect(() => ExternalSchema.parse('file:///C:/Windows/System32/cmd.exe')).toThrow();
    expect(() => ExternalSchema.parse('https://evil.com/nvidia.com/')).toThrow();
  });
});

import { applyMaxFps } from '../electron/services/fortniteConfig';
import { setDxFlag, dxFlagOn } from '../electron/services/windows';

describe('Max FPS profile writer', () => {
  const ini = '[/Script/FortniteGame.FortGameUserSettings]\r\nbUseVSync=True\r\nFrameRateLimit=144.000000\r\nFullscreenMode=1\r\nSomeOtherKey=Keep\r\n\r\n[ScalabilityGroups]\r\nsg.ShadowQuality=3\r\nsg.TextureQuality=1\r\nsg.ViewDistanceQuality=3\r\n\r\n[D3DRHIPreference]\r\nPreferredRHI=dx12\r\n';
  const r = applyMaxFps(ini);
  it('changes the slow settings and keeps everything else', () => {
    expect(r.text).toContain('bUseVSync=False');
    expect(r.text).toContain('FrameRateLimit=0.000000');
    expect(r.text).toContain('FullscreenMode=0');
    expect(r.text).toContain('SomeOtherKey=Keep');
    expect(r.text).toContain('sg.ShadowQuality=0');
    expect(r.text).toContain('sg.ViewDistanceQuality=2');
    expect(r.text).toContain('PreferredRHI=dx11');
    expect(r.text).toContain('PreferredFeatureLevel=es31');
    expect(r.text.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });
  it('does not raise or touch settings already at or below target', () => {
    expect(r.text).toContain('sg.TextureQuality=1');
    expect(r.changed).not.toContain('Textures: Medium or lower');
  });
  it('adds missing keys inside the right section', () => {
    const lines = r.text.split('\r\n');
    const sec = lines.indexOf('[D3DRHIPreference]');
    expect(lines.indexOf('PreferredFeatureLevel=es31')).toBeGreaterThan(sec);
    expect(lines.indexOf('sg.FoliageQuality=0')).toBeLessThan(sec);
  });
  it('is idempotent and the result passes the analyzer', () => {
    expect(applyMaxFps(r.text).changed).toEqual([]);
    expect(analyzeFortniteConfig(r.text, 'x').settings.filter((s) => s.ok === false)).toEqual([]);
  });
  it('creates sections in an empty file', () => {
    const e = applyMaxFps('');
    expect(e.text).toContain('[ScalabilityGroups]');
    expect(analyzeFortniteConfig(e.text, 'x').settings[0].ok).toBe(true);
  });
});

describe('windowed optimizations flag', () => {
  it('merges without losing other flags', () => {
    expect(setDxFlag('VRROptimizeEnable=0;', 'SwapEffectUpgradeEnable', '1')).toBe('VRROptimizeEnable=0;SwapEffectUpgradeEnable=1;');
    expect(setDxFlag('SwapEffectUpgradeEnable=0;X=1;', 'SwapEffectUpgradeEnable', '1')).toBe('X=1;SwapEffectUpgradeEnable=1;');
    expect(dxFlagOn('X=1;SwapEffectUpgradeEnable=1;', 'SwapEffectUpgradeEnable')).toBe(true);
    expect(dxFlagOn(null, 'SwapEffectUpgradeEnable')).toBe(false);
  });
});
