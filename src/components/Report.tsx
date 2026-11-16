import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Finding, LoadProfileStats, Severity } from '../../shared/types';
import { Badge, Empty } from './ui';

export function SevIcon({ s }: { s: Severity }) {
  if (s === 'good') return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-neon" />;
  if (s === 'warn') return <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />;
  if (s === 'bad') return <XCircle size={18} className="mt-0.5 shrink-0 text-bad" />;
  return <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />;
}

/** Findings with the structured report: detected issue, evidence, fix, expected effect, risk, rollback. */
export function FindingCard({ f }: { f: Finding }) {
  const structured = !!(f.evidence?.length || f.fix);
  return (
    <div className={`rounded-xl border p-4 ${f.severity === 'bad' ? 'border-bad/30 bg-bad/[0.04]' : f.severity === 'warn' ? 'border-warn/25 bg-warn/[0.03]' : 'border-line bg-panel2/60'}`}>
      <div className="flex gap-3">
        <SevIcon s={f.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-white">{f.title}</span><Badge tone="muted">{f.area}</Badge>{f.risk && <Badge tone={f.risk === 'none' ? 'good' : f.risk === 'low' ? 'info' : 'warn'}>RISK: {f.risk.toUpperCase()}</Badge>}</div>
          <div className="mt-0.5 text-sm text-muted">{f.detail}</div>
          {structured && (
            <div className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
              {f.evidence?.filter(Boolean).length ? <><span className="label pt-0.5">Evidence</span><ul className="space-y-0.5 text-[#c3cdc7]">{f.evidence.filter(Boolean).map((e) => <li key={e}>• {e}</li>)}</ul></> : null}
              {f.fix && <><span className="label pt-0.5">Fix</span><span className="text-white">{f.fix}</span></>}
              {f.expected && <><span className="label pt-0.5">Expected</span><span className="text-[#c3cdc7]">{f.expected}</span></>}
              {f.rollback && <><span className="label pt-0.5">Rollback</span><span className="text-muted">{f.rollback}</span></>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FindingGrid({ items, cols = 2 }: { items: Finding[]; cols?: 1 | 2 }) {
  if (!items.length) return <Empty>Nothing to report.</Empty>;
  return <div className={`grid gap-3 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>{items.map((f) => <FindingCard key={f.id} f={f} />)}</div>;
}

const tone = { low: 'border-sky-400/25', normal: 'border-neon/25', intense: 'border-bad/30' } as const;
export function LoadProfiles({ loads }: { loads: LoadProfileStats[] }) {
  if (!loads.length) return <Empty>Needs at least 30 seconds of measured FPS in a match. Peak FPS in empty scenes is shown separately from real gameplay here.</Empty>;
  return (
    <div className="grid grid-cols-3 gap-3">
      {loads.map((l) => (
        <div key={l.id} className={`rounded-xl border bg-panel2/60 p-4 ${tone[l.id]}`}>
          <div className="label">{l.id === 'low' ? 'Low load mode' : l.id === 'normal' ? 'Normal gameplay mode' : 'Intense combat mode'}</div>
          <div className="text-xs text-muted">{l.label} · {l.seconds} samples</div>
          <div className="num mt-2 text-3xl font-bold text-white">{l.avgFps !== null ? Math.round(l.avgFps) : '-'}<span className="text-sm text-muted"> avg FPS</span></div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-[#c3cdc7]">
            <span>Worst second: <b className="num text-white">{l.worstSecond?.toFixed(0) ?? '-'}</b></span>
            <span>Best second: <b className="num text-white">{l.bestSecond?.toFixed(0) ?? '-'}</b></span>
            <span>Frame p99: <b className="num text-white">{l.avgP99Ms?.toFixed(2) ?? '-'} ms</b></span>
            <span>GPU: <b className="num text-white">{l.avgGpu?.toFixed(0) ?? '-'}%</b> · Core: <b className="num text-white">{l.avgCpu?.toFixed(0) ?? '-'}%</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}
