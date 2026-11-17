import { useEffect, useMemo, useState } from 'react';
import type { ProcessInfo } from '../../shared/types';
import { api, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, LiveChart, PageHeader, Ring, Stat } from '../components/ui';

export default function Ram({ onAutoBoost, embedded }: { onAutoBoost: () => void; embedded?: boolean }) {
  const { live, info, history } = useApp();
  const [procs, setProcs] = useState<ProcessInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => api().processes().then((p) => alive && setProcs(p)).catch(() => undefined);
    load(); const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const chart = useMemo(() => history.map((h, i) => ({ i, ram: h.ram })), [history]);
  const r = live?.ram;
  const m = live?.mem ?? null;
  const closable = procs.filter((p) => p.category === 'closable');
  const closableMB = closable.reduce((a, p) => a + p.memMB, 0);
  const fn = live?.fortnite.memMB ?? null;
  const totalGB = info ? info.ram.totalMB / 1024 : null;

  // Is RAM limiting Fortnite? Evidence-based verdict.
  const verdict = (() => {
    if (!r) return null;
    const ev: string[] = [`${r.percent.toFixed(0)}% in use, ${gb(r.availableMB)} available.`];
    if (m?.pagesPerSec != null) ev.push(`Paging: ${m.pagesPerSec.toFixed(0)} pages/s (hard faults ${m.pageReadsPerSec?.toFixed(0) ?? '-'} reads/s).`);
    if (m?.commitPct != null) ev.push(`Committed memory ${m.commitPct.toFixed(0)}% of the commit limit.`);
    if (info?.ram.channelsHint === 'single') return { tone: 'bad' as const, title: 'Memory layout is limiting performance', ev: [...ev, info.ram.channelEvidence ?? ''] };
    if (r.percent >= 90 || (m?.pagesPerSec ?? 0) >= 1000) return { tone: 'bad' as const, title: 'Memory pressure: Windows is paging to disk', ev };
    if (r.percent >= 75) return { tone: 'warn' as const, title: 'Memory is getting tight', ev: [...ev, `Closable apps hold ${gb(closableMB)}.`] };
    return { tone: 'good' as const, title: `${totalGB ? totalGB.toFixed(0) + ' GB is' : 'Memory is'} not limiting performance right now`, ev };
  })();

  return (
    <div className="animate-fadeUp">
      {!embedded && <PageHeader title="RAM" subtitle="Memory analysis." />}

      <div className="grid grid-cols-[300px_1fr] gap-6">
        <div className="card flex flex-col items-center justify-center gap-2 p-6">
          <Ring value={r?.percent ?? null} label="Memory in use" sub={r ? gb(r.usedMB) : undefined} size={180} />
          <div className="text-sm text-muted">{r ? `of ${gb(r.totalMB)}` : ''}</div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Total" value={r ? gb(r.totalMB) : null} />
          <Stat label="Available" value={r ? gb(r.availableMB) : null} tone={r && r.availableMB < 3000 ? 'warn' : 'default'} />
          <Stat label="Used" value={r ? gb(r.usedMB) : null} sub={r ? `${r.percent.toFixed(0)}%` : undefined} />
          <Stat label="Fortnite" value={fn !== null ? gb(fn) : null} sub={live?.fortnite.running ? 'working set' : 'not running'} />
          <Stat label="Paging activity" value={m?.pagesPerSec != null ? fmt(m.pagesPerSec) : null} unit="pages/s" tone={(m?.pagesPerSec ?? 0) >= 1000 ? 'bad' : 'default'} sub="high values cause stutter" />
          <Stat label="Hard faults" value={m?.pageReadsPerSec != null ? fmt(m.pageReadsPerSec) : null} unit="reads/s" />
          <Stat label="Commit charge" value={m?.commitPct != null ? fmt(m.commitPct) : null} unit="%" />
          <Stat label="Page file usage" value={m?.pageFileUsagePct != null ? fmt(m.pageFileUsagePct) : null} unit="%" />
        </div>
      </div>

      {verdict && (
        <div className={`card mt-6 p-5 ${verdict.tone === 'bad' ? 'border-bad/40' : verdict.tone === 'warn' ? 'border-warn/40' : 'border-neon/30'}`}>
          <div className="flex items-center gap-3"><Badge tone={verdict.tone}>{verdict.tone === 'good' ? 'OK' : verdict.tone === 'warn' ? 'WATCH' : 'PROBLEM'}</Badge><span className="font-display text-lg font-bold tracking-wide text-white">{verdict.title}</span></div>
          <ul className="mt-2 space-y-0.5 text-sm text-[#cfc3e3]">{verdict.ev.filter(Boolean).map((e) => <li key={e}>• {e}</li>)}</ul>
        </div>
      )}

      <div className="mt-6 grid grid-cols-[1.2fr_1fr] gap-6">
        <Card title="Memory modules">
          {info?.ram.modules.length ? (
            <table className="w-full text-sm">
              <thead><tr className="label text-left"><th className="pb-2">Slot</th><th>Size</th><th>Type</th><th>Running at</th><th>Rated (JEDEC)</th></tr></thead>
              <tbody>{info.ram.modules.map((mm, i) => (
                <tr key={i} className="border-t border-line/60"><td className="py-2 text-white">{mm.slot ?? `Module ${i + 1}`}</td><td className="num">{(mm.sizeMB / 1024).toFixed(0)} GB</td><td>{mm.type ?? '-'}</td><td className="num">{mm.speedMHz ? `${mm.speedMHz} MT/s` : '-'}</td><td className="num text-muted">{mm.ratedMHz ? `${mm.ratedMHz} MT/s` : '-'}</td></tr>
              ))}</tbody>
            </table>
          ) : <div className="text-sm text-muted">Module information unavailable on this system.</div>}
          <div className="mt-3 flex items-start gap-2 text-sm">
            {info?.ram.channelsHint === 'single' ? <Badge tone="bad">SINGLE CHANNEL</Badge> : info?.ram.channelsHint ? <Badge tone="good">DUAL CHANNEL</Badge> : <Badge tone="muted">CHANNELS UNKNOWN</Badge>}
            <span className="text-[#cfc3e3]">{info?.ram.channelEvidence}</span>
          </div>
          <p className="mt-3 text-xs text-muted">If "Running at" equals the JEDEC default (e.g. 4800 MT/s for DDR5) and your kit is rated faster, enable XMP in BIOS. TWECD never changes BIOS settings.</p>
        </Card>
        <Card title="Memory over time"><LiveChart data={chart} series={[{ key: 'ram', name: 'RAM', color: '#7dd3fc' }]} height={230} /></Card>
      </div>

      <Card className="mt-6" title="Memory-heavy apps" right={<button className="btn-ghost !py-1.5 text-sm" onClick={onAutoBoost}>Set up Auto-Boost</button>}>
        <div className="mb-3 text-sm text-muted">Closable apps currently use <b className="text-white">{gb(closableMB)}</b>. Close them before playing, or let Auto-Boost close the ones you choose when Fortnite starts.</div>
        <div className="grid grid-cols-2 gap-x-8">
          {procs.slice(0, 20).map((p) => (
            <div key={p.pid} className="flex items-center gap-3 border-b border-line/60 py-1.5 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              {p.category !== 'other' && <Badge tone={p.category === 'closable' ? 'warn' : p.category === 'game' ? 'good' : 'muted'}>{p.category}</Badge>}
              <span className="num w-20 text-right text-muted">{p.memMB.toFixed(0)} MB</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
