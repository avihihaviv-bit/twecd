import { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Play, RefreshCw, XCircle } from 'lucide-react';
import type { FortniteConfigReport, SessionSummary } from '../../shared/types';
import { api, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, Empty, PageHeader, Stat } from '../components/ui';

export default function Fortnite() {
  const { live, info } = useApp();
  const [cfg, setCfg] = useState<FortniteConfigReport | null>(null);
  const [sess, setSess] = useState<{ current: SessionSummary | null; last: SessionSummary | null }>({ current: null, last: null });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api().fortniteConfig().then(setCfg);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => api().session().then(setSess), 2000);
    api().session().then(setSess);
    return () => clearInterval(t);
  }, []);
  const running = live?.fortnite.running ?? false;
  const s = sess.current ?? sess.last;
  const vramPct = live?.gpu?.vramUsedMB != null && live.gpu.vramTotalMB ? (live.gpu.vramUsedMB / live.gpu.vramTotalMB) * 100 : null;

  return (
    <div className="animate-fadeUp">
      <PageHeader title="FORTNITE EXTREME MODE" subtitle="Detects Fortnite automatically, measures it while you play, and recommends settings for maximum stable FPS. TWECD never touches game files, game memory or anti-cheat."
        right={<button className="btn-primary px-6" disabled={!info?.isWindows} onClick={async () => setMsg((await api().launchFortnite()).message)}><Play size={16} /> START FORTNITE</button>} />
      {msg && <div className="-mt-3 mb-4 text-sm text-neon2">{msg}</div>}

      <div className={`card mb-6 flex items-center gap-4 p-5 ${running ? 'border-neon/40' : ''}`}>
        <span className={`h-3 w-3 rounded-full ${running ? 'bg-neon shadow-neon animate-pulse' : 'bg-[#3a4840]'}`} />
        <div className="flex-1">
          <div className="font-display text-lg font-bold tracking-wider text-white">{running ? 'FORTNITE DETECTED' : 'FORTNITE NOT RUNNING'}</div>
          <div className="text-sm text-muted">{running ? `PID ${live?.fortnite.pid} · ${live?.fpsStatus}` : 'Monitoring starts automatically when the game launches. Keep TWECD open or minimized.'}</div>
        </div>
        {running && <Badge tone="good">LIVE</Badge>}
      </div>

      <div className="grid grid-cols-6 gap-3">
        <Stat label="FPS" value={running && live?.fps ? fmt(live.fps.fps) : null} tone="neon" />
        <Stat label="1% Low" value={running && live?.fps ? fmt(live.fps.low1) : null} />
        <Stat label="Stability" value={running && live?.fps ? String(live.fps.stabilityScore) : null} unit="/100" />
        <Stat label="CPU / GPU" value={running && live ? `${live.cpu.usage.toFixed(0)} / ${live.gpu?.usage?.toFixed(0) ?? '-'}` : null} unit="%" />
        <Stat label="VRAM" value={running && vramPct !== null ? vramPct.toFixed(0) : null} unit="%" />
        <Stat label="Fortnite RAM" value={running ? gb(live?.fortnite.memMB) : null} />
      </div>

      <div className="mt-6 grid grid-cols-[1.4fr_1fr] gap-6">
        <Card title="Recommended graphics settings (RTX 5060 + i5-14600K)" right={<button className="btn-ghost !py-1 text-xs" onClick={load}><RefreshCw size={13} /> Re-read</button>}>
          {!cfg ? <Empty>Loading...</Empty> : !cfg.found ? <Empty>{cfg.notes[0]}<div className="mt-1 text-xs">{cfg.path}</div></Empty> : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="label text-left"><th className="pb-2">Setting</th><th className="pb-2">Current</th><th className="pb-2">Recommended</th><th /></tr></thead>
                <tbody>
                  {cfg.settings.map((s) => (
                    <tr key={s.key} className="border-t border-line/60" title={s.note}>
                      <td className="py-2 font-semibold text-white">{s.label}</td>
                      <td className={`py-2 ${s.current === null ? 'text-[#56625b]' : ''}`}>{s.current ?? 'Not set'}</td>
                      <td className="py-2 text-neon2">{s.recommended}</td>
                      <td className="py-2 text-right">{s.ok === true ? <CheckCircle2 size={16} className="inline text-neon" /> : s.ok === false ? <XCircle size={16} className="inline text-warn" /> : <HelpCircle size={16} className="inline text-muted" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 text-xs text-muted">{cfg.notes.map((n) => <div key={n}>• {n}</div>)}<div className="truncate">File: {cfg.path}</div></div>
            </>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Performance Mode">
            <ul className="space-y-2 text-sm text-[#c3cdc7]">
              <li><b className="text-white">Rendering Mode: Performance</b> - the highest-FPS mode in Fortnite; lowest CPU and VRAM cost. Needs a game restart.</li>
              <li><b className="text-white">3D Resolution 100%</b>, View Distance Medium/Far, Textures Medium, Meshes Low.</li>
              <li><b className="text-white">Frame Rate Limit: Unlimited</b> while chasing max FPS. If frame times swing, cap ~10% below your average.</li>
              <li><b className="text-white">NVIDIA Reflex: On + Boost</b>, VSync Off, Motion Blur Off.</li>
              <li><b className="text-white">DirectX 12 mode</b> instead, if you prefer better visuals: expect lower FPS and first-match shader compilation stutter.</li>
            </ul>
          </Card>
          <Card title={sess.current ? 'Current session' : 'Last session'}>
            {!s ? <Empty>No session recorded yet. Play a match and it appears here.</Empty> : (
              <>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <KV k="Duration" v={`${Math.floor(s.durationSec / 60)}m ${s.durationSec % 60}s`} />
                  <KV k="Avg FPS" v={fmt(s.avgFps)} />
                  <KV k="1% Low" v={fmt(s.low1)} />
                  <KV k="Avg CPU" v={fmt(s.avgCpu, 0, '%')} />
                  <KV k="Avg GPU" v={fmt(s.avgGpu, 0, '%')} />
                  <KV k="Peak VRAM" v={gb(s.peakVramMB)} />
                </div>
                <div className="label mb-2 mt-4">Performance drops ({s.drops.length})</div>
                <div className="max-h-[180px] space-y-2 overflow-y-auto">
                  {s.drops.length === 0 ? <div className="text-sm text-muted">None detected.</div> : s.drops.slice().reverse().map((d) => (
                    <div key={d.ts} className="rounded-lg border border-line bg-panel2/60 p-2 text-xs">
                      <div className="flex justify-between"><span className="font-semibold text-white">{d.detail}</span><span className="text-muted">{new Date(d.ts).toLocaleTimeString()}</span></div>
                      <div className="text-warn">{d.likelyCause}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
const KV = ({ k, v }: { k: string; v: string }) => <div className="rounded-lg border border-line bg-panel2/60 p-2"><div className="label">{k}</div><div className={`num font-bold ${v === 'Unavailable' ? 'text-xs text-[#56625b]' : 'text-white'}`}>{v}</div></div>;
