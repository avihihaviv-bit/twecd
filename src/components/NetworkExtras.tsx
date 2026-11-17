import { useEffect, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import type { AdapterInfo, BufferbloatResult } from '../../shared/types';
import { api, errMsg, fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card } from './ui';

export function Bufferbloat() {
  const [r, setR] = useState<BufferbloatResult | null>(null);
  const [p, setP] = useState<{ phase: string; pct: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => api().onBufferbloatProgress(setP), []);
  const run = async () => {
    if (!confirm('Run the bufferbloat test?\n\nTWECD measures ping, then downloads from Cloudflare\'s public speed-test server for about 12 seconds (roughly 50-150 MB) while measuring ping again. Pause other downloads first.')) return;
    setErr(null); setP({ phase: 'Starting', pct: 0 });
    try { setR(await api().bufferbloat()); } catch (e) { setErr(errMsg(e)); } finally { setP(null); }
  };
  const tone = !r?.grade ? 'muted' : r.grade.startsWith('A') ? 'good' : r.grade === 'B' ? 'info' : r.grade === 'C' ? 'warn' : 'bad';
  return (
    <Card title={<span className="flex items-center gap-2"><Gauge size={14} className="text-purple" /> Bufferbloat (ping under load)</span>} right={<button className="btn-primary !py-2 text-sm" disabled={!!p} onClick={run}>{p ? <><Loader2 size={14} className="animate-spin" /> {p.phase} {p.pct}%</> : 'RUN TEST'}</button>}>
      <p className="mb-3 text-sm text-muted">Lag spikes when someone at home downloads or streams are usually bufferbloat: your router lets queues grow and every packet waits. This test measures it directly.</p>
      {err && <div className="text-sm text-bad">{err}</div>}
      {r && (
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-purple/30 bg-purple/[0.06] p-3"><div className="label">Grade</div><div className={`font-display text-5xl font-extrabold ${tone === 'good' ? 'text-neon' : tone === 'bad' ? 'text-bad' : 'text-lilac'}`}>{r.grade ?? '-'}</div></div>
          <div className="text-sm">
            <div className="grid grid-cols-4 gap-2">
              {[['Idle ping', fmt(r.idleMs, 0, ' ms')], ['Under load', fmt(r.loadedMs, 0, ' ms')], ['Added', fmt(r.addedMs, 0, ' ms')], ['Download', fmt(r.downloadMbps, 0, ' Mbps')]].map(([k, v]) => <div key={k} className="rounded-lg border border-line bg-panel2/60 p-2"><div className="label">{k}</div><div className="num font-bold text-white">{v}</div></div>)}
            </div>
            <div className="mt-2 text-[#cfc3e3]">{r.advice}</div>
            <Badge tone={tone}>{r.loadedLossPct != null ? `${r.loadedLossPct.toFixed(0)}% packet loss under load` : 'loss unknown'}</Badge>
          </div>
        </div>
      )}
    </Card>
  );
}

export function AdapterCard() {
  const [a, setA] = useState<AdapterInfo[] | null>(null);
  useEffect(() => { api().adapters().then(setA).catch(() => setA([])); }, []);
  return (
    <Card title="Network adapter">
      {a === null ? <div className="text-sm text-muted">Reading...</div> : a.length === 0 ? <div className="text-sm text-muted">No active wired/wireless adapter reported (Windows only).</div> : a.map((x) => {
        const eee = x.power.filter((p) => /energy|green|power saving|idle power/i.test(p.name) && !/disabled|off/i.test(p.value));
        return (
          <div key={x.name} className="space-y-2 text-sm">
            <div><b className="text-white">{x.description}</b> <span className="text-muted">({x.name})</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[['Link speed', x.linkSpeed], ['Driver', x.driverVersion ?? '-'], ['Driver date', x.driverDate ? String(x.driverDate).slice(0, 10) : '-']].map(([k, v]) => <div key={k} className="rounded-lg border border-line bg-panel2/60 p-2"><div className="label">{k}</div><div className="num text-white">{v}</div></div>)}
            </div>
            {/1 gbps|2\.5 gbps/i.test(x.linkSpeed) ? null : /mbps/i.test(x.linkSpeed) && <div className="text-warn">Link is below 1 Gbps: check the cable (Cat5e or better) and the router port.</div>}
            {x.power.length > 0 && <div className="flex flex-wrap gap-1.5">{x.power.map((p) => <Badge key={p.name} tone={/energy|green|power saving|idle power/i.test(p.name) && !/disabled|off/i.test(p.value) ? 'warn' : 'muted'}>{p.name}: {p.value}</Badge>)}</div>}
            {eee.length > 0 && <div className="text-[#cfc3e3]">Power-saving Ethernet features are on ({eee.map((e) => e.name).join(', ')}). On some Realtek adapters they add latency spikes. To turn them off: Device Manager &gt; Network adapters &gt; your adapter &gt; Advanced &gt; set each to Disabled. Your connection drops for 2-3 seconds while it applies.</div>}
          </div>
        );
      })}
    </Card>
  );
}

export function LatencySplit() {
  const { live } = useApp();
  return (
    <Card title="Ping vs local input delay: two different things">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl border border-purple/30 bg-purple/[0.05] p-3"><div className="label">Network ping (to the internet)</div><div className="num mt-1 text-2xl font-bold text-white">{fmt(live?.net?.latency ?? null, 0, ' ms')}</div><div className="mt-1 text-muted">Set by distance to the server, your ISP and your home network. Lowered by the right region, Ethernet, and fixing bufferbloat. DNS does not change it.</div></div>
        <div className="rounded-xl border border-neon/30 bg-neon/[0.04] p-3"><div className="label">Local render latency (PresentMon)</div><div className="num mt-1 text-2xl font-bold text-neon">{fmt(live?.fps?.displayLatencyMs ?? null, 1, ' ms')}</div><div className="mt-1 text-muted">Time from the CPU starting a frame to it reaching the screen. Lowered by higher FPS, NVIDIA Reflex On + Boost and VSync off. Shown while Fortnite runs.</div></div>
      </div>
    </Card>
  );
}
