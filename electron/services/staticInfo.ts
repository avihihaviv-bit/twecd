import os from 'node:os';
import si from 'systeminformation';
import type { StaticInfo } from '../../shared/types';
import { isWin } from './exec';
import { topologyFor } from './topology';
import type { GpuMonitor } from './gpuMonitor';
import { isAdmin } from './windows';
import { channelLayout, probeWindows } from './winProbe';

export async function collectStaticInfo(appVersion: string, gpu: GpuMonitor, presentMonPath: string | null): Promise<StaticInfo> {
  const cpus = os.cpus();
  let model = cpus[0]?.model?.trim() ?? 'Unknown CPU';
  let physical: number | null = null; let base: number | null = null;
  try { const c = await si.cpu(); physical = c.physicalCores || null; base = c.speed ? Math.round(c.speed * 1000) : null; if (c.brand) model = `${c.manufacturer} ${c.brand}`.trim(); } catch { /* keep os values */ }
  if (!base && cpus[0]?.speed) base = cpus[0].speed;

  const probe = await probeWindows().catch(() => null);
  let modules: StaticInfo['ram']['modules'] = probe?.modules ?? [];
  if (!modules.length) { try { modules = (await si.memLayout()).filter((m) => m.size > 0).map((m) => ({ sizeMB: Math.round(m.size / 1048576), speedMHz: m.clockSpeed || null, type: m.type || null, slot: m.bank || null })); } catch { /* unavailable */ } }
  const ch = channelLayout(modules.map((m) => ({ sizeMB: m.sizeMB, speedMHz: m.speedMHz, ratedMHz: m.ratedMHz ?? null, type: m.type, slot: m.slot ?? null })));

  const g = await gpu.probe();
  let gpuName = g?.name ?? null;
  if (!gpuName) { try { gpuName = (await si.graphics()).controllers.find((c) => c.vram)?.model ?? null; } catch { /* none */ } }

  return {
    platform: process.platform, isWindows: isWin, isAdmin: await isAdmin(), appVersion,
    cpu: { model, physicalCores: physical, logicalCores: cpus.length, baseClockMHz: base, topology: topologyFor(model, cpus.length) },
    ram: { totalMB: Math.round(os.totalmem() / 1048576), modules, channelsHint: ch.hint, channelEvidence: ch.evidence },
    display: probe?.display ?? null,
    platformInfo: probe ? { biosVendor: probe.biosVendor, biosVersion: probe.biosVersion, biosDate: probe.biosDate, board: probe.board, boardRevision: probe.boardRevision ?? null, microcode: probe.microcode } : null,
    gpu: { name: gpuName, driver: g?.driver ?? null, vramTotalMB: g?.vramTotalMB ?? null, nvidiaSmi: !!g },
    presentMon: { available: !!presentMonPath, path: presentMonPath },
  };
}
