import type {
  ApplyItemResult, ApplyRequest, ApplyResult, BenchmarkProgress, BenchmarkRequest, BenchmarkResult, ChangeLogEntry,
  FortniteConfigReport, LiveMetrics, NetContext, NetProgress, NetTestRequest, NetTestResult, ProcessInfo, ScanResult,
  ScanStep, SessionSummary, Settings, StaticInfo, OptimizationId, AutoModeStatus, RegionResult, PingKiller, OptStatus, AdapterInfo, HwSensor, BufferbloatResult, BiosReport, RestorableItem, FortniteProfileId, FortniteProfileInfo, UpdateStatus,
  ExpDef, ExpId, ExpProgress, ExpState,
} from '../../shared/types';

type Off = () => void;
export interface TuneStepInfo { key: string; from: string | null; to: string; label: string; why: string }
export interface TwecdApi {
  getStatic(): Promise<StaticInfo>;
  setVisible(v: boolean): Promise<void>;
  relaunchAdmin(): Promise<{ ok: boolean; message: string }>;
  openExternal(url: string): Promise<void>;
  scan(): Promise<ScanResult>;
  onScanStep(cb: (s: ScanStep) => void): Off;
  apply(req: ApplyRequest): Promise<ApplyResult>;
  restore(ids?: OptimizationId[]): Promise<ApplyItemResult[]>;
  restorable(): Promise<RestorableItem[]>;
  startupList(): Promise<{ name: string; command: string; enabled: boolean; essential: boolean }[]>;
  changeLog(): Promise<ChangeLogEntry[]>;
  hasBackup(): Promise<boolean>;
  processes(): Promise<ProcessInfo[]>;
  onMetrics(cb: (m: LiveMetrics) => void): Off;
  netTest(req: NetTestRequest): Promise<NetTestResult>;
  onNetProgress(cb: (p: NetProgress) => void): Off;
  netContext(): Promise<NetContext>;
  fortniteConfig(): Promise<FortniteConfigReport>;
  launchFortnite(): Promise<{ ok: boolean; message: string }>;
  session(): Promise<{ current: SessionSummary | null; last: SessionSummary | null }>;
  setFortniteCap(cap: number): Promise<{ ok: boolean; message: string }>;
  closableCatalog(): Promise<{ exe: string; name: string }[]>;
  fortniteProfiles(): Promise<FortniteProfileInfo[]>;
  applyFortniteProfile(req: { profile: FortniteProfileId; cap?: number }): Promise<{ ok: boolean; message: string; changed: string[] }>;
  updateCheck(): Promise<UpdateStatus>;
  updateDownload(): Promise<UpdateStatus>;
  updateInstall(): Promise<UpdateStatus>;
  updateGet(): Promise<UpdateStatus>;
  onUpdateStatus(cb: (s: UpdateStatus) => void): Off;
  autoGet(): Promise<AutoModeStatus>;
  autoRun(): Promise<AutoModeStatus>;
  onAutoStatus(cb: (s: AutoModeStatus) => void): Off;
  regionTest(): Promise<{ results: RegionResult[]; ok: boolean; reason: string | null }>;
  onRegionProgress(cb: (p: { done: number; total: number }) => void): Off;
  pingKillers(): Promise<PingKiller[]>;
  optStatus(): Promise<OptStatus[]>;
  vbs(): Promise<{ memoryIntegrity: boolean | null; vbsRunning: boolean | null }>;
  overlays(): Promise<{ name: string; advice: string }[]>;
  tuneGet(): Promise<{ kind: string | null; title: string | null; evidence: string[]; step: TuneStepInfo | null; samples: number }>;
  tuneApply(): Promise<{ ok: boolean; message: string; step: TuneStepInfo | null }>;
  adapters(): Promise<AdapterInfo[]>;
  hwinfo(): Promise<HwSensor[] | null>;
  bufferbloat(): Promise<BufferbloatResult>;
  onBufferbloatProgress(cb: (p: { phase: string; pct: number }) => void): Off;
  biosReport(): Promise<BiosReport>;
  benchRun(req: BenchmarkRequest): Promise<BenchmarkResult>;
  onBenchProgress(cb: (p: BenchmarkProgress) => void): Off;
  benchList(): Promise<BenchmarkResult[]>;
  benchClear(): Promise<boolean>;
  expList(): Promise<{ defs: ExpDef[]; states: ExpState[] }>;
  expRun(req: { id: ExpId; phase: 'A' | 'B' }): Promise<ExpState>;
  onExpProgress(cb: (p: ExpProgress) => void): Off;
  expKeep(req: { id: ExpId; keep: boolean }): Promise<{ ok: boolean; message: string }>;
  expReset(id: ExpId): Promise<boolean>;
  settingsGet(): Promise<Settings>;
  settingsSet(s: Partial<Settings>): Promise<Settings>;
  pickPresentMon(): Promise<Settings>;
}

declare global { interface Window { twecd?: TwecdApi } }

export const api = (): TwecdApi => {
  if (!window.twecd) throw new Error('TWECD desktop bridge unavailable');
  return window.twecd;
};
export const hasBridge = () => !!window.twecd;

export const UNAVAILABLE = 'Unavailable';
export const fmt = (v: number | null | undefined, digits = 0, unit = '') => (v === null || v === undefined || !Number.isFinite(v) ? UNAVAILABLE : `${v.toFixed(digits)}${unit}`);
export const gb = (mb: number | null | undefined, d = 1) => (mb === null || mb === undefined ? UNAVAILABLE : `${(mb / 1024).toFixed(d)} GB`);
export const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
