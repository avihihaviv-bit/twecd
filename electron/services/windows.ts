import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWin, run } from './exec';
import type { ProcessInfo } from '../../shared/types';
import { categorize } from './processCatalog';

// ---------- Registry (HKCU only for writes; HKLM read-only) ----------
export interface RegValue { type: string; data: string }

export async function regQuery(key: string, value: string): Promise<RegValue | null> {
  if (!isWin) return null;
  const r = await run('reg', ['query', key, '/v', value]);
  if (r.code !== 0) return null;
  return parseRegQuery(r.stdout, value);
}

/** Parses `reg query /v` output. Value names may contain spaces (e.g. "Update Revision"). */
export function parseRegQuery(stdout: string, value: string): RegValue | null {
  const want = value.toLowerCase();
  for (const raw of stdout.split(/\r?\n/)) {
    const m = raw.trim().match(/^(.+?)\s+(REG_[A-Z_]+)\s*(.*)$/);
    if (m && m[1].toLowerCase() === want) return { type: m[2], data: m[3].trim() };
  }
  return null;
}

export const dwordOf = (v: RegValue | null): number | null => (v ? parseInt(v.data, v.data.startsWith('0x') ? 16 : 10) : null);

export async function regSetDword(key: string, value: string, data: number): Promise<boolean> {
  if (!isWin || !key.startsWith('HKCU\\')) return false;
  const r = await run('reg', ['add', key, '/v', value, '/t', 'REG_DWORD', '/d', String(data), '/f']);
  return r.code === 0;
}

export async function regDeleteValue(key: string, value: string): Promise<boolean> {
  if (!isWin || !key.startsWith('HKCU\\')) return false;
  const r = await run('reg', ['delete', key, '/v', value, '/f']);
  return r.code === 0;
}

export async function regListValues(key: string): Promise<{ name: string; data: string }[]> {
  if (!isWin) return [];
  const r = await run('reg', ['query', key]);
  if (r.code !== 0) return [];
  return r.stdout.split(/\r?\n/).map((l) => l.match(/^\s{4}(.+?)\s{4}(REG_\w+)\s{4}(.*)$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => ({ name: m[1], data: m[3] }));
}

// ---------- Game Mode / Game Bar ----------
export const GAMEBAR_KEY = 'HKCU\\Software\\Microsoft\\GameBar';
export const GAMEDVR_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR';

export async function getGameMode(): Promise<{ enabled: boolean | null; raw: number | null }> {
  if (!isWin) return { enabled: null, raw: null };
  const v = dwordOf(await regQuery(GAMEBAR_KEY, 'AutoGameModeEnabled'));
  // Absent value = Windows 11 default, which is ON.
  return { enabled: v === null ? true : v !== 0, raw: v };
}

export async function getBackgroundRecording(): Promise<{ enabled: boolean | null; raw: number | null }> {
  if (!isWin) return { enabled: null, raw: null };
  const v = dwordOf(await regQuery(GAMEDVR_KEY, 'HistoricalCaptureEnabled'));
  return { enabled: v === 1, raw: v };
}

export async function getHags(): Promise<boolean | null> {
  const v = dwordOf(await regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode'));
  return v === null ? null : v === 2;
}

// ---------- Power plans ----------
export const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
export const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
export const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';

export interface PowerScheme { guid: string; name: string; active: boolean }

export async function listPowerSchemes(): Promise<PowerScheme[]> {
  if (!isWin) return [];
  const r = await run('powercfg', ['/list']);
  if (r.code !== 0) return [];
  return r.stdout.split(/\r?\n/).map((l) => l.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\((.*?)\)\s*(\*)?/i))
    .filter((m): m is RegExpMatchArray => !!m).map((m) => ({ guid: m[1].toLowerCase(), name: m[2], active: !!m[3] }));
}

export async function setPowerScheme(guid: string): Promise<boolean> {
  if (!isWin || !/^[0-9a-f-]{36}$/i.test(guid)) return false;
  return (await run('powercfg', ['/setactive', guid])).code === 0;
}

// ---------- Admin ----------
export async function isAdmin(): Promise<boolean> {
  if (!isWin) return process.getuid?.() === 0;
  return (await run('net', ['session'], 5000)).code === 0;
}

// ---------- Processes ----------
export async function listProcesses(withCpu: boolean): Promise<ProcessInfo[]> {
  if (isWin) {
    if (!withCpu) {
      const r = await run('tasklist', ['/fo', 'csv', '/nh']);
      return parseTasklist(r.stdout);
    }
    const ps = 'Get-Process | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$([math]::Round($_.TotalProcessorTime.TotalMilliseconds))|$($_.WorkingSet64)" }';
    const snap = async () => { const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], 20000); return { r, t: Date.now() }; };
    const a = await snap();
    await new Promise((res) => setTimeout(res, 1000));
    const b = await snap();
    const prev = new Map<number, number>();
    for (const l of a.r.stdout.split(/\r?\n/)) { const p = l.split('|'); if (p.length === 4) prev.set(+p[0], +p[2]); }
    const cores = os.cpus().length;
    const dt = b.t - a.t;
    return b.r.stdout.split(/\r?\n/).map((l) => l.trim().split('|')).filter((p) => p.length === 4 && +p[0] > 0).map((p) => {
      const pid = +p[0]; const name = p[1] + '.exe'; const cpuMs = +p[2];
      const before = prev.get(pid);
      return { pid, name, memMB: +p[3] / 1048576, cpuPercent: before === undefined ? null : Math.max(0, ((cpuMs - before) / dt / cores) * 100), category: categorize(name) };
    });
  }
  // Linux/macOS (development): ps
  const r = await run('ps', ['-eo', 'pid=,rss=,pcpu=,comm=']);
  return r.stdout.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/)).filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: +m[1], name: m[4], memMB: +m[2] / 1024, cpuPercent: +m[3], category: categorize(m[4]) }));
}

export function parseTasklist(csv: string): ProcessInfo[] {
  return csv.split(/\r?\n/).map((l) => l.match(/^"([^"]*)","(\d+)","[^"]*","[^"]*","([^"]*)"/)).filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: +m[2], name: m[1], memMB: (parseInt(m[3].replace(/\D/g, ''), 10) || 0) / 1024, cpuPercent: null, category: categorize(m[1]) }));
}

// ---------- Startup apps (read-only) ----------
export async function listStartupApps(): Promise<{ name: string; scope: 'user' | 'machine' }[]> {
  const user = await regListValues('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
  const machine = await regListValues('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
  return [...user.map((v) => ({ name: v.name, scope: 'user' as const })), ...machine.map((v) => ({ name: v.name, scope: 'machine' as const }))];
}

// ---------- Temporary files ----------
const TEMP_MIN_AGE_MS = 24 * 3600 * 1000; // only files untouched for 24h+

export function tempDir(): string { return os.tmpdir(); }

/** Measures (and optionally deletes) entries in the user's TEMP folder older than 24 hours. Locked files are skipped. */
export function scanTemp(remove: boolean, limit = 60000): { files: number; bytes: number; freedBytes: number; skipped: number } {
  const root = tempDir();
  const now = Date.now();
  let files = 0, bytes = 0, freed = 0, skipped = 0, visited = 0;
  const walk = (dir: string, top: boolean): boolean => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    let allRemoved = true;
    for (const e of entries) {
      if (++visited > limit) return false;
      const p = path.join(dir, e.name);
      try {
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink()) { allRemoved = false; continue; }
        if (st.isDirectory()) {
          const childGone = walk(p, false);
          if (remove && childGone && now - st.mtimeMs > TEMP_MIN_AGE_MS) { try { fs.rmdirSync(p); } catch { allRemoved = false; } } else allRemoved = false;
          continue;
        }
        if (now - st.mtimeMs < TEMP_MIN_AGE_MS) { allRemoved = false; continue; }
        files++; bytes += st.size;
        if (remove) { try { fs.unlinkSync(p); freed += st.size; } catch { skipped++; allRemoved = false; } } else allRemoved = false;
      } catch { allRemoved = false; }
    }
    return top ? false : allRemoved;
  };
  walk(root, true);
  return { files, bytes, freedBytes: freed, skipped };
}

// ---------- Wi-Fi signal ----------
export async function wifiSignal(): Promise<number | null> {
  if (!isWin) return null;
  const r = await run('netsh', ['wlan', 'show', 'interfaces'], 8000);
  const m = r.stdout.match(/:\s*(\d{1,3})\s*%/);
  return m ? Math.min(100, +m[1]) : null;
}

export async function regSetString(key: string, value: string, data: string): Promise<boolean> {
  if (!isWin || !key.startsWith('HKCU\\')) return false;
  return (await run('reg', ['add', key, '/v', value, '/t', 'REG_SZ', '/d', data, '/f'])).code === 0;
}

/** Creates a copy of the built-in Ultimate Performance plan (desktops). Returns the new plan's GUID. */
export async function createUltimatePlan(): Promise<string | null> {
  if (!isWin) return null;
  const r = await run('powercfg', ['-duplicatescheme', ULTIMATE]);
  const m = r.stdout.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return r.code === 0 && m ? m[1].toLowerCase() : null;
}

export async function deletePowerScheme(guid: string): Promise<boolean> {
  if (!isWin || !/^[0-9a-f-]{36}$/i.test(guid)) return false;
  return (await run('powercfg', ['-delete', guid])).code === 0;
}

// ---------- Windows 11 "Optimizations for windowed games" ----------
export const DX_PREFS_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
export const DX_GLOBAL = 'DirectXUserGlobalSettings';

/** Sets one key=value; pair inside the semicolon list, keeping all other pairs. */
export function setDxFlag(current: string, flag: string, value: string): string {
  const parts = current.split(';').map((s) => s.trim()).filter(Boolean).filter((p) => !p.toLowerCase().startsWith(flag.toLowerCase() + '='));
  parts.push(`${flag}=${value}`);
  return parts.join(';') + ';';
}
export const dxFlagOn = (current: string | null, flag: string) => !!current && new RegExp(`(^|;)\\s*${flag}=1\\s*(;|$)`, 'i').test(current);

// ---------- Generic reversible registry tweaks ----------
/** Delivery Optimization per-machine setting (the same value Settings > Windows Update > Delivery Optimization writes). */
export const DO_KEY = 'HKU\\S-1-5-20\\Software\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Settings';
export type RegType = 'REG_DWORD' | 'REG_SZ' | 'REG_BINARY';
export interface RegSnapshot { type: RegType; data: string }

/** HKLM writes are allowed only for these exact keys (and only when running as administrator). */
const HKLM_WRITABLE = ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', DO_KEY];

export const canWriteKey = (key: string) => key.startsWith('HKCU\\') || HKLM_WRITABLE.includes(key);

export async function regRead(key: string, name: string): Promise<RegSnapshot | null> {
  const v = await regQuery(key, name);
  if (!v) return null;
  const type = (['REG_DWORD', 'REG_SZ', 'REG_BINARY'] as RegType[]).find((t) => t === v.type);
  if (!type) return null;
  return { type, data: type === 'REG_DWORD' ? String(dwordOf(v)) : v.data };
}

export async function regWrite(key: string, name: string, type: RegType, data: string): Promise<boolean> {
  if (!isWin || !canWriteKey(key)) return false;
  return (await run('reg', ['add', key, '/v', name, '/t', type, '/d', data, '/f'])).code === 0;
}

export async function regRemove(key: string, name: string): Promise<boolean> {
  if (!isWin || !canWriteKey(key)) return false;
  const r = await run('reg', ['delete', key, '/v', name, '/f']);
  return r.code === 0 || !(await regQuery(key, name));
}

export const sameValue = (cur: RegSnapshot | null, type: RegType, data: string) =>
  !!cur && cur.type === type && (type === 'REG_BINARY' ? cur.data.toUpperCase().startsWith(data.toUpperCase()) : cur.data.toLowerCase() === data.toLowerCase());

// ---------- Startup apps (HKCU only; disabled the same way Task Manager does) ----------
export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const STARTUP_APPROVED = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
export const STARTUP_DISABLED = '030000000000000000000000';

/** Startup entries that must never be offered for disabling (security, audio/graphics drivers, anti-cheat, input). */
export const isEssentialStartup = (name: string, cmd = '') => /^nv|\\nvidia|security|defender|windows|realtek|rtk|audio|nvidia|nvcontainer|intel|igfx|amd|radeon|easyanticheat|battleye|synaptics|elan|touchpad|bluetooth|wacom/i.test(`${name} ${cmd}`);

export interface StartupEntry { name: string; command: string; enabled: boolean; essential: boolean }

export async function listUserStartup(): Promise<StartupEntry[]> {
  if (!isWin) return [];
  const runVals = await regListValues(RUN_KEY);
  const approved = await regListValues(STARTUP_APPROVED);
  return runVals.map((r) => {
    const a = approved.find((x) => x.name === r.name);
    const first = a ? parseInt(a.data.slice(0, 2), 16) : 2;
    return { name: r.name, command: r.data, enabled: !(first % 2 === 1), essential: isEssentialStartup(r.name, r.data) };
  });
}

// ---------- Fortnite executable (for per-app GPU preference) ----------
/** Finds Fortnite's install folder from Epic Games Launcher manifests (JSON .item files). */
export function parseEpicManifest(json: string): string | null {
  try {
    const m = JSON.parse(json);
    if (m.AppName === 'Fortnite' || /^fortnite$/i.test(m.DisplayName ?? '')) return m.InstallLocation ?? null;
  } catch { /* not a manifest */ }
  return null;
}

export function fortniteExePath(): string | null {
  if (!isWin) return null;
  const dir = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.item'))) {
      const loc = parseEpicManifest(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!loc) continue;
      const exe = path.join(loc, 'FortniteGame', 'Binaries', 'Win64', 'FortniteClient-Win64-Shipping.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch { /* launcher not installed */ }
  return null;
}

// ---------- System Restore point ----------
export async function createRestorePoint(): Promise<{ ok: boolean; message: string }> {
  if (!isWin) return { ok: false, message: 'Windows only.' };
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    "try { Checkpoint-Computer -Description 'TWECD before optimization' -RestorePointType MODIFY_SETTINGS -WarningAction Stop -ErrorAction Stop; 'OK' } catch { 'ERR: ' + $_.Exception.Message }"], 120000);
  const out = r.stdout.trim();
  if (out === 'OK') return { ok: true, message: 'System Restore point created.' };
  if (/1440|frequency|24 hours/i.test(out)) return { ok: true, message: 'A restore point was already created in the last 24 hours (Windows allows one per day); using that one.' };
  if (/disabled|not enabled|service/i.test(out)) return { ok: false, message: 'System Protection is turned off on drive C:, so Windows cannot create restore points. TWECD\'s own backup is still saved.' };
  return { ok: false, message: `Restore point not created (${out.replace(/^ERR: /, '').slice(0, 140) || 'requires administrator'}). TWECD's own backup is still saved.` };
}

// ---------- Power throttling (EcoQoS) exception for Fortnite ----------
/** Windows can move background-like threads to E-cores at low clocks; an exception keeps Fortnite exempt. */
export async function powerThrottlingExempt(exe: string): Promise<boolean | null> {
  if (!isWin) return null;
  const r = await run('powercfg', ['/powerthrottling', 'list'], 10000);
  if (r.code !== 0) return null;
  return r.stdout.toLowerCase().includes(exe.toLowerCase());
}
export async function setPowerThrottling(exe: string, disable: boolean): Promise<boolean> {
  if (!isWin) return false;
  return (await run('powercfg', ['/powerthrottling', disable ? 'disable' : 'reset', '/path', exe], 10000)).code === 0;
}

// ---------- Network adapter ----------
export interface AdapterInfo { name: string; description: string; linkSpeed: string; driverVersion: string | null; driverDate: string | null; power: { name: string; value: string }[] }
export function parseAdapters(json: string): AdapterInfo[] {
  try {
    const o = JSON.parse(json); const arr = Array.isArray(o) ? o : o ? [o] : [];
    return arr.map((a: any) => ({ name: a.Name, description: a.InterfaceDescription, linkSpeed: a.LinkSpeed, driverVersion: a.DriverVersion ?? null, driverDate: a.DriverDate ?? null, power: (Array.isArray(a.Power) ? a.Power : a.Power ? [a.Power] : []).map((p: any) => ({ name: p.DisplayName, value: p.DisplayValue })) }));
  } catch { return []; }
}
export async function networkAdapters(): Promise<AdapterInfo[]> {
  if (!isWin) return [];
  const ps = `$ErrorActionPreference='SilentlyContinue'; @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { $n=$_.Name; [pscustomobject]@{ Name=$n; InterfaceDescription=$_.InterfaceDescription; LinkSpeed=$_.LinkSpeed; DriverVersion=$_.DriverVersion; DriverDate=$_.DriverDate; Power=@(Get-NetAdapterAdvancedProperty -Name $n | Where-Object { $_.DisplayName -match 'Energy|Green|Power Saving|Idle Power|Interrupt Moderation|Flow Control' } | Select-Object DisplayName, DisplayValue) } }) | ConvertTo-Json -Depth 4 -Compress`;
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], 20000);
  return parseAdapters(r.stdout.trim());
}

// ---------- Security trade-offs (read-only; the user decides and toggles them in Windows Security) ----------
export interface VbsState { memoryIntegrity: boolean | null; vbsRunning: boolean | null }
export function parseVbs(json: string): VbsState {
  try {
    const o = JSON.parse(json);
    const vbs = typeof o.vbs === 'number' ? o.vbs === 2 : null;
    const hvci = Array.isArray(o.running) ? o.running.includes(2) : typeof o.running === 'number' ? o.running === 2 : null;
    const reg = typeof o.hvciReg === 'number' ? o.hvciReg === 1 : null;
    return { memoryIntegrity: hvci ?? reg, vbsRunning: vbs };
  } catch { return { memoryIntegrity: null, vbsRunning: null }; }
}
export async function vbsState(): Promise<VbsState> {
  if (!isWin) return { memoryIntegrity: null, vbsRunning: null };
  const ps = `$ErrorActionPreference='SilentlyContinue'; $d = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard; $r = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity').Enabled; [pscustomobject]@{ vbs = $d.VirtualizationBasedSecurityStatus; running = @($d.SecurityServicesRunning); hvciReg = $r } | ConvertTo-Json -Compress`;
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], 15000);
  return parseVbs(r.stdout.trim());
}

// ---------- Power-plan sub-settings (applied to the active plan, reversible) ----------
export const PC_USB = { sub: '2a737441-1930-4402-8d77-b2bebba308a3', setting: '48e6b7a6-50f5-4782-a5d4-53bb8f07e226' }; // USB selective suspend
export const PC_ASPM = { sub: '501a4d13-42af-4429-9fd1-a8218c268e20', setting: 'ee12f906-d277-404b-b6da-e5fa1a576df5' }; // PCIe Link State Power Management

export function parsePowerIndex(stdout: string): number | null {
  const m = stdout.match(/Current AC Power Setting Index:\s*0x([0-9a-f]+)/i) ?? stdout.match(/AC[^:\r\n]*:\s*0x([0-9a-f]+)/i);
  return m ? parseInt(m[1], 16) : null;
}
export async function activeSchemeGuid(): Promise<string | null> {
  if (!isWin) return null;
  const r = await run('powercfg', ['/getactivescheme']);
  return r.stdout.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1].toLowerCase() ?? null;
}
export async function getPowerIndex(scheme: string, s: { sub: string; setting: string }): Promise<number | null> {
  if (!isWin) return null;
  return parsePowerIndex((await run('powercfg', ['/query', scheme, s.sub, s.setting])).stdout);
}
export async function setPowerIndex(scheme: string, s: { sub: string; setting: string }, v: number): Promise<boolean> {
  if (!isWin || !/^[0-9a-f-]{36}$/i.test(scheme)) return false;
  const ok = (await run('powercfg', ['/setacvalueindex', scheme, s.sub, s.setting, String(v)])).code === 0;
  await run('powercfg', ['/setactive', scheme]);
  return ok;
}

// ---------- Overlays and background recorders that cost FPS ----------
const OVERLAYS: Record<string, string> = {
  'medal.exe': 'Medal: background clip recording encodes video while you play',
  'medalencoder.exe': 'Medal encoder: records gameplay in the background',
  'nvidia overlay.exe': 'NVIDIA Overlay: turn off Instant Replay in the NVIDIA App if you don\'t use it',
  'discord.exe': 'Discord: turn off its in-game overlay (Settings > Game Overlay) and Hardware Acceleration if FPS dips',
  'wallpaper64.exe': 'Wallpaper Engine: uses the GPU; set it to pause when a game is fullscreen',
  'lively.exe': 'Lively Wallpaper: uses the GPU; set it to pause in fullscreen',
  'obs64.exe': 'OBS: replay buffer/recording encodes video continuously',
  'xboxgamebar.exe': 'Xbox Game Bar is open in the background',
  'gamebar.exe': 'Xbox Game Bar is open in the background',
};
export function findOverlays(procs: { name: string }[]): { name: string; advice: string }[] {
  const seen = new Set<string>(); const out: { name: string; advice: string }[] = [];
  for (const p of procs) { const k = p.name.toLowerCase(); if (OVERLAYS[k] && !seen.has(k)) { seen.add(k); out.push({ name: p.name, advice: OVERLAYS[k] }); } }
  return out;
}
