import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Radio, Trash2, Wifi } from 'lucide-react';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { NetContext, NetTarget, NetTargetResult } from '../../shared/types';
import { api, errMsg, fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, Empty, PageHeader, Stat } from '../components/ui';

const COLORS = ['#39FF14', '#18C77A', '#7dd3fc', '#ffb020', '#c084fc', '#f472b6', '#facc15', '#fb7185', '#a3e635'];

export default function Network() {
  const { lastNet, setLastNet } = useApp();
  const [targets, setTargets] = useState<NetTarget[]>([]);
  const [count, setCount] = useState(20);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Record<string, (number | null)[]>>({});
  const [ctx, setCtx] = useState<NetContext | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nl, setNl] = useState(''); const [nh, setNh] = useState('');

  useEffect(() => { api().settingsGet().then((s) => setTargets(s.netTargets)); api().netContext().then(setCtx); }, []);
  useEffect(() => api().onNetProgress((p) => setLive((l) => ({ ...l, [p.host]: [...(l[p.host] ?? []), p.latency] }))), []);

  const saveTargets = (t: NetTarget[]) => { setTargets(t); api().settingsSet({ netTargets: t }).catch((e) => setErr(errMsg(e))); };
  const run = async () => {
    setRunning(true); setErr(null); setLive({});
    try { setLastNet(await api().netTest({ targets, count })); } catch (e) { setErr(errMsg(e)); } finally { setRunning(false); }
  };

  const r = lastNet;
  const all: NetTargetResult[] = r ? [...(r.gatewayResult ? [r.gatewayResult] : []), ...r.results] : [];
  const hosts = running ? Object.keys(live) : all.map((a) => a.host);
  const series = running ? live : Object.fromEntries(all.map((a) => [a.host, a.samples]));
  const labelOf = (h: string) => all.find((a) => a.host === h)?.label ?? targets.find((t) => t.host === h)?.label ?? (h === (ctx?.gateway ?? '') ? 'Your router' : h);
  const chart = useMemo(() => {
    const n = Math.max(0, ...Object.values(series).map((s) => s.length));
    return Array.from({ length: n }, (_, i) => Object.fromEntries([['i', i + 1], ...hosts.map((h) => [h, series[h]?.[i] ?? null])]));
  }, [series, hosts]);
  const ext = r?.results.filter((x) => x.received > 0) ?? [];
  const best = ext.length ? ext.reduce((a, b) => ((a.avg ?? 1e9) < (b.avg ?? 1e9) ? a : b)) : null;
  const dTone = { healthy: 'good', wifi: 'warn', 'local-network': 'warn', isp: 'bad', destination: 'info', inconclusive: 'muted' } as const;

  return (
    <div className="animate-fadeUp">
      <PageHeader title="PING & NETWORK" subtitle="Real ICMP measurements to the destinations you choose. Finds whether latency comes from Wi-Fi, your local network, your ISP, or the destination. Nothing on your router is changed."
        right={<button className="btn-primary px-6" onClick={run} disabled={running || !targets.length}>{running ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />} {running ? 'TESTING...' : 'RUN NETWORK TEST'}</button>} />
      {err && <div className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</div>}

      <div className="grid grid-cols-6 gap-3">
        <Stat label="Connection" value={ctx ? (ctx.connectionType === 'wired' ? 'Ethernet' : ctx.connectionType === 'wireless' ? 'Wi-Fi' : null) : null} sub={ctx?.interfaceName ?? undefined} tone={ctx?.connectionType === 'wireless' ? 'warn' : 'default'} />
        <Stat label="Avg Ping" value={best ? fmt(best.avg, 1) : null} unit="ms" tone="neon" sub={best ? best.label : undefined} />
        <Stat label="Min / Max" value={best ? `${fmt(best.min, 0)} / ${fmt(best.max, 0)}` : null} unit="ms" />
        <Stat label="Jitter" value={best ? fmt(best.jitter, 1) : null} unit="ms" />
        <Stat label="Packet Loss" value={best ? fmt(best.lossPct, 0) : null} unit="%" tone={best && best.lossPct > 0 ? 'warn' : 'default'} />
        <Stat label="Wi-Fi Signal" value={ctx?.wifiSignalPct != null ? String(ctx.wifiSignalPct) : null} unit="%" />
      </div>

      {r && (
        <div className="card mt-6 flex items-start gap-4 p-5">
          <Wifi className="mt-1 text-neon" />
          <div className="flex-1"><div className="flex items-center gap-2"><span className="font-display text-lg font-bold tracking-wide text-white">{r.diagnosis.title}</span><Badge tone={dTone[r.diagnosis.source]}>{r.diagnosis.source.toUpperCase()}</Badge></div><div className="mt-1 text-sm text-[#c3cdc7]">{r.diagnosis.explanation}</div></div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-[1fr_360px] gap-6">
        <Card title="Latency per probe (ms) - gaps are lost packets">
          {chart.length === 0 ? <Empty>Run a test to see the stability graph.</Empty> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chart} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#16201b" vertical={false} />
                <XAxis dataKey="i" tick={{ fill: '#5d6a63', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5d6a63', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={{ background: '#0d1210', border: '1px solid #1c2621', borderRadius: 10 }} formatter={(v: number, n: string) => [`${v} ms`, labelOf(n)]} labelFormatter={(l) => `Probe ${l}`} />
                <Legend formatter={(v: string) => <span className="text-xs text-muted">{labelOf(v)}</span>} />
                {hosts.map((h, i) => <Line key={h} type="monotone" dataKey={h} stroke={COLORS[i % COLORS.length]} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />)}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Test destinations">
          <div className="space-y-2">
            {targets.map((t, i) => (
              <div key={t.host + i} className="flex items-center gap-2 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-sm">
                <span className="flex-1"><b className="text-white">{t.label}</b> <span className="text-muted">{t.host}</span></span>
                <button className="text-muted hover:text-bad disabled:opacity-30" disabled={running || targets.length <= 1} onClick={() => saveTargets(targets.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder="Name" className="w-24 rounded-lg border border-line bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-neon/50" />
            <input value={nh} onChange={(e) => setNh(e.target.value)} placeholder="host or IP" className="flex-1 rounded-lg border border-line bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-neon/50" />
            <button className="btn-ghost !px-2 !py-1.5" disabled={!nh.trim() || targets.length >= 8 || running} onClick={() => { saveTargets([...targets, { label: nl.trim() || nh.trim(), host: nh.trim() }]); setNl(''); setNh(''); }}><Plus size={16} /></button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm"><span className="label">Probes</span>
            {[10, 20, 50].map((c) => <button key={c} onClick={() => setCount(c)} className={`chip border ${count === c ? 'border-neon/50 text-neon' : 'border-line text-muted'}`}>{c}</button>)}
          </div>
          <p className="mt-4 text-xs text-muted">Your router is tested automatically. For the real match-server ping, enable "Net Debug Stats" in Fortnite's HUD settings. Changing DNS does not lower in-game ping.</p>
        </Card>
      </div>

      {r && (
        <Card className="mt-6" title="Results">
          <table className="w-full text-sm">
            <thead><tr className="label text-left"><th className="pb-2">Destination</th><th>Avg</th><th>Min</th><th>Max</th><th>Jitter</th><th>Loss</th><th>Replies</th></tr></thead>
            <tbody>{all.map((a) => (
              <tr key={a.host} className="border-t border-line/60">
                <td className="py-2"><b className="text-white">{a.label}</b> <span className="text-muted">{a.host}</span>{a.error && <div className="text-xs text-warn">{a.error}</div>}</td>
                <td className="num">{fmt(a.avg, 1, ' ms')}</td><td className="num">{fmt(a.min, 0, ' ms')}</td><td className="num">{fmt(a.max, 0, ' ms')}</td><td className="num">{fmt(a.jitter, 1, ' ms')}</td>
                <td className={`num ${a.lossPct > 0 ? 'text-warn' : ''}`}>{a.lossPct.toFixed(0)}%</td><td className="num text-muted">{a.received}/{a.sent}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
