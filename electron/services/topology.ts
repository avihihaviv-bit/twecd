import type { CpuTopology } from '../../shared/types';

// Published hybrid layouts (P-cores with Hyper-Threading are enumerated first by Windows, then E-cores).
const KNOWN: { match: RegExp; p: number; e: number }[] = [
  { match: /i5-14600K/i, p: 6, e: 8 },
  { match: /i5-13600K/i, p: 6, e: 8 },
  { match: /i7-14700K/i, p: 8, e: 12 },
  { match: /i9-14900K/i, p: 8, e: 16 },
  { match: /i5-14400/i, p: 6, e: 4 },
];

export function topologyFor(model: string, logical: number): CpuTopology | null {
  const k = KNOWN.find((m) => m.match.test(model));
  if (!k) return null;
  const pThreads = k.p * 2;
  if (pThreads + k.e !== logical) return null; // HT disabled or unexpected layout: do not guess
  return {
    pCoreThreads: Array.from({ length: pThreads }, (_, i) => i),
    eCoreThreads: Array.from({ length: k.e }, (_, i) => pThreads + i),
    source: 'known-model',
  };
}
