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
  ram: {
    totalMB: number;
    modules: { sizeMB: number; speedMHz: number | null; ratedMHz?: number | null; type: string | null; slot?: string | null }[];
    channelsHint: 'single' | 'dual-or-more' | null;
    channelEvidence?: string;
  };
  display?: DisplayInfo | null;
  platformInfo?: { biosVendor: string | null; biosVersion: string | null; biosDate: string | null; board: string | null; microcode: number | null } | null;
  gpu: { name: string | null; driver: string | null; vramTotalMB: number | null; nvidiaSmi: boolean };
  presentMon: { available: boolean; path: string | null };
}

export interface DisplayInfo {
  name: string | null;
  currentHz: number | null;
  maxHz: number | null;       // highest refresh the monitor reports (null when Windows does not expose it)
  width: number | null;
  height: number | null;
}

export interface NetLive { host: string; latency: number | null; avg: number | null; jitter: number | null; lossPct: number | null; samples: number }
export interface MemCounters { pagesPerSec: number | null; pageReadsPerSec: number | null; commitPct: number | null; pageFileUsagePct: number | null }

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
  tickP99Ms: number;      // 99th percentile frame time within the last tick
  tickMaxMs: number;
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
  net: NetLive | null;
  netStatus: string;
  bottleneck: string | null; // live classification while FPS is measured
  mem: MemCounters | null;
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
export interface Finding {
  id: string; area: string; severity: Severity; title: string; detail: string;
  // Optional structured report (bottleneck diagnosis)
  evidence?: string[]; fix?: string; expected?: string; risk?: 'none' | 'low' | 'medium'; rollback?: string;
}

export type BottleneckKind = 'cpu' | 'gpu' | 'vram' | 'ram' | 'thermal' | 'power' | 'engine' | 'network' | 'shader' | 'background';
export interface Diagnosis extends Finding { kind: BottleneckKind; sharePct: number | null }

export interface LoadProfileStats { id: 'low' | 'normal' | 'intense'; label: string; seconds: number; avgFps: number | null; worstSecond: number | null; bestSecond: number | null; avgP99Ms: number | null; avgCpu: number | null; avgGpu: number | null }

export type OptimizationId =
  | 'game-mode-on'
  | 'power-plan-high'
  | 'background-recording-off'
  | 'close-background-apps'
  | 'clean-temp-files'
  | 'fortnite-max-fps'
  | 'windowed-optimizations-on'
  | 'game-capture-off'
  | 'fortnite-gpu-preference'
  | 'hags-on'
  | 'startup-apps-off'
  | 'visual-effects-performance';

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
  startup?: { name: string; command: string }[];
  needsAdmin?: boolean;
  rebootRequired?: boolean;
}

export interface ScanResult {
  startedAt: number;
  finishedAt: number;
  steps: ScanStep[];
  findings: Finding[];
  recommendations: Recommendation[];
  notApplied: { title: string; reason: string }[];
}

export interface ApplyRequest { ids: OptimizationId[]; pids?: number[]; startupNames?: string[]; skipRestorePoint?: boolean }
export type ApplyStatus = 'success' | 'failed' | 'unavailable' | 'skipped';
export interface ApplyItemResult { id: OptimizationId; title: string; status: ApplyStatus; message: string; before?: string; after?: string; verified?: boolean | null }
export interface ApplyResult { results: ApplyItemResult[]; backupSaved: boolean; restorePoint?: { ok: boolean; message: string } | null }
export interface RestorableItem { id: OptimizationId; title: string; detail: string }

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
export interface FortniteConfigReport { found: boolean; path: string | null; settings: FortniteSetting[]; notes: string[]; frameRateLimit?: number | null; profile?: FortniteProfileId | null }

export interface PerfDropEvent { ts: number; kind: 'fps-drop' | 'stutter'; detail: string; likelyCause: string }
export interface SessionSummary {
  startedAt: number; endedAt: number | null; durationSec: number;
  avgFps: number | null; low1: number | null; stabilityScore: number | null;
  sustainedFps: number | null; // FPS held 90% of the time (10th percentile of per-second FPS)
  fpsSamples: number;
  recommendedCap: number | null; // Stable FPS Lock suggestion, null until 60 s of measured play
  avgCpu: number; avgGpu: number | null; peakVramMB: number | null; peakRamPct: number;
  drops: PerfDropEvent[];
  maxFps: number | null; minFps: number | null; low1Session: number | null;
  loads: LoadProfileStats[];
  diagnosis: Diagnosis[];
}

// ---------- Benchmark ----------
export interface BenchmarkRequest { label: string; durationSec: number; pingHost: string }
export interface BenchmarkResult {
  id: string; label: string; ts: number; durationSec: number; fortniteRunning: boolean; profile: string | null;
  maxFps: number | null; minFps: number | null; jitter: number | null; loads: LoadProfileStats[];
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
  autoBoost: boolean;
  livePingHost: string;
  autoCheckUpdates: boolean;
  nvidiaChecklist: string[];
  autoMode: boolean;
  autoProfile: FortniteProfileId;
  autoLock: boolean;
  autoLockTarget: number;
  autoBoostApps: string[]; // exe names closed automatically when Fortnite starts
}

export type FortniteProfileId = 'ultra' | 'competitive' | 'high-fps' | 'stability' | 'dx12';
export interface FortniteProfileInfo { id: FortniteProfileId; name: string; summary: string; needsCap: boolean }

export interface UpdateStatus { state: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'disabled'; version?: string; percent?: number; message?: string }

export interface RegionResult { id: string; name: string; location: string; samples: (number | null)[]; best: number | null; median: number | null; jitter: number | null; lossPct: number }
export interface PingKiller { name: string; pid: number; reason: string; closable: boolean }
export interface AutoModeStatus { enabled: boolean; lastRun: number | null; trigger: string | null; changed: string[]; skipped: number; failed: string[]; lock: string | null }
