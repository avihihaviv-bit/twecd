import type { ApplyItemResult, ApplyRequest, ApplyResult, ChangeLogEntry, OptimizationId } from '../../shared/types';
import { isWin } from './exec';
import { JsonStore } from './store';
import {
  BALANCED, GAMEBAR_KEY, GAMEDVR_KEY, HIGH_PERF, ULTIMATE, dwordOf, listPowerSchemes, listProcesses, regDeleteValue,
  regQuery, regSetDword, scanTemp, setPowerScheme,
} from './windows';
import { friendlyName, isClosable } from './processCatalog';

/** Original values captured BEFORE the first change. `null` = value did not exist (restore deletes it). */
export interface Backup {
  createdAt: number;
  autoGameModeEnabled?: number | null;
  allowAutoGameMode?: number | null;
  historicalCaptureEnabled?: number | null;
  powerSchemeGuid?: string;
}

export const TITLES: Record<OptimizationId, string> = {
  'game-mode-on': 'Turn on Windows Game Mode',
  'power-plan-high': 'Switch to High Performance power plan',
  'background-recording-off': 'Turn off Xbox background recording',
  'close-background-apps': 'Close selected background apps',
  'clean-temp-files': 'Clean old temporary files',
};

export class Optimizer {
  constructor(private backup: JsonStore<Backup>, private log: JsonStore<{ entries: ChangeLogEntry[] }>) {}

  private addLog(action: string, detail: string) {
    const l = this.log.read();
    l.entries.unshift({ ts: Date.now(), action, detail });
    l.entries = l.entries.slice(0, 200);
    this.log.write(l);
  }
  changeLog() { return this.log.read().entries; }
  hasBackup() { const b = this.backup.readRaw(); return !!b && (b.autoGameModeEnabled !== undefined || b.historicalCaptureEnabled !== undefined || !!b.powerSchemeGuid); }

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
        const target = schemes.find((s) => s.guid === ULTIMATE) ?? schemes.find((s) => s.guid === HIGH_PERF);
        if (!target) return { status: 'unavailable', message: 'No High/Ultimate Performance plan exists on this PC (common on Windows 11). Balanced is fine on a desktop; set "Best performance" in Settings > System > Power instead.' };
        if (active?.guid === target.guid) return { status: 'skipped', message: `${target.name} is already active.` };
        if (!b.powerSchemeGuid && active) b.powerSchemeGuid = active.guid;
        const ok = await setPowerScheme(target.guid);
        return ok ? { status: 'success', message: `Active power plan: ${target.name} (was ${active?.name ?? 'unknown'}).` } : { status: 'failed', message: 'powercfg could not change the plan.' };
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
    const b = this.backup.readRaw();
    const out: ApplyItemResult[] = [];
    if (!b) return out;
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
      out.push({ id: 'power-plan-high', title: 'Power plan', status: ok ? 'success' : 'failed', message: ok ? 'Restored the original power plan.' : 'Could not restore the power plan.' });
    }
    if (out.every((r) => r.status === 'success')) this.backup.remove();
    this.addLog('Restore defaults', out.map((r) => `${r.title}: ${r.status}`).join('; ') || 'Nothing to restore');
    return out;
  }
}
