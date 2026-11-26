import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApplyResult, LiveMetrics, NetTestResult, ScanResult, ScanStep, StaticInfo } from '../../shared/types';
import { api, hasBridge } from './api';

export interface HistoryPoint { t: number; cpu: number; gpu: number | null; ram: number; vram: number | null; fps: number | null; low1: number | null; gpuTemp: number | null; cpuTemp: number | null; ping: number | null; frameP99: number | null }

export type BoostPhase = 'idle' | 'scanning' | 'review' | 'applying' | 'done';
export interface BoostState { phase: BoostPhase; mode: 'scan' | 'boost'; steps: ScanStep[]; result: ScanResult | null; applied: ApplyResult | null; error: string | null }

interface Ctx {
  info: StaticInfo | null;
  live: LiveMetrics | null;
  history: HistoryPoint[];
  boost: BoostState;
  setBoost: (fn: (b: BoostState) => BoostState) => void;
  lastNet: NetTestResult | null;
  setLastNet: (r: NetTestResult) => void;
  benchDoneAt: number | null; // last completed benchmark (for the BENCHMARK workflow step)
  setBenchDoneAt: (t: number | null) => void;
  refreshInfo: () => void;
}

const C = createContext<Ctx | null>(null);
const MAX = 120;

export function AppProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<StaticInfo | null>(null);
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [boost, setBoostState] = useState<BoostState>({ phase: 'idle', mode: 'boost', steps: [], result: null, applied: null, error: null });
  const [lastNet, setLastNet] = useState<NetTestResult | null>(null);
  const [benchDoneAt, setBenchDoneAt] = useState<number | null>(null);
  const hist = useRef<HistoryPoint[]>([]);

  const refreshInfo = () => { if (hasBridge()) api().getStatic().then(setInfo).catch(() => undefined); };

  useEffect(() => {
    if (!hasBridge()) return;
    refreshInfo();
    const off = api().onMetrics((m) => {
      setLive(m);
      const vram = m.gpu?.vramUsedMB != null && m.gpu.vramTotalMB ? (m.gpu.vramUsedMB / m.gpu.vramTotalMB) * 100 : null;
      hist.current = [...hist.current.slice(-(MAX - 1)), { t: m.ts, cpu: m.cpu.usage, gpu: m.gpu?.usage ?? null, ram: m.ram.percent, vram, fps: m.fps?.fps ?? null, low1: m.fps?.low1 ?? null, gpuTemp: m.gpu?.tempC ?? null, cpuTemp: m.cpu.tempC, ping: m.net?.latency ?? null, frameP99: m.fps?.tickP99Ms ?? null }];
      setHistory(hist.current);
    });
    const vis = () => void api().setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => { off(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  return <C.Provider value={{ info, live, history, boost, setBoost: setBoostState, lastNet, setLastNet, benchDoneAt, setBenchDoneAt, refreshInfo }}>{children}</C.Provider>;
}

export const useApp = () => { const c = useContext(C); if (!c) throw new Error('no provider'); return c; };
