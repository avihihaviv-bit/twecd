import type { BenchScenario, BenchmarkResult } from '../../shared/types';

export const SCENARIOS: { id: BenchScenario; name: string; how: string }[] = [
  { id: 'creative-freebuild', name: 'Creative Free Build', how: 'Same free-build map and the same build sequence each run. Most repeatable.' },
  { id: 'build-fight', name: 'Build Fight', how: 'Box-fight / build-fight map, similar intensity each run.' },
  { id: '1v1', name: '1v1', how: 'Same 1v1 map, full fight from start to finish.' },
  { id: 'reload', name: 'Reload', how: 'Early-game Reload match; results vary more, run 2-3 times.' },
  { id: 'battle-royale', name: 'Battle Royale', how: 'Drop to the same POI; least repeatable, use 120 s and repeat.' },
  { id: 'other', name: 'Other', how: 'Anything else.' },
];

/**
 * Picks the best profile from REAL runs of one scenario: latest run per profile with FPS data,
 * winner = highest 1% low (if more than 3% apart), otherwise highest average FPS.
 */
export function pickWinner(runs: BenchmarkResult[]): { winner: BenchmarkResult | null; candidates: BenchmarkResult[]; reason: string } {
  const latest = new Map<string, BenchmarkResult>();
  for (const r of [...runs].sort((a, b) => b.ts - a.ts)) {
    if (r.avgFps === null || r.low1 === null) continue;
    const k = r.profile ?? 'custom';
    if (!latest.has(k)) latest.set(k, r);
  }
  const c = [...latest.values()];
  if (c.length < 2) return { winner: null, candidates: c, reason: c.length ? 'Benchmark this scenario with another profile to compare.' : '' };
  const byLow = [...c].sort((a, b) => b.low1! - a.low1!);
  const [a, b] = byLow;
  if ((a.low1! - b.low1!) / b.low1! > 0.03) return { winner: a, candidates: c, reason: `best 1% low (${Math.round(a.low1!)} vs ${Math.round(b.low1!)})` };
  const byAvg = [...c].sort((x, y) => y.avgFps! - x.avgFps!);
  return { winner: byAvg[0], candidates: c, reason: `1% lows within 3%, so decided by average FPS (${Math.round(byAvg[0].avgFps!)})` };
}
