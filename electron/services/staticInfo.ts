import os from 'node:os';
import si from 'systeminformation';
import type { StaticInfo } from '../../shared/types';
import { isWin } from './exec';
import { topologyFor } from './topology';
import type { GpuMonitor } from './gpuMonitor';
import { isAdmin } from './windows';

export async function collectStaticInfo(appVersion: string, gpu: GpuMonitor, presentMonPath: string | null): Promise<StaticInfo> {
  const cpus = os.cpus();
  let model = cpus[0]?.model?.trim() ?? 'Unknown CPU';
  let physical: number | null = null; let base: number | null = null;
  try { const c = await si.cpu(); physical = c.physicalCores || null; base = c.speed ? Math.round(c.speed * 1000) : null; if (c.brand) model = `${c.manufacturer} ${c.brand}`.trim(); } catch { /* keep os values */ }
  if (!base && cpus[0]?.speed) base = cpus[0].speed;

  let modules: StaticInfo['ram']['modules'] = [];
  try { modules = (await si.memLayout()).filter((m) => m.size > 0).map((m) => ({ sizeMB: Math.round(m.size / 1048576), speedMHz: m.clockSpeed || null, type: m.type || null })); } catch { /* unavailable */ }
  const channelsHint = modules.length === 0 ? null : modules.length === 1 ? 'single' : 'dual-or-more';

  const g = await gpu.probe();
  let gpuName = g?.name ?? null;
  if (!gpuName) { try { gpuName = (await si.graphics()).controllers.find((c) => c.vram)?.model ?? null; } catch { /* none */ } }

  return {
    platform: process.platform, isWindows: isWin, isAdmin: await isAdmin(), appVersion,
    cpu: { model, physicalCores: physical, logicalCores: cpus.length, baseClockMHz: base, topology: topologyFor(model, cpus.length) },
    ram: { totalMB: Math.round(os.totalmem() / 1048576), modules, channelsHint },
    gpu: { name: gpuName, driver: g?.driver ?? null, vramTotalMB: g?.vramTotalMB ?? null, nvidiaSmi: !!g },
    presentMon: { available: !!presentMonPath, path: presentMonPath },
  };
}
