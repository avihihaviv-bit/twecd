import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type { MemCounters } from '../../shared/types';
import { isWin } from './exec';

// One long-lived PowerShell loop reading non-localized CIM performance classes every 2 s.
// Runs only while the window is visible (stopped during gameplay to keep TWECD light).
const LOOP = `
$ErrorActionPreference='SilentlyContinue'
while ($true) {
  $p = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
  $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $f = Get-CimInstance Win32_PerfFormattedData_PerfOS_PagingFile -Filter "Name='_Total'"
  [Console]::Out.WriteLine(('{0}|{1}|{2}|{3}|{4}' -f $p.PercentProcessorPerformance, $m.PagesPersec, $m.PageReadsPersec, $m.PercentCommittedBytesInUse, $f.PercentUsage))
  [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}`;

export function parseAgentLine(line: string): { perfPct: number | null; mem: MemCounters } | null {
  const p = line.trim().split('|');
  if (p.length !== 5) return null;
  const n = (s: string) => { if (s === '') return null; const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
  return { perfPct: n(p[0]), mem: { pagesPerSec: n(p[1]), pageReadsPerSec: n(p[2]), commitPct: n(p[3]), pageFileUsagePct: n(p[4]) } };
}

export class PerfAgent {
  perfPct: number | null = null;
  mem: MemCounters | null = null;
  private child: ChildProcess | null = null;

  start() {
    if (!isWin || this.child) return;
    try { this.child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', LOOP], { windowsHide: true }); } catch { return; }
    readline.createInterface({ input: this.child.stdout! }).on('line', (l) => {
      const r = parseAgentLine(l);
      if (r) { this.perfPct = r.perfPct; this.mem = r.mem; }
    });
    this.child.on('error', () => { this.child = null; });
    this.child.on('exit', () => { this.child = null; });
  }

  stop() { this.child?.kill(); this.child = null; }
}
