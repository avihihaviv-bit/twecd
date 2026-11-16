import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'));
process.env.LOCALAPPDATA = path.join(root, 'Local');
const { applyFortniteMaxFps, restoreFortnite, fortniteConfigPath, readFortniteConfig } = await import('../electron/services/fortniteFiles');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const ORIGINAL = '[/Script/FortniteGame.FortGameUserSettings]\r\nbUseVSync=True\r\nFrameRateLimit=60.000000\r\n[ScalabilityGroups]\r\nsg.ShadowQuality=3\r\n';

describe('Fortnite settings file apply/restore', () => {
  const bak = path.join(root, 'backup');
  it('reports a missing file honestly', () => {
    expect(applyFortniteMaxFps(bak).ok).toBe(false);
  });
  it('applies, keeps the first original as backup, and restores it byte-for-byte (UTF-16 + BOM)', () => {
    const p = fortniteConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const raw = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ORIGINAL, 'utf16le')]);
    fs.writeFileSync(p, raw);
    const r = applyFortniteMaxFps(bak);
    expect(r.ok).toBe(true);
    expect(r.changed.length).toBeGreaterThan(3);
    const after = fs.readFileSync(p);
    expect([after[0], after[1]]).toEqual([0xff, 0xfe]);
    const rep = readFortniteConfig().settings;
    expect(rep.find((s) => s.key === 'bUseVSync')!.ok).toBe(true);
    expect(rep.find((s) => s.key === 'PreferredFeatureLevel')!.current).toBe('Performance');
    expect(rep.filter((s) => s.ok === false)).toEqual([]);
    // applying twice must not overwrite the original backup
    expect(applyFortniteMaxFps(bak).changed).toEqual([]);
    const res = restoreFortnite(bak)!;
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(p).equals(raw)).toBe(true);
    expect(restoreFortnite(bak)).toBeNull();
  });
});
