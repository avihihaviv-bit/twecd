import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FortniteConfigReport } from '../../shared/types';
import { analyzeFortniteConfig, applyMaxFps, applyProfile, applyTuneStep, detectProfile, nextTuneStep, setFrameRateLimit, type TuneStep } from './fortniteConfig';
import type { FortniteProfileId } from '../../shared/types';

export function fortniteConfigPath(): string {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
}

/** Read-only. */
export function readFortniteConfig(): FortniteConfigReport {
  const p = fortniteConfigPath();
  try {
    const text = readText(p).text;
    return { ...analyzeFortniteConfig(text, p), profile: detectProfile(text) };
  } catch {
    return { found: false, path: p, settings: [], notes: ['Fortnite settings file not found. Launch Fortnite once (and change any video setting) so it is created.'] };
  }
}

export const FORTNITE_LAUNCH_URI = 'com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true';

// ---------- Write path (user-confirmed) ----------

function readText(p: string): { text: string; enc: 'utf8' | 'utf16le'; bom: boolean } {
  const buf = fs.readFileSync(p);
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le'), enc: 'utf16le', bom: true };
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString('utf8'), enc: 'utf8', bom: true };
  return { text: buf.toString('utf8'), enc: 'utf8', bom: false };
}

function writeText(p: string, text: string, enc: 'utf8' | 'utf16le', bom: boolean) {
  const body = Buffer.from(text, enc);
  const pre = !bom ? Buffer.alloc(0) : enc === 'utf16le' ? Buffer.from([0xff, 0xfe]) : Buffer.from([0xef, 0xbb, 0xbf]);
  const tmp = p + '.twecd-tmp';
  fs.writeFileSync(tmp, Buffer.concat([pre, body]));
  fs.renameSync(tmp, p);
}

export function fortniteBackupPath(backupDir: string) { return path.join(backupDir, 'GameUserSettings.original.ini'); }

/** Writes the Max-FPS profile. Keeps the FIRST original as backup so restore always returns the user's own settings. */
export function applyFortniteMaxFps(backupDir: string): { ok: boolean; message: string; changed: string[] } {
  const p = fortniteConfigPath();
  if (!fs.existsSync(p)) return { ok: false, message: 'Fortnite settings file not found. Start Fortnite once, then try again.', changed: [] };
  const src = readText(p);
  const { text, changed } = applyMaxFps(src.text);
  if (changed.length === 0) return { ok: true, message: 'Fortnite is already on the Max FPS settings.', changed };
  fs.mkdirSync(backupDir, { recursive: true });
  const bak = fortniteBackupPath(backupDir);
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
  try { writeText(p, text, src.enc, src.bom); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, message: code === 'EPERM' || code === 'EACCES' ? 'The settings file is read-only. Right-click GameUserSettings.ini > Properties, untick "Read-only", then try again.' : `Could not write the settings file (${code ?? e}).`, changed: [] };
  }
  return { ok: true, message: `Changed: ${changed.join(', ')}. Start Fortnite to use them.`, changed };
}

export function restoreFortnite(backupDir: string): { ok: boolean; message: string } | null {
  const bak = fortniteBackupPath(backupDir);
  if (!fs.existsSync(bak)) return null;
  try { fs.copyFileSync(bak, fortniteConfigPath()); fs.unlinkSync(bak); return { ok: true, message: 'Your original Fortnite settings are back.' }; }
  catch (e) { return { ok: false, message: `Could not restore Fortnite settings (${(e as NodeJS.ErrnoException).code ?? e}).` }; }
}

/** Writes a Stable FPS Lock (0 = unlimited). Same backup rule: the first original is kept. */
export function applyFortniteCap(backupDir: string, cap: number): { ok: boolean; message: string } {
  const p = fortniteConfigPath();
  if (!fs.existsSync(p)) return { ok: false, message: 'Fortnite settings file not found. Start Fortnite once, then try again.' };
  const src = readText(p);
  fs.mkdirSync(backupDir, { recursive: true });
  const bak = fortniteBackupPath(backupDir);
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
  try { writeText(p, setFrameRateLimit(src.text, cap), src.enc, src.bom); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, message: code === 'EPERM' || code === 'EACCES' ? 'The settings file is read-only. Right-click GameUserSettings.ini > Properties, untick "Read-only", then try again.' : `Could not write the settings file (${code ?? e}).` };
  }
  return { ok: true, message: cap === 0 ? 'FPS lock removed: Fortnite runs unlimited.' : `FPS locked at ${cap}. Start Fortnite to play with it.` };
}

export function currentProfile(): FortniteProfileId | null { try { return detectProfile(readText(fortniteConfigPath()).text); } catch { return null; } }
export function isDx12(): boolean { try { return /dx12/i.test(readText(fortniteConfigPath()).text.match(/PreferredRHI=(\w+)/i)?.[1] ?? ''); } catch { return false; } }

export function applyFortniteProfile(backupDir: string, id: FortniteProfileId, cap?: number): { ok: boolean; message: string; changed: string[] } {
  const p = fortniteConfigPath();
  if (!fs.existsSync(p)) return { ok: false, message: 'Fortnite settings file not found. Start Fortnite once, then try again.', changed: [] };
  const src = readText(p);
  let res: { text: string; changed: string[] };
  try { res = applyProfile(src.text, id, cap); } catch (e) { return { ok: false, message: (e as Error).message, changed: [] }; }
  if (res.changed.length === 0) return { ok: true, message: 'Fortnite already uses this profile.', changed: [] };
  fs.mkdirSync(backupDir, { recursive: true });
  const bak = fortniteBackupPath(backupDir);
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
  try { writeText(p, res.text, src.enc, src.bom); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { ok: false, message: code === 'EPERM' || code === 'EACCES' ? 'The settings file is read-only. Right-click GameUserSettings.ini > Properties, untick "Read-only", then try again.' : `Could not write the settings file (${code ?? e}).`, changed: [] };
  }
  return { ok: true, message: `Changed: ${[...new Set(res.changed)].join(', ')}. Start Fortnite to use it.`, changed: res.changed };
}

export function previewTune(kind: string): TuneStep | null { try { return nextTuneStep(readText(fortniteConfigPath()).text, kind); } catch { return null; } }

export function applyTune(backupDir: string, kind: string): { ok: boolean; message: string; step: TuneStep | null } {
  const p = fortniteConfigPath();
  if (!fs.existsSync(p)) return { ok: false, message: 'Fortnite settings file not found.', step: null };
  const src = readText(p);
  const step = nextTuneStep(src.text, kind);
  if (!step) return { ok: false, message: kind === 'gpu' ? 'Already at the lowest sensible GPU settings (3D Resolution 70%, Textures Low).' : 'No CPU-side setting left to lower: the limit is now the CPU/memory itself (check XMP in the BIOS Guide).', step: null };
  fs.mkdirSync(backupDir, { recursive: true });
  const bak = fortniteBackupPath(backupDir);
  if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
  try { writeText(p, applyTuneStep(src.text, step).text, src.enc, src.bom); } catch (e) { return { ok: false, message: `Could not write the settings file (${(e as NodeJS.ErrnoException).code ?? e}).`, step: null }; }
  return { ok: true, message: `${step.label} applied. Play the same scenario and benchmark to see if it helped.`, step };
}
