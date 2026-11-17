import fs from 'node:fs';
import type { ApplyItemResult, ApplyRequest, ApplyResult, ChangeLogEntry, OptimizationId, OptStatus, RestorableItem } from '../../shared/types';
import { isWin } from './exec';
import { JsonStore } from './store';
import {
  BALANCED, DX_GLOBAL, DX_PREFS_KEY, GAMEBAR_KEY, GAMEDVR_KEY, HIGH_PERF, STARTUP_APPROVED, STARTUP_DISABLED, ULTIMATE,
  createRestorePoint, createUltimatePlan, deletePowerScheme, dwordOf, dxFlagOn, fortniteExePath, isEssentialStartup, listPowerSchemes,
  listProcesses, listUserStartup, regDeleteValue, regQuery, regRead, regRemove, regSetDword, regSetString, regWrite, sameValue, scanTemp,
  setDxFlag, setPowerScheme, type RegSnapshot, type RegType, DO_KEY, getHags, powerThrottlingExempt, setPowerThrottling,
} from './windows';
import { applyFortniteMaxFps, fortniteBackupPath, readFortniteConfig, restoreFortnite } from './fortniteFiles';
import { friendlyName, isClosable } from './processCatalog';

interface RegBackupEntry { key: string; name: string; orig: RegSnapshot | null }

/** Original values captured BEFORE the first change. `null` = value did not exist (restore deletes it). */
export interface Backup {
  createdAt: number;
  autoGameModeEnabled?: number | null;
  allowAutoGameMode?: number | null;
  historicalCaptureEnabled?: number | null;
  powerSchemeGuid?: string;
  createdPowerSchemeGuid?: string;
  dxGlobalSettings?: string | null;
  reg?: Partial<Record<OptimizationId, RegBackupEntry[]>>; // generic registry tweaks
  powerThrottlingExe?: string;
}

export const TITLES: Record<OptimizationId, string> = {
  'game-mode-on': 'Turn on Windows Game Mode',
  'power-plan-high': 'Use a high-performance power plan',
  'background-recording-off': 'Turn off Xbox background recording',
  'close-background-apps': 'Close selected background apps',
  'clean-temp-files': 'Clean old temporary files',
  'fortnite-max-fps': 'Apply Max FPS settings to Fortnite',
  'windowed-optimizations-on': 'Turn on optimizations for windowed games',
  'game-capture-off': 'Turn off Xbox Game Bar game capture',
  'fortnite-gpu-preference': 'Run Fortnite on the NVIDIA GPU (high performance)',
  'hags-on': 'Turn on Hardware-accelerated GPU scheduling',
  'startup-apps-off': 'Disable selected startup apps',
  'visual-effects-performance': 'Set Windows visual effects to Best performance',
  'fortnite-power-throttling-off': 'Exempt Fortnite from Windows power throttling',
  'delivery-optimization-p2p-off': 'Stop Windows Update uploading to other PCs',
};

/** Changes outside TWECD's own files: a System Restore point is attempted first (when running as administrator). */
const SYSTEM_CHANGES: OptimizationId[] = ['fortnite-power-throttling-off', 'delivery-optimization-p2p-off', 'hags-on', 'power-plan-high', 'game-capture-off', 'startup-apps-off', 'visual-effects-performance', 'fortnite-gpu-preference', 'game-mode-on', 'background-recording-off', 'windowed-optimizations-on'];

type Val = { key: string; name: string; type: RegType; data: string };
const HAGS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers';
const show = (v: RegSnapshot | null) => (v ? v.data : 'not set (Windows default)');

export class Optimizer {
  constructor(
    private backup: JsonStore<Backup>,
    private log: JsonStore<{ entries: ChangeLogEntry[] }>,
    private fortniteBackupDir: string,
    private fortniteRunning: () => boolean,
    private isAdmin: () => Promise<boolean>,
  ) {}

  private addLog(action: string, detail: string) {
    const l = this.log.read();
    l.entries.unshift({ ts: Date.now(), action, detail });
    l.entries = l.entries.slice(0, 200);
    this.log.write(l);
  }
  changeLog() { return this.log.read().entries; }
  note(action: string, detail: string) { this.addLog(action, detail); }

  /** Everything that can be restored, one entry per optimization (for per-item restore). */
  restorable(): RestorableItem[] {
    const b = this.backup.readRaw();
    const out: RestorableItem[] = [];
    if (fs.existsSync(fortniteBackupPath(this.fortniteBackupDir))) out.push({ id: 'fortnite-max-fps', title: 'Fortnite settings file', detail: 'Your original GameUserSettings.ini' });
    if (!b) return out;
    if (b.autoGameModeEnabled !== undefined) out.push({ id: 'game-mode-on', title: 'Game Mode', detail: `Original: ${b.autoGameModeEnabled ?? 'Windows default'}` });
    if (b.historicalCaptureEnabled !== undefined) out.push({ id: 'background-recording-off', title: 'Background recording', detail: `Original: ${b.historicalCaptureEnabled ?? 'Windows default'}` });
    if (b.powerSchemeGuid) out.push({ id: 'power-plan-high', title: 'Power plan', detail: 'Switch back to your previous plan' });
    if (b.powerThrottlingExe) out.push({ id: 'fortnite-power-throttling-off', title: 'Fortnite power throttling exemption', detail: b.powerThrottlingExe });
    if (b.dxGlobalSettings !== undefined) out.push({ id: 'windowed-optimizations-on', title: 'Windowed game optimizations', detail: `Original: ${b.dxGlobalSettings ?? 'not set'}` });
    for (const [id, entries] of Object.entries(b.reg ?? {}) as [OptimizationId, RegBackupEntry[]][]) {
      if (entries?.length) out.push({ id, title: TITLES[id], detail: `${entries.length} value${entries.length > 1 ? 's' : ''} saved` });
    }
    return out;
  }
  hasBackup() { return this.restorable().length > 0; }

  async apply(req: ApplyRequest): Promise<ApplyResult> {
    const b: Backup = this.backup.readRaw() ?? { createdAt: Date.now() };
    b.reg ??= {};
    let restorePoint: ApplyResult['restorePoint'] = null;
    if (isWin && !req.skipRestorePoint && req.ids.some((i) => SYSTEM_CHANGES.includes(i))) {
      restorePoint = (await this.isAdmin()) ? await createRestorePoint() : { ok: false, message: 'Not running as administrator, so no System Restore point was created. TWECD\'s own backup of every changed value is saved.' };
    }
    const results: ApplyItemResult[] = [];
    for (const id of req.ids) {
      const r = await this.applyOne(id, b, req).catch((e) => ({ status: 'failed' as const, message: String(e) }));
      results.push({ id, title: TITLES[id], ...r });
      if (r.status === 'success') this.addLog(TITLES[id], r.message);
      try { this.backup.write(b); } catch { /* reported below */ }
    }
    let backupSaved = false;
    try { this.backup.write(b); backupSaved = true; } catch { /* reported to UI */ }
    return { results, backupSaved, restorePoint };
  }

  private async values(id: OptimizationId, req: ApplyRequest): Promise<Val[] | string> {
    switch (id) {
      case 'game-capture-off': return [
        { key: 'HKCU\\System\\GameConfigStore', name: 'GameDVR_Enabled', type: 'REG_DWORD', data: '0' },
        { key: GAMEDVR_KEY, name: 'AppCaptureEnabled', type: 'REG_DWORD', data: '0' },
      ];
      case 'fortnite-gpu-preference': {
        const exe = fortniteExePath();
        if (!exe) return 'Fortnite\'s install folder was not found in the Epic Games Launcher manifests.';
        return [{ key: DX_PREFS_KEY, name: exe, type: 'REG_SZ', data: 'GpuPreference=2;' }];
      }
      case 'hags-on':
        if (!(await this.isAdmin())) return 'Needs administrator rights (Settings > Restart as administrator), because this is a machine-wide setting.';
        return [{ key: HAGS_KEY, name: 'HwSchMode', type: 'REG_DWORD', data: '2' }];
      case 'delivery-optimization-p2p-off':
        if (!(await this.isAdmin())) return 'Needs administrator rights (machine-wide Windows Update setting).';
        return [{ key: DO_KEY, name: 'DownloadMode', type: 'REG_DWORD', data: '0' }];
      case 'visual-effects-performance': return [{ key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', name: 'VisualFXSetting', type: 'REG_DWORD', data: '2' }];
      case 'startup-apps-off': {
        const names = req.startupNames ?? [];
        if (!names.length) return 'No startup apps selected.';
        const entries = await listUserStartup();
        const ok = entries.filter((e) => names.includes(e.name) && !e.essential && !isEssentialStartup(e.name, e.command));
        if (!ok.length) return 'None of the selected entries can be disabled safely.';
        return ok.map((e) => ({ key: STARTUP_APPROVED, name: e.name, type: 'REG_BINARY' as RegType, data: STARTUP_DISABLED }));
      }
      default: return 'not a registry tweak';
    }
  }

  /** Generic reversible registry change: back up original once, write, then re-read to verify. */
  private async applyTweak(id: OptimizationId, b: Backup, req: ApplyRequest): Promise<Omit<ApplyItemResult, 'id' | 'title'>> {
    const vals = await this.values(id, req);
    if (typeof vals === 'string') return { status: vals.startsWith('No ') ? 'skipped' : 'unavailable', message: vals };
    const before = await Promise.all(vals.map((v) => regRead(v.key, v.name)));
    if (vals.every((v, i) => sameValue(before[i], v.type, v.data))) return { status: 'skipped', message: 'Already set.', verified: true };
    const store = (b.reg![id] ??= []);
    vals.forEach((v, i) => { if (!store.some((e) => e.key === v.key && e.name === v.name)) store.push({ key: v.key, name: v.name, orig: before[i] }); });
    for (const v of vals) if (!(await regWrite(v.key, v.name, v.type, v.data))) return { status: 'failed', message: `Could not write ${v.name}.`, verified: false };
    const after = await Promise.all(vals.map((v) => regRead(v.key, v.name)));
    const verified = vals.every((v, i) => sameValue(after[i], v.type, v.data));
    const msg: Partial<Record<OptimizationId, string>> = {
      'game-capture-off': 'Game Bar capture is off (Win+Alt+R clips no longer work). Game Mode stays on.',
      'fortnite-gpu-preference': 'Windows will always start Fortnite on the high-performance GPU (Settings > System > Display > Graphics).',
      'hags-on': 'Enabled. Takes effect after you restart the PC. Benchmark before and after to check it on your system.',
      'visual-effects-performance': 'Set to Best performance. Takes effect after signing out. No effect on FPS inside fullscreen games; it only makes Windows itself lighter.',
      'delivery-optimization-p2p-off': 'Windows Update still downloads updates normally, but no longer uploads them to other PCs over your connection.',
      'startup-apps-off': `Disabled at startup: ${vals.map((v) => v.name).join(', ')}. They still work when you open them yourself.`,
    };
    return {
      status: verified ? 'success' : 'failed', verified,
      message: verified ? msg[id] ?? 'Done.' : 'Written, but reading it back did not match. Windows may have blocked it.',
      before: vals.map((v, i) => `${v.name.split('\\').pop()}: ${show(before[i])}`).join(' · '),
      after: vals.map((v, i) => `${v.name.split('\\').pop()}: ${show(after[i])}`).join(' · '),
    };
  }

  private async applyOne(id: OptimizationId, b: Backup, req: ApplyRequest): Promise<Omit<ApplyItemResult, 'id' | 'title'>> {
    if (!isWin && id !== 'close-background-apps') return { status: 'unavailable', message: 'Only available on Windows.' };
    if (['game-capture-off', 'fortnite-gpu-preference', 'hags-on', 'visual-effects-performance', 'startup-apps-off', 'delivery-optimization-p2p-off'].includes(id)) return this.applyTweak(id, b, req);
    if (id === 'fortnite-power-throttling-off') {
      const exe = fortniteExePath();
      if (!exe) return { status: 'unavailable', message: 'Fortnite\'s install folder was not found in the Epic Games Launcher manifests.' };
      if (!(await this.isAdmin())) return { status: 'unavailable', message: 'Needs administrator rights (Settings > Restart as administrator).' };
      if (await powerThrottlingExempt(exe)) return { status: 'skipped', message: 'Fortnite is already exempt.', verified: true };
      await setPowerThrottling(exe, true);
      const verified = (await powerThrottlingExempt(exe)) === true;
      if (verified) b.powerThrottlingExe = exe;
      return { status: verified ? 'success' : 'failed', verified, before: 'Power throttling allowed', after: verified ? 'Fortnite exempt' : 'unchanged', message: verified ? 'Windows will not apply power throttling (EcoQoS) to Fortnite, so its threads are not parked on slow E-core clocks.' : 'powercfg did not accept the exception.' };
    }
    switch (id) {
      case 'game-mode-on': {
        const cur = dwordOf(await regQuery(GAMEBAR_KEY, 'AutoGameModeEnabled'));
        if (cur === null || cur !== 0) return { status: 'skipped', message: 'Game Mode is already on.', verified: true };
        if (b.autoGameModeEnabled === undefined) b.autoGameModeEnabled = cur;
        if (b.allowAutoGameMode === undefined) b.allowAutoGameMode = dwordOf(await regQuery(GAMEBAR_KEY, 'AllowAutoGameMode'));
        await regSetDword(GAMEBAR_KEY, 'AutoGameModeEnabled', 1); await regSetDword(GAMEBAR_KEY, 'AllowAutoGameMode', 1);
        const verified = dwordOf(await regQuery(GAMEBAR_KEY, 'AutoGameModeEnabled')) === 1;
        return { status: verified ? 'success' : 'failed', verified, before: 'Off', after: verified ? 'On' : 'Off', message: verified ? 'Game Mode enabled (Settings > Gaming > Game Mode).' : 'Could not write the Game Mode setting.' };
      }
      case 'background-recording-off': {
        const cur = dwordOf(await regQuery(GAMEDVR_KEY, 'HistoricalCaptureEnabled'));
        if (cur !== 1) return { status: 'skipped', message: 'Background recording is already off.', verified: true };
        if (b.historicalCaptureEnabled === undefined) b.historicalCaptureEnabled = cur;
        await regSetDword(GAMEDVR_KEY, 'HistoricalCaptureEnabled', 0);
        const verified = dwordOf(await regQuery(GAMEDVR_KEY, 'HistoricalCaptureEnabled')) === 0;
        return { status: verified ? 'success' : 'failed', verified, before: 'On', after: verified ? 'Off' : 'On', message: verified ? '"Record what happened" turned off.' : 'Could not write the setting.' };
      }
      case 'power-plan-high': {
        const schemes = await listPowerSchemes();
        const active = schemes.find((s) => s.active);
        let target = schemes.find((s) => s.guid === b.createdPowerSchemeGuid) ?? schemes.find((s) => s.guid === ULTIMATE) ?? schemes.find((s) => s.guid === HIGH_PERF) ?? schemes.find((s) => /ultimate|high performance/i.test(s.name));
        if (active && target && active.guid === target.guid) return { status: 'skipped', message: `${target.name} is already active.`, verified: true };
        if (!b.powerSchemeGuid && active) b.powerSchemeGuid = active.guid;
        if (!target) {
          const created = await createUltimatePlan();
          if (!created) return { status: 'unavailable', message: 'Windows did not allow creating a performance plan on this PC. Set Settings > System > Power > Power mode to "Best performance" instead.' };
          b.createdPowerSchemeGuid = created;
          target = { guid: created, name: 'Ultimate Performance', active: false };
        }
        await setPowerScheme(target.guid);
        const verified = (await listPowerSchemes()).find((s) => s.active)?.guid === target.guid;
        return { status: verified ? 'success' : 'failed', verified, before: active?.name ?? 'unknown', after: verified ? target.name : active?.name ?? 'unknown', message: verified ? `Active power plan: ${target.name}.` : 'powercfg could not change the plan.' };
      }
      case 'fortnite-max-fps': {
        if (this.fortniteRunning()) return { status: 'failed', message: 'Close Fortnite first: the game overwrites its settings file when it exits. Then apply again.' };
        const beforeBad = readFortniteConfig().settings.filter((s) => s.ok === false).length;
        const r = applyFortniteMaxFps(this.fortniteBackupDir);
        if (!r.ok) return { status: 'failed', message: r.message, verified: false };
        const afterBad = readFortniteConfig().settings.filter((s) => s.ok === false).length;
        return { status: r.changed.length ? 'success' : 'skipped', message: r.message, verified: afterBad === 0, before: `${beforeBad} FPS-costing settings`, after: `${afterBad} FPS-costing settings` };
      }
      case 'windowed-optimizations-on': {
        const cur = (await regQuery(DX_PREFS_KEY, DX_GLOBAL))?.data ?? null;
        if (dxFlagOn(cur, 'SwapEffectUpgradeEnable')) return { status: 'skipped', message: 'Already on.', verified: true };
        if (b.dxGlobalSettings === undefined) b.dxGlobalSettings = cur;
        await regSetString(DX_PREFS_KEY, DX_GLOBAL, setDxFlag(cur ?? '', 'SwapEffectUpgradeEnable', '1'));
        const verified = dxFlagOn((await regQuery(DX_PREFS_KEY, DX_GLOBAL))?.data ?? null, 'SwapEffectUpgradeEnable');
        return { status: verified ? 'success' : 'failed', verified, before: 'Off', after: verified ? 'On' : 'Off', message: verified ? 'Windowed and borderless games now use the faster flip presentation model.' : 'Could not write the setting.' };
      }
      case 'clean-temp-files': {
        const r = scanTemp(true);
        return { status: 'success', message: `Freed ${(r.freedBytes / 1048576).toFixed(0)} MB from ${r.files} old temp files (${r.skipped} in use were skipped). Not reversible: these were temporary files untouched for 24h+.` };
      }
      case 'close-background-apps': {
        const pids = req.pids ?? [];
        if (pids.length === 0) return { status: 'skipped', message: 'No apps selected.' };
        const current = await listProcesses(false);
        const closed: string[] = []; const failed: string[] = [];
        for (const pid of pids) {
          const p = current.find((x) => x.pid === pid);
          if (!p || !isClosable(p.name)) { failed.push(`PID ${pid} (not a safe-to-close app)`); continue; }
          try { process.kill(pid); closed.push(friendlyName(p.name)); } catch { failed.push(friendlyName(p.name)); }
        }
        await new Promise((r) => setTimeout(r, 1500));
        const still = (await listProcesses(false)).filter((p) => pids.includes(p.pid)).length;
        if (closed.length === 0) return { status: 'failed', message: `Nothing closed. ${failed.join(', ')}`, verified: false };
        return { status: 'success', verified: still === 0, message: `Closed: ${[...new Set(closed)].join(', ')}${failed.length ? `. Could not close: ${[...new Set(failed)].join(', ')}` : ''}. Re-open them any time.` };
      }
      default: return { status: 'unavailable', message: 'Unknown optimization.' };
    }
  }

  /** Restores the given optimizations (or all of them) to the original values saved before TWECD changed them. */
  async restore(ids?: OptimizationId[]): Promise<ApplyItemResult[]> {
    const b = this.backup.readRaw() ?? { createdAt: 0 };
    const want = (id: OptimizationId) => !ids || ids.includes(id);
    const out: ApplyItemResult[] = [];
    if (want('fortnite-max-fps') && fs.existsSync(fortniteBackupPath(this.fortniteBackupDir))) {
      if (this.fortniteRunning()) out.push({ id: 'fortnite-max-fps', title: 'Fortnite settings', status: 'failed', message: 'Close Fortnite first, then restore again.' });
      else { const r = restoreFortnite(this.fortniteBackupDir)!; out.push({ id: 'fortnite-max-fps', title: 'Fortnite settings', status: r.ok ? 'success' : 'failed', message: r.message }); }
    }
    if (want('game-mode-on') && b.autoGameModeEnabled !== undefined) {
      const put = (name: string, v: number | null | undefined) => v === undefined ? Promise.resolve(true) : v === null ? regDeleteValue(GAMEBAR_KEY, name) : regSetDword(GAMEBAR_KEY, name, v);
      const ok = (await put('AutoGameModeEnabled', b.autoGameModeEnabled)) && (await put('AllowAutoGameMode', b.allowAutoGameMode));
      out.push({ id: 'game-mode-on', title: 'Game Mode', status: ok ? 'success' : 'failed', message: ok ? 'Restored original Game Mode setting.' : 'Could not restore Game Mode.' });
      if (ok) { delete b.autoGameModeEnabled; delete b.allowAutoGameMode; }
    }
    if (want('background-recording-off') && b.historicalCaptureEnabled !== undefined) {
      const ok = b.historicalCaptureEnabled === null ? await regDeleteValue(GAMEDVR_KEY, 'HistoricalCaptureEnabled') : await regSetDword(GAMEDVR_KEY, 'HistoricalCaptureEnabled', b.historicalCaptureEnabled);
      out.push({ id: 'background-recording-off', title: 'Background recording', status: ok ? 'success' : 'failed', message: ok ? 'Restored the original setting.' : 'Could not restore.' });
      if (ok) delete b.historicalCaptureEnabled;
    }
    if (want('power-plan-high') && b.powerSchemeGuid) {
      const ok = await setPowerScheme(b.powerSchemeGuid) || await setPowerScheme(BALANCED);
      if (ok && b.createdPowerSchemeGuid) await deletePowerScheme(b.createdPowerSchemeGuid);
      out.push({ id: 'power-plan-high', title: 'Power plan', status: ok ? 'success' : 'failed', message: ok ? `Restored the original power plan${b.createdPowerSchemeGuid ? ' and removed the TWECD Ultimate plan' : ''}.` : 'Could not restore the power plan.' });
      if (ok) { delete b.powerSchemeGuid; delete b.createdPowerSchemeGuid; }
    }
    if (want('windowed-optimizations-on') && b.dxGlobalSettings !== undefined) {
      const ok = b.dxGlobalSettings === null ? await regDeleteValue(DX_PREFS_KEY, DX_GLOBAL) : await regSetString(DX_PREFS_KEY, DX_GLOBAL, b.dxGlobalSettings);
      out.push({ id: 'windowed-optimizations-on', title: 'Windowed game optimizations', status: ok ? 'success' : 'failed', message: ok ? 'Restored the original setting.' : 'Could not restore.' });
      if (ok) delete b.dxGlobalSettings;
    }
    if (want('fortnite-power-throttling-off') && b.powerThrottlingExe) {
      const ok = await setPowerThrottling(b.powerThrottlingExe, false);
      out.push({ id: 'fortnite-power-throttling-off', title: TITLES['fortnite-power-throttling-off'], status: ok ? 'success' : 'failed', message: ok ? 'Fortnite follows normal Windows power throttling again.' : 'Could not reset (administrator rights needed).' });
      if (ok) delete b.powerThrottlingExe;
    }
    for (const [id, entries] of Object.entries(b.reg ?? {}) as [OptimizationId, RegBackupEntry[]][]) {
      if (!want(id) || !entries?.length) continue;
      let ok = true;
      for (const e of entries) ok = (e.orig === null ? await regRemove(e.key, e.name) : await regWrite(e.key, e.name, e.orig.type, e.orig.data)) && ok;
      out.push({ id, title: TITLES[id], status: ok ? 'success' : 'failed', message: ok ? `Restored ${entries.length} original value${entries.length > 1 ? 's' : ''}${id === 'hags-on' ? ' (restart the PC to apply)' : ''}.` : 'Could not restore every value (administrator rights may be needed).' });
      if (ok) delete b.reg![id];
    }
    try { if (Object.keys(b).filter((k) => k !== 'createdAt' && k !== 'reg').length === 0 && !Object.keys(b.reg ?? {}).length) this.backup.remove(); else this.backup.write(b); } catch { /* ignore */ }
    this.addLog(ids ? `Restore: ${ids.map((i) => TITLES[i]).join(', ')}` : 'Restore defaults', out.map((r) => `${r.title}: ${r.status}`).join('; ') || 'Nothing to restore');
    return out;
  }

  /** Current state of every optimization, read live from Windows/Fortnite (for one-at-a-time optimization). */
  async status(): Promise<OptStatus[]> {
    const admin = await this.isAdmin();
    const backup = this.backup.readRaw();
    const has = (id: OptimizationId) => this.restorable().some((r) => r.id === id) || (id === 'fortnite-max-fps' && fs.existsSync(fortniteBackupPath(this.fortniteBackupDir)));
    const S = (id: OptimizationId, area: OptStatus['area'], state: OptStatus['state'], current: string, why: string, impact: OptStatus['impact'], risk: OptStatus['risk'], needsAdmin = false, rebootRequired = false): OptStatus =>
      ({ id, title: TITLES[id], area, state, current, why, impact, risk, needsAdmin, rebootRequired, restorable: has(id) });
    if (!isWin) return (Object.keys(TITLES) as OptimizationId[]).filter((i) => i !== 'close-background-apps' && i !== 'clean-temp-files').map((id) => S(id, 'Windows', 'unavailable', 'Windows only', '', 'low', 'none'));
    const out: OptStatus[] = [];
    const fn = readFortniteConfig();
    const bad = fn.settings.filter((x) => x.ok === false);
    out.push(S('fortnite-max-fps', 'Fortnite', !fn.found ? 'unavailable' : bad.length ? 'not-optimal' : 'optimal', !fn.found ? 'Settings file not found' : bad.length ? `${bad.length} settings cost FPS: ${bad.slice(0, 4).map((x) => x.label).join(', ')}${bad.length > 4 ? '...' : ''}` : `Optimal (${fn.profile ?? 'custom'} profile)`, 'The biggest FPS lever: Performance mode, unlimited FPS, VSync off, heavy effects off.', 'high', 'none'));
    const gm = dwordOf(await regQuery(GAMEBAR_KEY, 'AutoGameModeEnabled'));
    out.push(S('game-mode-on', 'Windows', gm === 0 ? 'not-optimal' : 'optimal', gm === 0 ? 'Off' : 'On', 'Prioritizes the game and pauses Windows Update installs while you play.', 'medium', 'none'));
    const schemes = await listPowerSchemes(); const act = schemes.find((x) => x.active);
    const perf = act && (act.guid === ULTIMATE || act.guid === HIGH_PERF || act.guid === backup?.createdPowerSchemeGuid || /ultimate|high performance/i.test(act.name));
    out.push(S('power-plan-high', 'Windows', perf ? 'optimal' : 'not-optimal', act?.name ?? 'unknown', 'Keeps i5-14600K cores out of deep parking: fewer frame-time spikes, better 1% lows.', 'medium', 'none'));
    const hist = dwordOf(await regQuery(GAMEDVR_KEY, 'HistoricalCaptureEnabled'));
    out.push(S('background-recording-off', 'Windows', hist === 1 ? 'not-optimal' : 'optimal', hist === 1 ? 'Recording in background' : 'Off', 'Background recording encodes gameplay continuously.', 'medium', 'none'));
    const cap = dwordOf(await regQuery('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled')); const appCap = dwordOf(await regQuery(GAMEDVR_KEY, 'AppCaptureEnabled'));
    out.push(S('game-capture-off', 'Windows', cap === 0 && appCap === 0 ? 'optimal' : 'not-optimal', cap === 0 && appCap === 0 ? 'Off' : 'Game Bar capture active', 'Removes the Game Bar capture hook from games. Game Mode keeps working.', 'low', 'none'));
    const dx = (await regQuery(DX_PREFS_KEY, DX_GLOBAL))?.data ?? null;
    out.push(S('windowed-optimizations-on', 'Graphics', dxFlagOn(dx, 'SwapEffectUpgradeEnable') ? 'optimal' : 'not-optimal', dxFlagOn(dx, 'SwapEffectUpgradeEnable') ? 'On' : 'Off', 'Flip-model presentation for borderless/windowed games: lower latency.', 'low', 'none'));
    const exe = fortniteExePath();
    const pref = exe ? await regRead(DX_PREFS_KEY, exe) : null;
    out.push(S('fortnite-gpu-preference', 'Graphics', !exe ? 'unavailable' : pref && /GpuPreference=2/i.test(pref.data) ? 'optimal' : 'not-optimal', !exe ? 'Fortnite not found' : pref?.data ?? 'Let Windows decide', 'Guarantees Fortnite never runs on the CPU\'s integrated graphics.', 'low', 'none'));
    const hags = await getHags();
    out.push(S('hags-on', 'Graphics', hags === null ? 'unknown' : hags ? 'optimal' : 'not-optimal', hags === null ? 'Not reported' : hags ? 'On' : 'Off', 'GPU manages its own scheduling; required for DLSS Frame Generation. Benchmark before/after on your PC.', 'low', 'low', true, true));
    const pt = exe ? await powerThrottlingExempt(exe) : null;
    out.push(S('fortnite-power-throttling-off', 'Windows', !exe ? 'unavailable' : pt === null ? 'unknown' : pt ? 'optimal' : 'not-optimal', !exe ? 'Fortnite not found' : pt === null ? 'Needs administrator to read' : pt ? 'Exempt' : 'Throttling allowed', 'On hybrid Intel CPUs, Windows power throttling can push threads to E-cores at low clocks (e.g. when the game loses focus).', 'low', 'none', true));
    const dom = admin ? dwordOf(await regQuery(DO_KEY, 'DownloadMode')) : undefined;
    out.push(S('delivery-optimization-p2p-off', 'Network', dom === undefined ? 'unknown' : dom === 0 ? 'optimal' : 'not-optimal', dom === undefined ? 'Needs administrator to read' : dom === 0 ? 'Off (downloads only)' : dom === null ? 'Windows default (may share updates)' : `Mode ${dom} (shares updates)`, 'Stops Windows Update from uploading updates to other PCs over your connection, which can cause ping spikes. Updates still install.', 'low', 'none', true));
    const vfx = dwordOf(await regQuery('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting'));
    out.push(S('visual-effects-performance', 'Windows', vfx === 2 ? 'optimal' : 'not-optimal', vfx === 2 ? 'Best performance' : 'Windows default', 'Lighter desktop only; no effect inside fullscreen Fortnite.', 'low', 'none'));
    const st = (await listUserStartup()).filter((e) => e.enabled && !e.essential);
    out.push(S('startup-apps-off', 'Windows', st.length ? 'not-optimal' : 'optimal', st.length ? `${st.length} non-essential apps start with Windows: ${st.slice(0, 4).map((e) => e.name).join(', ')}` : 'Only essential entries', 'Fewer apps running in the background during matches.', 'medium', 'none'));
    return out;
  }

}

