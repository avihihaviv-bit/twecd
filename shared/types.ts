// Contract between the Electron main process and the renderer.
// Every metric is nullable: null means "Unavailable" and is shown as such. Nothing is ever simulated.

export type Platform = 'win32' | 'linux' | 'darwin' | string;

export interface CpuTopology {
  pCoreThreads: number[]; // logical processor indexes belonging to Performance cores
  eCoreThreads: number[]; // logical processor indexes belonging to Efficient cores
  source: 'known-model'; // derived from the published core layout of the detected CPU model
}

export interface StaticInfo {
  platform: Platform;
  isWindows: boolean;
  isAdmin: boolean;
  appVersion: string;
  cpu: { model: string; physicalCores: number | null; logicalCores: number; baseClockMHz: number | null; topology: CpuTopology | null };
  ram: { totalMB: number; modules: { sizeMB: number; speedMHz: number | null; type: string | null }[]; channelsHint: 'single' | 'dual-or-more' | null };
  gpu: { name: string | null; driver: string | null; vramTotalMB: number | null; nvidiaSmi: boolean };
  presentMon: { available: boolean; path: string | null };
}

export interface GpuMetrics {
  name: string;
  driver: string;
  usage: number | null;
  vramUsedMB: number | null;
  vramTotalMB: number | null;
  tempC: number | null;
  clockMHz: number | null;
  maxClockMHz: number | null;
  powerW: number | null;
  powerLimitW: number | null;
  throttleReasons: string[];
}

export interface FpsMetrics {
  source: 'presentmon';
  processName: string;
  fps: number;            // last ~1 s
  avg: number;            // rolling window
  low1: number;           // 1% low (FPS derived from 99th percentile frame time)
  low01: number | null;   // 0.1% low when enough samples
  frameTimesMs: number[]; // most recent frame times for the graph
  frameTimeAvgMs: number;
  frameTimeStdMs: number;
  spikes: number;         // frames > 2x median frame time in the window
  stutters: number;       // frames > 2.5x median AND > 8ms above median
  stabilityScore: number; // 0..100 derived from measured frame-time consistency
  cpuBusyMs: number | null;
  gpuBusyMs: number | null;
  sampleCount: number;
}

export interface LiveMetrics {
  ts: number;
  cpu: { usage: number; perCore: number[]; effectiveClockMHz: number | null; tempC: number | null };
  ram: { totalMB: number; usedMB: number; availableMB: number; percent: number };
  gpu: GpuMetrics | null;
  gpuStatus: string; // human readable reason when gpu is null
  fortnite: FortniteState;
  fps: FpsMetrics | null;
  fpsStatus: string; // human readable reason when fps is null
}

export interface FortniteState {
  running: boolean;
  pid: number | null;
  memMB: number | null;
  startedAt: number | null;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  memMB: number;
  cpuPercent: number | null;
  category: 'game' | 'anti-cheat' | 'system' | 'closable' | 'other';
}

// ---------- Scan / Boost ----------
export type ScanStepId =
  | 'cpu' | 'gpu' | 'vram' | 'ram' | 'processes' | 'fortnite-config'
  | 'game-mode' | 'power' | 'network' | 'bottlenecks';

export type StepStatus = 'pending' | 'running' | 'done' | 'unavailable' | 'error';

export interface ScanStep { id: ScanStepId; label: string; status: StepStatus; summary: string }

export type Severity = 'good' | 'info' | 'warn' | 'bad';
export interface Finding { id: string; area: string; severity: Severity; title: string; detail: string }

export type OptimizationId =
  | 'game-mode-on'
  | 'power-plan-high'
  | 'background-recording-off'
  | 'close-background-apps'
  | 'clean-temp-files'
  | 'fortnite-max-fps'
  | 'windowed-optimizations-on';

export interface Recommendation {
  id: string;
  optimizationId: OptimizationId | null; // null => manual advice only (no automatic action)
  area: string;
  title: string;
  why: string;      // plain-language explanation of what and why
  change: string;   // exactly what will be changed
  impact: 'high' | 'medium' | 'low';
  reversible: boolean;
  selectedByDefault: boolean;
  processes?: ProcessInfo[];
}

export interface ScanResult {
  startedAt: number;
  finishedAt: number;
  steps: ScanStep[];
  findings: Finding[];
  recommendations: Recommendation[];
}

export interface ApplyRequest { ids: OptimizationId[]; pids?: number[] }
export type ApplyStatus = 'success' | 'failed' | 'unavailable' | 'skipped';
export interface ApplyItemResult { id: OptimizationId; title: string; status: ApplyStatus; message: string }
export interface ApplyResult { results: ApplyItemResult[]; backupSaved: boolean }

export interface ChangeLogEntry { ts: number; action: string; detail: string }

// ---------- Network ----------
export interface NetTarget { label: string; host: string }
export interface NetTestRequest { targets: NetTarget[]; count: number }
export interface NetTargetResult {
  label: string; host: string; sent: number; received: number; lossPct: number;
  min: number | null; avg: number | null; max: number | null; jitter: number | null;
  samples: (number | null)[]; error: string | null;
}
export interface NetContext {
  connectionType: 'wired' | 'wireless' | 'unknown';
  interfaceName: string | null;
  wifiSignalPct: number | null;
  gateway: string | null;
}
export interface NetDiagnosis { source: 'wifi' | 'local-network' | 'isp' | 'destination' | 'healthy' | 'inconclusive'; title: string; explanation: string }
export interface NetTestResult { startedAt: number; context: NetContext; gatewayResult: NetTargetResult | null; results: NetTargetResult[]; diagnosis: NetDiagnosis }
export interface NetProgress { host: string; index: number; latency: number | null }

// ---------- Fortnite ----------
export interface FortniteSetting { key: string; label: string; current: string | null; recommended: string; ok: boolean | null; note: string }
export interface FortniteConfigReport { found: boolean; path: string | null; settings: FortniteSetting[]; notes: string[] }

export interface PerfDropEvent { ts: number; kind: 'fps-drop' | 'stutter'; detail: string; likelyCause: string }
export interface SessionSummary {
  startedAt: number; endedAt: number | null; durationSec: number;
  avgFps: number | null; low1: number | null; stabilityScore: number | null;
  avgCpu: number; avgGpu: number | null; peakVramMB: number | null; peakRamPct: number;
  drops: PerfDropEvent[];
}

// ---------- Benchmark ----------
export interface BenchmarkRequest { label: 'before' | 'after'; durationSec: number; pingHost: string }
export interface BenchmarkResult {
  id: string; label: 'before' | 'after'; ts: number; durationSec: number; fortniteRunning: boolean;
  avgFps: number | null; low1: number | null; frameTimeStdMs: number | null; stabilityScore: number | null;
  avgCpu: number; avgGpu: number | null; avgRamMB: number; avgVramMB: number | null;
  pingAvg: number | null; packetLossPct: number | null; pingHost: string; notes: string[];
}
export interface BenchmarkProgress { elapsedSec: number; durationSec: number }

export interface Settings {
  presentMonPath: string | null;
  monitorIntervalMs: number;
  netTargets: NetTarget[];
  trackFortniteWhileMinimized: boolean;
}
