import { describe, expect, it } from 'vitest';
import { canWriteKey, isEssentialStartup, parseEpicManifest, sameValue, STARTUP_DISABLED } from '../electron/services/windows';
import { ApplySchema, RestoreSchema } from '../electron/validation';

describe('reversible Windows tweaks', () => {
  it('finds Fortnite in Epic manifests only', () => {
    expect(parseEpicManifest(JSON.stringify({ AppName: 'Fortnite', DisplayName: 'Fortnite', InstallLocation: 'D:\\Epic\\Fortnite' }))).toBe('D:\\Epic\\Fortnite');
    expect(parseEpicManifest(JSON.stringify({ AppName: 'Sugar', DisplayName: 'Rocket League', InstallLocation: 'X' }))).toBeNull();
    expect(parseEpicManifest('not json')).toBeNull();
  });
  it('never offers security, driver or anti-cheat startup entries', () => {
    for (const n of ['SecurityHealth', 'RtkAudUService', 'NvBackend', 'EasyAntiCheat', 'IntelGraphics', 'Windows Defender']) expect(isEssentialStartup(n)).toBe(true);
    for (const n of ['Discord', 'Spotify', 'Steam', 'EpicGamesLauncher']) expect(isEssentialStartup(n, 'C:\\Users\\x\\AppData\\Local\\app.exe')).toBe(false);
  });
  it('only allows HKCU and the single whitelisted HKLM key', () => {
    expect(canWriteKey('HKCU\\Software\\Microsoft\\GameBar')).toBe(true);
    expect(canWriteKey('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers')).toBe(true);
    expect(canWriteKey('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender')).toBe(false);
    expect(canWriteKey('HKLM\\SYSTEM\\CurrentControlSet\\Services\\WinDefend')).toBe(false);
  });
  it('compares registry values for verification', () => {
    expect(sameValue({ type: 'REG_DWORD', data: '0' }, 'REG_DWORD', '0')).toBe(true);
    expect(sameValue({ type: 'REG_DWORD', data: '1' }, 'REG_DWORD', '0')).toBe(false);
    expect(sameValue(null, 'REG_DWORD', '0')).toBe(false);
    expect(sameValue({ type: 'REG_BINARY', data: '030000000000000000000000' }, 'REG_BINARY', STARTUP_DISABLED)).toBe(true);
    expect(sameValue({ type: 'REG_SZ', data: 'gpupreference=2;' }, 'REG_SZ', 'GpuPreference=2;')).toBe(true);
  });
  it('validates new optimization ids and per-item restore', () => {
    expect(ApplySchema.parse({ ids: ['hags-on', 'startup-apps-off'], startupNames: ['Discord'] }).ids).toHaveLength(2);
    expect(() => ApplySchema.parse({ ids: ['disable-windows-update'] })).toThrow();
    expect(RestoreSchema.parse(['game-capture-off'])).toEqual(['game-capture-off']);
    expect(RestoreSchema.parse(null)).toBeNull();
  });
});
