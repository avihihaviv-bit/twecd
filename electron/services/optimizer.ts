import fs from 'node:fs';
import { fortniteBackupPath } from './fortniteFiles';
import type { ApplyItemResult, ApplyRequest, ApplyResult, ChangeLogEntry, OptimizationId } from '../../shared/types';
import { isWin } from './exec';
import { JsonStore } from './store';
import {
  BALANCED, DX_GLOBAL, DX_PREFS_KEY, GAMEBAR_KEY, GAMEDVR_KEY, HIGH_PERF, ULTIMATE, createUltimatePlan, deletePowerScheme, dwordOf,
  dxFlagOn, listPowerSchemes, listProcesses, regDeleteValue, regQuery, regSetDword, regSetString, scanTemp, setDxFlag, setPowerScheme,
} from './windows';
import { applyFortniteMaxFps, restoreFortnite } from './fortniteFiles';
import { friendlyName, isClosable } from './processCatalog';

/** Original values captured BEFORE the first change. `null` = value did not exist (restore deletes it). */
export interface Backup {
  createdAt: number;
  autoGameModeEnabled?: number | null;
  allowAutoGameMode?: number | null;
  historicalCaptureEnabled?: number | null;
  powerSchemeGuid?: string;
  createdPowerSchemeGuid?: string;
  dxGlobalSettings?: string | null;
}

export const TITLES: Record<OptimizationId, string> = {
  'game-mode-on': 'Turn on Windows Game Mode',
  'power-plan-high': 'Switch to High Performance power plan',
  'background-recording-off': 'Turn off Xbox background recording',
  'close-background-apps': 'Close selected background apps',
  'clean-temp-files': 'Clean old temporary files',
  'fortnite-max-fps': 'Apply Max FPS settings to Fortnite',
  'windowed-optimizations-on': 'Turn on optimizations for windowed games',
};

export class Optimizer {
  constructor(
    private backup: JsonStore<Backup>,
    private log: JsonStore<{ entries: ChangeLogEntry[] }>,
    private fortniteBackupDir: string,
    private fortniteRunning: () => boolean,
  ) {}

  private addLog(action: string, detail: string) {
    const l = this.log.read();
    l.entries.unshift({ ts: Date.now(), action, detail });
    l.entries = l.entries.slice(0, 200);
    this.log.write(l);
  }
  changeLog() { return this.log.read().entries; }
  note(action: string, detail: string) { this.addLog(action, detail); }
  hasBackup() {
    const b = this.backup.readRaw();
    return (!!b && (b.autoGameModeEnabled !== undefined || b.historicalCaptureEnabled !== undefined || !!b.powerSchemeGuid || b.dxGlobalSettings !== undefined)) || fs.existsSync(fortniteBackupPath(this.fortniteBackupDir));
  }

  async apply(req: ApplyRequest): Promise<ApplyResult> {
    const b: Backup = this.backup.readRaw() ?? { createdAt: Date.now() };
    const results: ApplyItemResult[] = [];
    for (const id of req.ids) {
      const r = await this.applyOne(id, b, req.pids ?? []).catch((e) => ({ status: 'failed' as const, message: String(e) }));
      results.push({ id, title: TITLES[id], ...r });
      if (r.status === 'success') this.addLog(TITLES[id], r.message);
    }
    let backupSaved = false;
    try { this.backup.write(b); backupSaved = true; } catch { /* reported to UI */ }
    return { results, backupSaved };
  }

  private async applyOne(id: OptimizationId, b: Backup, pids: number[]): Promise<Omit<ApplyItemResult, 'id' | 'title'>> {
    if (!isWin && id !== 'close-background-apps') return { status: 'unavailable', message: 'Only available on Windows.' };
    switch (id) {
      case 'game-mode-on': {
        const cur = dwordOf(await regQuery(GAMEBAR_KEY, 'AutoGameModeEnabled'));
        if (cur === null || cur !== 0) return { status: 'skipped', message: 'Game Mode is already on.' };
        if (b.autoGameModeEnabled === undefined) b.autoGameModeEnabled = cur;
        if (b.allowAutoGameMode === undefined) b.allowAutoGameMode = dwordOf(await regQuery(GAMEBAR_KEY, 'AllowAutoGameMode'));
        const ok = (await regSetDword(GAMEBAR_KEY, 'AutoGameModeEnabled', 1)) && (await regSetDword(GAMEBAR_KEY, 'AllowAutoGameMode', 1));
        return ok ? { status: 'success', message: 'Game Mode enabled (Settings > Gaming > Game Mode).' } : { status: 'failed', message: 'Could not write the Game Mode setting.' };
      }
      case 'background-recording-off': {
        const cur = dwordOf(await regQuery(GAMEDVR_KEY, 'HistoricalCaptureEnabled'));
        if (cur !== 1) return { status: 'skipped', message: 'Background recording is already off.' };
        if (b.historicalCaptureEnabled === undefined) b.historicalCaptureEnabled = cur;
        const ok = await regSetDword(GAMEDVR_KEY, 'HistoricalCaptureEnabled', 0);
        return ok ? { status: 'success', message: '"Record what happened" turned off. Manual clips with Win+Alt+R still work.' } : { status: 'failed', message: 'Could not write the setting.' };
      }
      case 'power-plan-high': {
        const schemes = await listPowerSchemes();
        const active = schemes.find((s) => s.active);
        let target = schemes.find((s) => s.guid === b.createdPowerSchemeGuid) ?? schemes.find((s) => s.guid === ULTIMATE) ?? schemes.find((s) => s.guid === HIGH_PERF) ?? schemes.find((s) => /ultimate|high performance/i.test(s.name));
        if (active && target && active.guid === target.guid) return { status: 'skipped', message: `${target.name} is already active.` };
        if (!b.powerSchemeGuid && active) b.powerSchemeGuid = active.guid;
        if (!target) {
          const created = await createUltimatePlan();
          if (!created) return { status: 'unavailable', message: 'Windows did not allow creating a performance plan on this PC (common on laptops with Modern Standby). Set Settings > System > Power > Power mode to "Best performance" instead.' };
          b.createdPowerSchemeGuid = created;
          target = { guid: created, name: 'Ultimate Performance', active: false };
        }
        const ok = await setPowerScheme(target.guid);
        return ok ? { status: 'success', message: `Active power plan: ${target.name} (was ${active?.name ?? 'unknown'}).` } : { status: 'failed', message: 'powercfg could not change the plan.' };
      }
      case 'fortnite-max-fps': {
        if (this.fortniteRunning()) return { status: 'failed', message: 'Close Fortnite first: the game overwrites its settings file when it exits. Then apply again.' };
        const r = applyFortniteMaxFps(this.fortniteBackupDir);
        if (!r.ok) return { status: 'failed', message: r.message };
        return { status: r.changed.length ? 'success' : 'skipped', message: r.message };
      }
      case 'windowed-optimizations-on': {
        const cur = (await regQuery(DX_PREFS_KEY, DX_GLOBAL))?.data ?? null;
        if (dxFlagOn(cur, 'SwapEffectUpgradeEnable')) return { status: 'skipped', message: 'Already on.' };
        if (b.dxGlobalSettings === undefined) b.dxGlobalSettings = cur;
        const ok = await regSetString(DX_PREFS_KEY, DX_GLOBAL, setDxFlag(cur ?? '', 'SwapEffectUpgradeEnable', '1'));
        return ok ? { status: 'success', message: 'Windowed and borderless games now use the faster flip presentation model (Settings > Display > Graphics).' } : { status: 'failed', message: 'Could not write the setting.' };
      }
      case 'clean-temp-files': {
        const r = scanTemp(true);
        return { status: 'success', message: `Freed ${(r.freedBytes / 1048576).toFixed(0)} MB from ${r.files} old temp files (${r.skipped} in use were skipped). Not reversible: these were temporary files untouched for 24h+.` };
      }
      case 'close-background-apps': {
        if (pids.length === 0) return { status: 'skipped', message: 'No apps selected.' };
        const current = await listProcesses(false);
        const closed: string[] = []; const failed: string[] = [];
        for (const pid of pids) {
          const p = current.find((x) => x.pid === pid);
          if (!p || !isClosable(p.name)) { failed.push(`PID ${pid} (not a safe-to-close app)`); continue; }
          try { process.kill(pid); closed.push(friendlyName(p.name)); } catch { failed.push(friendlyName(p.name)); }
        }
        const uniq = [...new Set(closed)];
        if (closed.length === 0) return { status: 'failed', message: `Nothing closed. ${failed.join(', ')}` };
        return { status: 'success', message: `Closed: ${uniq.join(', ')}${failed.length ? `. Could not close: ${[...new Set(failed)].join(', ')}` : ''}. Re-open them any time.` };
      }
    }
  }

  async restore(): Promise<ApplyItemResult[]> {
    const b = this.backup.readRaw() ?? { createdAt: 0 };
    const out: ApplyItemResult[] = [];
    if (fs.existsSync(fortniteBackupPath(this.fortniteBackupDir))) {
      if (this.fortniteRunning()) out.push({ id: 'fortnite-max-fps', title: 'Fortnite settings', status: 'failed', message: 'Close Fortnite first, then restore again.' });
      else { const r = restoreFortnite(this.fortniteBackupDir)!; out.push({ id: 'fortnite-max-fps', title: 'Fortnite settings', status: r.ok ? 'success' : 'failed', message: r.message }); }
    }
    if (b.autoGameModeEnabled !== undefined) {
      const put = (name: string, v: number | null | undefined) => v === undefined ? Promise.resolve(true) : v === null ? regDeleteValue(GAMEBAR_KEY, name) : regSetDword(GAMEBAR_KEY, name, v);
      const ok = (await put('AutoGameModeEnabled', b.autoGameModeEnabled)) && (await put('AllowAutoGameMode', b.allowAutoGameMode));
      out.push({ id: 'game-mode-on', title: 'Game Mode', status: ok ? 'success' : 'failed', message: ok ? 'Restored original Game Mode setting.' : 'Could not restore Game Mode.' });
    }
    if (b.historicalCaptureEnabled !== undefined) {
      const ok = b.historicalCaptureEnabled === null ? await regDeleteValue(GAMEDVR_KEY, 'HistoricalCaptureEnabled') : await regSetDword(GAMEDVR_KEY, 'HistoricalCaptureEnabled', b.historicalCaptureEnabled);
      out.push({ id: 'background-recording-off', title: 'Background recording', status: ok ? 'success' : 'failed', message: ok ? 'Restored original background recording setting.' : 'Could not restore.' });
    }
    if (b.powerSchemeGuid) {
      const ok = await setPowerScheme(b.powerSchemeGuid) || await setPowerScheme(BALANCED);
      if (ok && b.createdPowerSchemeGuid) await deletePowerScheme(b.createdPowerSchemeGuid);
      out.push({ id: 'power-plan-high', title: 'Power plan', status: ok ? 'success' : 'failed', message: ok ? `Restored the original power plan${b.createdPowerSchemeGuid ? ' and removed the TWECD Ultimate plan' : ''}.` : 'Could not restore the power plan.' });
    }
    if (b.dxGlobalSettings !== undefined) {
      const ok = b.dxGlobalSettings === null ? await regDeleteValue(DX_PREFS_KEY, DX_GLOBAL) : await regSetString(DX_PREFS_KEY, DX_GLOBAL, b.dxGlobalSettings);
      out.push({ id: 'windowed-optimizations-on', title: 'Windowed game optimizations', status: ok ? 'success' : 'failed', message: ok ? 'Restored the original setting.' : 'Could not restore.' });
    }
    if (out.every((r) => r.status === 'success')) this.backup.remove();
    this.addLog('Restore defaults', out.map((r) => `${r.title}: ${r.status}`).join('; ') || 'Nothing to restore');
    return out;
  }
}
