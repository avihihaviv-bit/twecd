import net from 'node:net';
import type { RegionResult } from '../../shared/types';

/**
 * Fortnite matchmaking regions and the public cloud region closest to each datacenter.
 * Fortnite's exact server addresses are not public, so TWECD measures the TCP handshake time
 * to the nearest public cloud region endpoint. It is a reliable *relative* comparison between
 * regions; the in-game "Net Debug Stats" shows the exact match-server ping.
 */
export const FORTNITE_REGIONS: { id: string; name: string; location: string; host: string; lat: number; lon: number }[] = [
  { id: 'EU', lat: 50.1, lon: 8.7, name: 'Europe', location: 'Frankfurt / London area', host: 'ec2.eu-central-1.amazonaws.com' },
  { id: 'ME', lat: 26.2, lon: 50.6, name: 'Middle East', location: 'Bahrain', host: 'ec2.me-south-1.amazonaws.com' },
  { id: 'NAE', lat: 38.9, lon: -77.4, name: 'NA-East', location: 'Virginia', host: 'ec2.us-east-1.amazonaws.com' },
  { id: 'NAC', lat: 40.0, lon: -83.0, name: 'NA-Central', location: 'Ohio', host: 'ec2.us-east-2.amazonaws.com' },
  { id: 'NAW', lat: 45.6, lon: -121.2, name: 'NA-West', location: 'Oregon', host: 'ec2.us-west-2.amazonaws.com' },
  { id: 'BR', lat: -23.5, lon: -46.6, name: 'Brazil', location: 'Sao Paulo', host: 'ec2.sa-east-1.amazonaws.com' },
  { id: 'ASIA', lat: 35.7, lon: 139.7, name: 'Asia', location: 'Tokyo', host: 'ec2.ap-northeast-1.amazonaws.com' },
  { id: 'OCE', lat: -33.9, lon: 151.2, name: 'Oceania', location: 'Sydney', host: 'ec2.ap-southeast-2.amazonaws.com' },
];

/** One TCP handshake (SYN -> SYN/ACK) in ms, or null on timeout/failure. No data is sent. */
export function tcpRtt(host: string, port = 443, timeoutMs = 2500): Promise<number | null> {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port });
    const done = (v: number | null) => { s.destroy(); resolve(v); };
    s.setTimeout(timeoutMs, () => done(null));
    s.once('connect', () => done(Number(process.hrtime.bigint() - t0) / 1e6));
    s.once('error', () => done(null));
  });
}

export function summarizeRegion(samples: (number | null)[]): { best: number | null; median: number | null; jitter: number | null; lossPct: number } {
  const ok = samples.filter((x): x is number => x !== null);
  if (!ok.length) return { best: null, median: null, jitter: null, lossPct: 100 };
  const sorted = [...ok].sort((a, b) => a - b);
  let j = 0; for (let i = 1; i < ok.length; i++) j += Math.abs(ok[i] - ok[i - 1]);
  return { best: sorted[0], median: sorted[Math.floor(sorted.length / 2)], jitter: ok.length > 1 ? j / (ok.length - 1) : 0, lossPct: ((samples.length - ok.length) / samples.length) * 100 };
}

/** Picks the region with the lowest median handshake time; prefers lower jitter when within 5 ms. */
export function pickBest(results: RegionResult[]): RegionResult | null {
  const ok = results.filter((r) => r.median !== null && r.lossPct < 50);
  if (!ok.length) return null;
  return ok.sort((a, b) => (Math.abs(a.median! - b.median!) <= 5 ? (a.jitter ?? 0) - (b.jitter ?? 0) : a.median! - b.median!))[0];
}

export async function testRegions(samples = 5, onProgress?: (done: number, total: number) => void): Promise<RegionResult[]> {
  const total = FORTNITE_REGIONS.length * samples;
  let done = 0;
  return Promise.all(FORTNITE_REGIONS.map(async (r) => {
    const s: (number | null)[] = [];
    for (let i = 0; i < samples; i++) { s.push(await tcpRtt(r.host)); onProgress?.(++done, total); }
    return { id: r.id, name: r.name, location: r.location, samples: s, ...summarizeRegion(s) };
  }));
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Physics check: light in fiber travels ~200 km/ms, so for any two regions A and B,
 * RTT(you,A) + RTT(you,B) must be at least the round-trip time between A and B.
 * If measurements break that (e.g. Brazil and Tokyo both "5 ms"), something on the PC or network
 * (VPN, proxy, antivirus HTTPS scanning) is answering the connections locally, and results are not real.
 */
export function plausibility(results: RegionResult[]): { ok: boolean; reason: string | null } {
  const byId = new Map(results.filter((r) => r.best !== null).map((r) => [r.id, r]));
  for (let i = 0; i < FORTNITE_REGIONS.length; i++) for (let j = i + 1; j < FORTNITE_REGIONS.length; j++) {
    const A = FORTNITE_REGIONS[i], B = FORTNITE_REGIONS[j];
    const a = byId.get(A.id), b = byId.get(B.id);
    if (!a || !b) continue;
    const minRtt = (2 * distanceKm(A, B)) / 200; // ms, theoretical minimum
    if (minRtt > 40 && a.best! + b.best! < minRtt * 0.6) {
      return { ok: false, reason: `${A.name} (${a.best!.toFixed(0)} ms) and ${B.name} (${b.best!.toFixed(0)} ms) cannot both be that close: they are ${Math.round(distanceKm(A, B)).toLocaleString()} km apart (at least ${Math.round(minRtt)} ms between them). A VPN, proxy or antivirus "HTTPS/web scanning" feature is answering the connections on your PC, so these numbers are not real. Turn it off temporarily and test again, or use Fortnite's Net Debug Stats.` };
    }
  }
  return { ok: true, reason: null };
}
