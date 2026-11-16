import si from 'systeminformation';
import type { NetContext, NetProgress, NetTarget, NetTargetResult, NetTestResult } from '../../shared/types';
import { isWin, run, sleep } from './exec';
import { diagnose, isValidHost, parsePingLine, summarize } from './ping';
import { wifiSignal } from './windows';

/** One ICMP echo using the system `ping` tool (no shell, validated host). Returns ms or null on loss. */
export async function pingOnce(host: string): Promise<number | null> {
  if (!isValidHost(host)) return null;
  const args = isWin ? ['-n', '1', '-w', '1000', host] : ['-c', '1', '-W', '1', host];
  const r = await run('ping', args, 4000);
  if (r.error?.includes('ENOENT')) throw new Error('The system ping tool was not found');
  for (const line of r.stdout.split(/\r?\n/)) { const v = parsePingLine(line); if (v !== undefined) return v; }
  return null;
}

export async function pingSeries(t: NetTarget, count: number, onSample?: (p: NetProgress) => void, signal?: { cancelled: boolean }): Promise<NetTargetResult> {
  if (!isValidHost(t.host)) return summarize(t.label, t.host, [], 'Invalid host name');
  const samples: (number | null)[] = [];
  for (let i = 0; i < count && !signal?.cancelled; i++) {
    const t0 = Date.now();
    let v: number | null;
    try { v = await pingOnce(t.host); } catch (e) { return summarize(t.label, t.host, [], (e as Error).message); }
    samples.push(v);
    onSample?.({ host: t.host, index: i, latency: v });
    const wait = 1000 - (Date.now() - t0);
    if (wait > 0 && i < count - 1) await sleep(wait);
  }
  const res = summarize(t.label, t.host, samples);
  if (res.received === 0) res.error = 'No replies (host down, blocked ICMP, or no connection)';
  return res;
}

export async function getNetContext(): Promise<NetContext> {
  let gateway: string | null = null; let type: NetContext['connectionType'] = 'unknown'; let iface: string | null = null;
  try { gateway = (await si.networkGatewayDefault()) || null; } catch { /* unavailable */ }
  try {
    const d = await si.networkInterfaces('default');
    const i = Array.isArray(d) ? d[0] : d;
    if (i) { iface = i.ifaceName || i.iface || null; type = i.type === 'wireless' ? 'wireless' : i.type === 'wired' ? 'wired' : 'unknown'; }
  } catch { /* unavailable */ }
  const wifi = type === 'wireless' ? await wifiSignal() : null;
  return { connectionType: type, interfaceName: iface, wifiSignalPct: wifi, gateway: gateway && isValidHost(gateway) ? gateway : null };
}

export async function runNetTest(targets: NetTarget[], count: number, onSample: (p: NetProgress) => void): Promise<NetTestResult> {
  const startedAt = Date.now();
  const context = await getNetContext();
  const gwP = context.gateway ? pingSeries({ label: 'Your router', host: context.gateway }, count, onSample) : Promise.resolve(null);
  const results = await Promise.all(targets.map((t) => pingSeries(t, count, onSample)));
  const gatewayResult = await gwP;
  return { startedAt, context, gatewayResult, results, diagnosis: diagnose(context, gatewayResult, results) };
}
