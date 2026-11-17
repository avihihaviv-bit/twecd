import { useEffect, useState } from 'react';
import { Globe2, Loader2, Unplug } from 'lucide-react';
import type { PingKiller, RegionResult } from '../../shared/types';
import { api, errMsg, fmt } from '../lib/api';
import { Badge, Card } from './ui';

const bestOf = (r: RegionResult[]) => r.filter((x) => x.median !== null && x.lossPct < 50).sort((a, b) => (Math.abs(a.median! - b.median!) <= 5 ? (a.jitter ?? 0) - (b.jitter ?? 0) : a.median! - b.median!))[0] ?? null;

/** Measures every Fortnite matchmaking region and recommends the lowest-latency one. */
export function RegionFinder() {
  const [res, setRes] = useState<RegionResult[] | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; reason: string | null }>({ ok: true, reason: null });
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => api().onRegionProgress(setProg), []);
  const run = async () => { setErr(null); setProg({ done: 0, total: 1 }); try { const r = await api().regionTest(); setRes(r.results); setCheck({ ok: r.ok, reason: r.reason }); } catch (e) { setErr(errMsg(e)); } finally { setProg(null); } };
  const best = res && check.ok ? bestOf(res) : null;
  const sorted = res ? [...res].sort((a, b) => (a.median ?? 1e9) - (b.median ?? 1e9)) : [];
  const max = Math.max(1, ...sorted.map((r) => r.median ?? 0));
  return (
    <Card title={<span className="flex items-center gap-2"><Globe2 size={14} className="text-purple" /> Fortnite region finder</span>}
      right={<button className="btn-primary !py-2 text-sm" onClick={run} disabled={!!prog}>{prog ? <Loader2 size={15} className="animate-spin" /> : <Globe2 size={15} />} {prog ? `Testing ${Math.round((prog.done / prog.total) * 100)}%` : 'FIND MY BEST REGION'}</button>}>
      <p className="mb-4 text-sm text-muted">The biggest ping saving usually comes from playing on the closest region. "Auto" in Fortnite does not always pick it. TWECD measures the connection to the cloud datacenter area of each Fortnite region (6 handshakes each) and ranks them.</p>
      {err && <div className="mb-3 text-sm text-bad">{err}</div>}
      {res && !check.ok && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/[0.06] p-4 text-sm">
          <div className="font-display font-bold tracking-wide text-warn">MEASUREMENT NOT RELIABLE: NO RECOMMENDATION</div>
          <div className="mt-1 text-[#e8dcc4]">{check.reason}</div>
        </div>
      )}
      {best && (
        <div className="mb-4 rounded-xl border border-neon/40 bg-neon/[0.05] p-4">
          <div className="label">Recommended</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-wide text-neon">{best.name} <span className="num text-lg text-white">~{best.median!.toFixed(0)} ms</span></div>
          <div className="mt-1 text-sm text-[#cfc3e3]">In Fortnite: <b className="text-white">Settings &gt; Game &gt; Matchmaking Region &gt; {best.name}</b>. This setting is stored on Epic's servers, so you set it once in-game. Check the exact match ping with <b className="text-white">Net Debug Stats</b> (Settings &gt; Game UI).</div>
        </div>
      )}
      {sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((r) => (
            <div key={r.id} className="grid grid-cols-[150px_1fr_220px] items-center gap-3 text-sm">
              <span className={r.id === best?.id ? 'font-semibold text-neon' : 'text-white'}>{r.name} <span className="text-xs text-muted">{r.location}</span></span>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/5">{r.median !== null && <div className={`h-full rounded-full ${r.id === best?.id ? 'bg-neon' : 'bg-gradient-to-r from-purple2 to-purple'}`} style={{ width: `${(r.median / max) * 100}%` }} />}</div>
              <span className="num text-right text-xs text-[#cfc3e3]">{r.median !== null ? `${r.median.toFixed(0)} ms · best ${fmt(r.best, 0)} · jitter ${fmt(r.jitter, 1)}` : 'No response'}{r.lossPct > 0 && r.median !== null ? ` · ${r.lossPct.toFixed(0)}% lost` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Finds apps that eat bandwidth in the background. */
export function PingKillers({ wireless }: { wireless: boolean }) {
  const [list, setList] = useState<PingKiller[] | null>(null);
  const load = () => api().pingKillers().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return (
    <Card title={<span className="flex items-center gap-2"><Unplug size={14} className="text-purple" /> Ping killers on this PC</span>} right={<button className="btn-ghost !py-1.5 text-sm" onClick={load}>Re-check</button>}>
      <div className="space-y-2 text-sm">
        {wireless && <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/[0.05] p-3"><Badge tone="warn">WI-FI</Badge><span className="text-[#cfc3e3]">You are on Wi-Fi. An <b className="text-white">Ethernet cable</b> is the single biggest fix for ping spikes and packet loss; no software setting can match it.</span></div>}
        {list === null ? <div className="text-muted">Checking...</div> : list.length === 0 ? <div className="text-neon2">No bandwidth-heavy background apps are running.</div> : list.map((k) => (
          <div key={k.name} className="flex items-center gap-3 rounded-lg border border-line bg-panel2/60 p-3">
            <span className="w-44 font-semibold text-white">{k.name}</span>
            <span className="flex-1 text-[#cfc3e3]">{k.reason}</span>
            {k.closable && <Badge tone="info">Auto-Boost can close it</Badge>}
          </div>
        ))}
        <div className="pt-1 text-xs text-muted">Also pause downloads and video streams on other devices at home while you play. TWECD does not change router settings.</div>
      </div>
    </Card>
  );
}
