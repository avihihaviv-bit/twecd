import type {
  ApplyItemResult, ApplyRequest, ApplyResult, BenchmarkProgress, BenchmarkRequest, BenchmarkResult, ChangeLogEntry,
  FortniteConfigReport, LiveMetrics, NetContext, NetProgress, NetTestRequest, NetTestResult, ProcessInfo, ScanResult,
  ScanStep, SessionSummary, Settings, StaticInfo,
} from '../../shared/types';

type Off = () => void;
export interface TwecdApi {
  getStatic(): Promise<StaticInfo>;
  setVisible(v: boolean): Promise<void>;
  relaunchAdmin(): Promise<{ ok: boolean; message: string }>;
  openExternal(url: string): Promise<void>;
  scan(): Promise<ScanResult>;
  onScanStep(cb: (s: ScanStep) => void): Off;
  apply(req: ApplyRequest): Promise<ApplyResult>;
  restore(): Promise<ApplyItemResult[]>;
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
  benchRun(req: BenchmarkRequest): Promise<BenchmarkResult>;
  onBenchProgress(cb: (p: BenchmarkProgress) => void): Off;
  benchList(): Promise<BenchmarkResult[]>;
  benchClear(): Promise<boolean>;
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
