import type { DisplayInfo, StaticInfo } from '../../shared/types';
import { isWin, run } from './exec';
import { regQuery } from './windows';

export interface MemModule { sizeMB: number; speedMHz: number | null; ratedMHz: number | null; type: string | null; slot: string | null }
export interface WinProbe { display: DisplayInfo | null; modules: MemModule[]; biosVendor: string | null; biosVersion: string | null; biosDate: string | null; board: string | null; boardRevision?: string | null }

// One PowerShell process at startup (not polled). Uses non-localized CIM classes.
const SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$v = Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentRefreshRate -gt 0 } | Sort-Object { if ($_.Name -match 'NVIDIA') {0} else {1} } | Select-Object -First 1
$max = $null
try { $max = (Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorListedSupportedSourceModes -ErrorAction Stop | ForEach-Object { $_.MonitorSourceModes } | ForEach-Object { if ($_.VerticalRefreshRateDenominator -gt 0) { [math]::Round($_.VerticalRefreshRateNumerator / $_.VerticalRefreshRateDenominator, 1) } } | Measure-Object -Maximum).Maximum } catch {}
$mem = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { [pscustomobject]@{ cap=[int64]$_.Capacity; speed=$_.Speed; conf=$_.ConfiguredClockSpeed; type=$_.SMBIOSMemoryType; bank=$_.BankLabel; loc=$_.DeviceLocator } })
$b = Get-CimInstance Win32_BIOS | Select-Object -First 1
$bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
[pscustomobject]@{
  disp = if ($v) { [pscustomobject]@{ name=$v.Name; hz=$v.CurrentRefreshRate; maxReported=$v.MaxRefreshRate; w=$v.CurrentHorizontalResolution; h=$v.CurrentVerticalResolution; maxModes=$max } } else { $null }
  mem = $mem
  bios = if ($b) { [pscustomobject]@{ vendor=$b.Manufacturer; ver=$b.SMBIOSBIOSVersion; date=if ($b.ReleaseDate) { $b.ReleaseDate.ToString('yyyy-MM-dd') } else { $null } } } else { $null }
  board = if ($bb) { ($bb.Manufacturer + ' ' + $bb.Product).Trim() } else { $null }
  boardRev = if ($bb) { $bb.Version } else { $null }
} | ConvertTo-Json -Depth 4 -Compress
`;

const MEM_TYPES: Record<number, string> = { 26: 'DDR4', 34: 'DDR5', 24: 'DDR3' };

export function parseProbe(json: string): WinProbe | null {
  let o: any;
  try { o = JSON.parse(json); } catch { return null; }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const d = o.disp;
  const maxModes = num(d?.maxModes);
  const display: DisplayInfo | null = d ? {
    name: d.name ?? null, currentHz: num(d.hz), maxHz: maxModes ?? (num(d.maxReported) && num(d.maxReported)! < 1000 ? num(d.maxReported) : null),
    width: num(d.w), height: num(d.h),
  } : null;
  const memArr = Array.isArray(o.mem) ? o.mem : o.mem ? [o.mem] : [];
  const modules: MemModule[] = memArr.filter((m: any) => num(m.cap)).map((m: any) => ({
    sizeMB: Math.round(m.cap / 1048576), speedMHz: num(m.conf) ?? num(m.speed), ratedMHz: num(m.speed),
    type: MEM_TYPES[m.type] ?? null, slot: [m.loc, m.bank].filter(Boolean).join(' / ') || null,
  }));
  return { display, modules, biosVendor: o.bios?.vendor ?? null, biosVersion: o.bios?.ver ?? null, biosDate: o.bios?.date ?? null, board: o.board ?? null, boardRevision: typeof o.boardRev === 'string' && o.boardRev.trim() && !/default string|to be filled/i.test(o.boardRev) ? o.boardRev.trim() : null };
}

/** Channel layout from slot names such as "ChannelA-DIMM1", "DIMM_B2", "A2". */
export function channelLayout(modules: MemModule[]): { hint: 'single' | 'dual-or-more' | null; evidence: string } {
  if (modules.length === 0) return { hint: null, evidence: 'Memory module information unavailable.' };
  if (modules.length === 1) return modules[0].slot
    ? { hint: 'single', evidence: `Only one memory module detected (${modules[0].slot}), so memory runs in single channel.` }
    : { hint: null, evidence: 'One memory module reported without slot information (common in virtual machines); channel layout cannot be confirmed.' };
  const letters = modules.map((m) => m.slot?.match(/channel\s*([a-d])/i)?.[1] ?? m.slot?.match(/(?:dimm|slot)?[_\s-]?([a-d])\d\b/i)?.[1] ?? null);
  if (letters.every((l) => l)) {
    const uniq = new Set(letters.map((l) => l!.toUpperCase()));
    if (uniq.size >= 2) return { hint: 'dual-or-more', evidence: `${modules.length} modules on channels ${[...uniq].join(' + ')} (${modules.map((m) => m.slot).join(', ')}).` };
    return { hint: 'single', evidence: `${modules.length} modules, but all on channel ${[...uniq][0]} (${modules.map((m) => m.slot).join(', ')}). Move one stick to the other channel (usually slots A2 + B2, see your motherboard manual).` };
  }
  return { hint: 'dual-or-more', evidence: `${modules.length} modules detected; slot names don't identify channels, so dual channel is likely but not confirmed.` };
}

/** "Update Revision" REG_BINARY, e.g. "000000002B010000" -> 0x12B */
export function parseMicrocode(hex: string | null): number | null {
  if (!hex) return null;
  const h = hex.replace(/[^0-9a-f]/gi, '');
  if (h.length < 16) return null;
  const b = (i: number) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
  const v = (b(4) | (b(5) << 8) | (b(6) << 16) | (b(7) << 24)) >>> 0;
  return v || null;
}

export async function probeWindows(): Promise<(WinProbe & { microcode: number | null }) | null> {
  if (!isWin) return null;
  const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], 25000);
  const p = parseProbe(r.stdout.trim());
  const mc = parseMicrocode((await regQuery('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'Update Revision'))?.data ?? null);
  return p ? { ...p, microcode: mc } : { display: null, modules: [], biosVendor: null, biosVersion: null, biosDate: null, board: null, microcode: mc };
}

/** Intel 13th/14th gen: microcode 0x12B (Sept 2024) or later addresses the Vmin shift instability. */
export const INTEL_SAFE_MICROCODE = 0x12b;
export const isRaptorLake = (model: string) => /i[3579]-1[34]\d{3}/i.test(model);

export type { StaticInfo };
