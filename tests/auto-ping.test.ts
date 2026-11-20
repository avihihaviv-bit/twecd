import { describe, expect, it } from 'vitest';
import { chooseLock, AUTO_WINDOWS } from '../electron/services/autoMode';
import { pickBest, summarizeRegion, FORTNITE_REGIONS } from '../electron/services/regions';
import { findPingKillers } from '../electron/services/processCatalog';
import { isValidHost } from '../electron/services/ping';

describe('Auto FPS lock', () => {
  it('locks at 500 only when the PC actually held 500', () => {
    expect(chooseLock({ sustainedFps: 532, recommendedCap: 530 }, 500)!.cap).toBe(500);
  });
  it('otherwise locks at the highest FPS it really holds, never a fake 500', () => {
    const c = chooseLock({ sustainedFps: 412, recommendedCap: 410 }, 500)!;
    expect(c.cap).toBe(410);
    expect(c.reason).toMatch(/below the 500 target/);
  });
  it('does nothing without measurements', () => {
    expect(chooseLock(null, 500)).toBeNull();
    expect(chooseLock({ sustainedFps: null, recommendedCap: null }, 500)).toBeNull();
  });
  it('Auto Mode never closes apps or deletes files', () => {
    expect(AUTO_WINDOWS).not.toContain('close-background-apps');
    expect(AUTO_WINDOWS).not.toContain('clean-temp-files');
    expect(AUTO_WINDOWS).not.toContain('startup-apps-off');
  });
});

describe('Region finder', () => {
  it('summarizes handshake samples', () => {
    const s = summarizeRegion([40, 42, null, 41, 60]);
    expect(s.best).toBe(40); expect(s.median).toBe(42); expect(s.lossPct).toBe(20);
    expect(summarizeRegion([null, null]).median).toBeNull();
  });
  it('picks the lowest region, preferring lower jitter when within 5 ms', () => {
    const r = (id: string, median: number | null, jitter = 1, lossPct = 0) => ({ id, name: id, location: '', samples: [], best: median, median, jitter, lossPct });
    expect(pickBest([r('EU', 62), r('ME', 48), r('NAE', 140)])!.id).toBe('ME');
    expect(pickBest([r('EU', 50, 0.5), r('ME', 47, 9)])!.id).toBe('EU');
    expect(pickBest([r('EU', null), r('ME', 40, 1, 80)])).toBeNull();
  });
  it('only uses valid, fixed hosts', () => {
    for (const r of FORTNITE_REGIONS) expect(isValidHost(r.host)).toBe(true);
  });
});

describe('Ping killers', () => {
  it('finds bandwidth-heavy apps once each and ignores normal ones', () => {
    const k = findPingKillers([{ pid: 1, name: 'qbittorrent.exe' }, { pid: 2, name: 'OneDrive.exe' }, { pid: 3, name: 'OneDrive.exe' }, { pid: 4, name: 'notepad.exe' }, { pid: 5, name: 'svchost.exe' }]);
    expect(k.map((x) => x.name)).toEqual(['qBittorrent', 'OneDrive']);
    expect(k[0].closable).toBe(true);
  });
});

import { plausibility, distanceKm } from '../electron/services/regions';
describe('Region measurement physics check', () => {
  const r = (id: string, best: number) => ({ id, name: id, location: '', samples: [], best, median: best, jitter: 1, lossPct: 0 });
  it('rejects impossible results (intercepted connections)', () => {
    const res = [r('EU', 7), r('ME', 5), r('NAE', 7), r('BR', 4), r('ASIA', 5), r('OCE', 5)];
    expect(plausibility(res).ok).toBe(false);
    expect(plausibility(res).reason).toMatch(/VPN, proxy or antivirus/);
  });
  it('accepts realistic results from Israel', () => {
    const res = [r('EU', 55), r('ME', 38), r('NAE', 140), r('NAC', 150), r('NAW', 200), r('BR', 230), r('ASIA', 190), r('OCE', 280)];
    expect(plausibility(res)).toEqual({ ok: true, reason: null });
  });
  it('computes distances', () => {
    expect(distanceKm({ lat: 35.7, lon: 139.7 }, { lat: 38.9, lon: -77.4 })).toBeGreaterThan(10500);
  });
});

import { recommendCap } from '../electron/services/fortniteConfig';
describe('Lock safety (bug: 180 FPS lock on a 320 Hz monitor)', () => {
  it('ignores loading-screen / lobby seconds when recommending a lock', () => {
    const fps = [...Array(70).fill(0).map((_, i) => 400 + (i % 30)), ...Array(30).fill(60)];
    expect(recommendCap(fps)!.cap).toBeGreaterThanOrEqual(400);
  });
  it('never auto-locks below the monitor refresh rate', () => {
    const c = chooseLock({ sustainedFps: 200, recommendedCap: 180 }, 500, 320)!;
    expect(c.cap).toBe(0);
    expect(c.reason).toMatch(/320 Hz/);
    expect(chooseLock({ sustainedFps: 410, recommendedCap: 400 }, 500, 320)!.cap).toBe(400);
  });
});
