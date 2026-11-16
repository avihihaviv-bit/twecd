import { useEffect, useState } from 'react';
import { Loader2, Timer, Trash2 } from 'lucide-react';
import type { BenchmarkProgress, BenchmarkResult } from '../../shared/types';
import { api, errMsg, fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, Empty, PageHeader } from '../components/ui';

type Row = { k: string; get: (r: BenchmarkResult) => number | null; d: number; unit: string; higherBetter: boolean };
const ROWS: Row[] = [
  { k: 'Average FPS', get: (r) => r.avgFps, d: 0, unit: '', higherBetter: true },
  { k: '1% Low FPS', get: (r) => r.low1, d: 0, unit: '', higherBetter: true },
  { k: 'Frame-time std dev', get: (r) => r.frameTimeStdMs, d: 2, unit: ' ms', higherBetter: false },
  { k: 'Stability score', get: (r) => r.stabilityScore, d: 0, unit: '', higherBetter: true },
  { k: 'CPU utilization', get: (r) => r.avgCpu, d: 0, unit: '%', higherBetter: false },
  { k: 'GPU utilization', get: (r) => r.avgGpu, d: 0, unit: '%', higherBetter: true },
  { k: 'RAM used', get: (r) => r.avgRamMB / 1024, d: 2, unit: ' GB', higherBetter: false },
  { k: 'VRAM used', get: (r) => (r.avgVramMB === null ? null : r.avgVramMB / 1024), d: 2, unit: ' GB', higherBetter: false },
  { k: 'Ping', get: (r) => r.pingAvg, d: 1, unit: ' ms', higherBetter: false },
  { k: 'Packet loss', get: (r) => r.packetLossPct, d: 0, unit: '%', higherBetter: false },
];

export default function Benchmark() {
  const { live } = useApp();
  const [list, setList] = useState<BenchmarkResult[]>([]);
  const [dur, setDur] = useState(60);
  const [prog, setProg] = useState<BenchmarkProgress | null>(null);
  const [running, setRunning] = useState<null | 'before' | 'after'>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api().benchList().then(setList); return api().onBenchProgress(setProg); }, []);

  const run = async (label: 'before' | 'after') => {
    setRunning(label); setErr(null); setProg({ elapsedSec: 0, durationSec: dur });
    try { await api().benchRun({ label, durationSec: dur, pingHost: '1.1.1.1' }); setList(await api().benchList()); }
    catch (e) { setErr(errMsg(e)); } finally { setRunning(null); setProg(null); }
  };
  const before = list.find((r) => r.label === 'before');
  const after = list.find((r) => r.label === 'after');

  return (
    <div className="animate-fadeUp">
      <PageHeader title="BEFORE / AFTER BENCHMARK" subtitle="Records real measurements for a fixed time. For a fair comparison: same Fortnite map and route (a Creative map is ideal), same settings, same time of day. TWECD shows the raw difference and never adjusts it." />
      <div className="grid grid-cols-[360px_1fr] gap-6">
        <Card title="Run">
          <ol className="mb-4 space-y-1 text-sm text-[#c3cdc7]">
            <li>1. Start Fortnite and load the same scene.</li>
            <li>2. Run <b className="text-white">BEFORE</b>.</li>
            <li>3. Apply optimizations on the Boost page.</li>
            <li>4. Return to the same scene, run <b className="text-white">AFTER</b>.</li>
          </ol>
          <div className="mb-4 flex items-center gap-2 text-sm"><span className="label">Duration</span>
            {[30, 60, 120].map((d) => <button key={d} onClick={() => setDur(d)} className={`chip border ${dur === d ? 'border-neon/50 text-neon' : 'border-line text-muted'}`}>{d}s</button>)}
          </div>
          {!live?.fortnite.running && <div className="mb-3 rounded-lg border border-warn/30 bg-warn/10 p-2 text-xs text-warn">Fortnite is not running: FPS will be Unavailable. CPU/GPU/RAM/Ping are still recorded.</div>}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-ghost py-3" disabled={!!running} onClick={() => run('before')}>{running === 'before' ? <Loader2 size={16} className="animate-spin" /> : <Timer size={16} />} BEFORE</button>
            <button className="btn-primary py-3" disabled={!!running} onClick={() => run('after')}>{running === 'after' ? <Loader2 size={16} className="animate-spin" /> : <Timer size={16} />} AFTER</button>
          </div>
          {prog && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-muted"><span>Recording...</span><span className="num">{prog.elapsedSec}/{prog.durationSec}s</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-neon transition-all" style={{ width: `${(prog.elapsedSec / prog.durationSec) * 100}%` }} /></div></div>}
          {err && <div className="mt-3 text-sm text-bad">{err}</div>}
        </Card>

        <Card title="Comparison (latest before vs latest after)">
          {!before && !after ? <Empty>No benchmarks yet.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="label text-left"><th className="pb-2">Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
              <tbody>{ROWS.map((row) => {
                const b = before ? row.get(before) : null; const a = after ? row.get(after) : null;
                const delta = a !== null && b !== null ? a - b : null;
                const pct = delta !== null && b ? (delta / b) * 100 : null;
                const better = delta === null || Math.abs(delta) < 1e-9 ? null : (delta > 0) === row.higherBetter;
                return (
                  <tr key={row.k} className="border-t border-line/60">
                    <td className="py-2 font-semibold text-white">{row.k}</td>
                    <td className={`num ${b === null ? 'text-xs text-[#56625b]' : ''}`}>{fmt(b, row.d, row.unit)}</td>
                    <td className={`num ${a === null ? 'text-xs text-[#56625b]' : ''}`}>{fmt(a, row.d, row.unit)}</td>
                    <td className={`num ${better === null ? 'text-muted' : better ? 'text-neon' : 'text-bad'}`}>{delta === null ? '-' : `${delta > 0 ? '+' : ''}${delta.toFixed(row.d)}${row.unit}${pct !== null && Number.isFinite(pct) ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)` : ''}`}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          {before && after && before.fortniteRunning !== after.fortniteRunning && <div className="mt-3 text-xs text-warn">The two runs were not made under comparable conditions (Fortnite running in only one of them).</div>}
        </Card>
      </div>

      <Card className="mt-6" title="History" right={list.length > 0 && <button className="btn-ghost !py-1 text-xs" onClick={async () => { if (confirm('Delete all benchmark results?')) { await api().benchClear(); setList([]); } }}><Trash2 size={13} /> Clear</button>}>
        {list.length === 0 ? <Empty>Results are stored locally on this PC.</Empty> : (
          <div className="space-y-2">{list.map((r) => (
            <div key={r.id} className="flex items-center gap-4 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-sm">
              <Badge tone={r.label === 'after' ? 'good' : 'muted'}>{r.label.toUpperCase()}</Badge>
              <span className="text-muted">{new Date(r.ts).toLocaleString()}</span>
              <span>{r.durationSec}s</span>
              <span className="num">FPS {fmt(r.avgFps)}</span><span className="num">1% {fmt(r.low1)}</span><span className="num">Ping {fmt(r.pingAvg, 1, ' ms')}</span>
              {r.notes.map((n) => <span key={n} className="text-xs text-warn">{n}</span>)}
            </div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}
