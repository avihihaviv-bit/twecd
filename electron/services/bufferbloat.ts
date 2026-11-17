import https from 'node:https';
import type { BufferbloatResult } from '../../shared/types';
import { pingOnce } from './network';

const LOAD_URL = 'https://speed.cloudflare.com/__down?bytes=25000000'; // 25 MB per request, public speed-test endpoint
const PING_HOST = '1.1.1.1';

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Grade by added latency under load (same scale as common bufferbloat tests). */
export function gradeBloat(addedMs: number | null): BufferbloatResult['grade'] {
  if (addedMs === null) return null;
  if (addedMs < 5) return 'A+';
  if (addedMs < 30) return 'A';
  if (addedMs < 60) return 'B';
  if (addedMs < 200) return 'C';
  if (addedMs < 400) return 'D';
  return 'F';
}

export function summarizeBloat(idle: (number | null)[], loaded: (number | null)[], bytes: number, seconds: number): BufferbloatResult {
  const i = idle.filter((x): x is number => x !== null);
  const l = loaded.filter((x): x is number => x !== null);
  const idleMs = median(i); const loadedMs = median(l);
  const added = idleMs !== null && loadedMs !== null ? Math.max(0, loadedMs - idleMs) : null;
  return {
    idleMs, loadedMs, addedMs: added, grade: gradeBloat(added),
    downloadMbps: seconds > 0 ? (bytes * 8) / seconds / 1e6 : null,
    loadedLossPct: loaded.length ? ((loaded.length - l.length) / loaded.length) * 100 : null,
    advice: added === null ? 'Could not measure: ping did not answer or the download failed.'
      : added < 30 ? 'Your connection keeps latency low under load. Bufferbloat is not causing your lag.'
      : 'Latency rises a lot when the connection is busy. When anyone downloads or streams, your Fortnite ping will spike. Fix: enable SQM / Smart Queue / "Gaming QoS" on your router (often called Adaptive QoS, Smart Queue Management or cake/fq_codel), or set the router\'s bandwidth limit to ~90% of your plan. TWECD does not change router settings.',
  };
}

/** Measures idle ping, then ping while saturating the download link for ~12 s. Uses ~50-150 MB of data. */
export async function runBufferbloat(onProgress: (phase: string, pct: number) => void): Promise<BufferbloatResult> {
  const idle: (number | null)[] = [];
  for (let k = 0; k < 10; k++) { idle.push(await pingOnce(PING_HOST)); onProgress('Measuring idle ping', (k + 1) * 3); }
  let bytes = 0; let stop = false; const t0 = Date.now();
  const download = (): Promise<void> => new Promise<void>((resolve) => {
    if (stop) return resolve();
    const req = https.get(LOAD_URL, (res) => { res.on('data', (c: Buffer) => { bytes += c.length; if (stop) req.destroy(); }); res.on('end', () => resolve()); res.on('error', () => resolve()); });
    req.on('error', () => resolve()); req.setTimeout(15000, () => { req.destroy(); resolve(); });
  }).then((): Promise<void> | undefined => (stop ? undefined : download()));
  const loaders = [download(), download(), download()];
  const loaded: (number | null)[] = [];
  const deadline = Date.now() + 12000;
  await new Promise((r) => setTimeout(r, 1500)); // let the link fill up
  while (Date.now() < deadline) { loaded.push(await pingOnce(PING_HOST)); onProgress('Measuring ping under load', 30 + Math.round(((12000 - (deadline - Date.now())) / 12000) * 70)); await new Promise((r) => setTimeout(r, 300)); }
  stop = true;
  const seconds = (Date.now() - t0) / 1000;
  await Promise.race([Promise.all(loaders), new Promise((r) => setTimeout(r, 3000))]);
  return summarizeBloat(idle, loaded, bytes, seconds);
}
