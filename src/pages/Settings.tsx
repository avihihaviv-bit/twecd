import { useEffect, useState } from 'react';
import { FolderOpen, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Settings as S, UpdateStatus } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, PageHeader } from '../components/ui';
import { AutoModeCard } from '../components/AutoModeCard';

export default function Settings() {
  const { info, refreshInfo } = useApp();
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{ exe: string; name: string }[]>([]);
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' });
  useEffect(() => { api().updateGet().then(setUpd); return api().onUpdateStatus(setUpd); }, []);
  const [pingHost, setPingHost] = useState('');
  useEffect(() => { api().closableCatalog().then(setCatalog); }, []);
  const reload = () => { api().settingsGet().then(setS); };
  useEffect(reload, []);
  const patch = async (p: Partial<S>) => { try { setS(await api().settingsSet(p)); } catch (e) { setMsg(errMsg(e)); } };

  return (
    <div className="animate-fadeUp">
      <PageHeader title="SETTINGS" subtitle="Auto Mode, FPS capture, monitoring and updates. Backups and undo are on the Restore & Backup page." />
      <div className="mb-6"><AutoModeCard /></div>
      <div className="grid grid-cols-2 gap-6">
        <Card title="FPS capture (PresentMon)">
          <div className="text-sm">
            Status: {info?.presentMon.available ? <Badge tone="good">Installed</Badge> : <Badge tone="warn">Not found</Badge>}
            <div className="mt-1 truncate text-xs text-muted">{info?.presentMon.path ?? 'Bundled with the installer. For development builds select PresentMon.exe manually.'}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost text-sm" onClick={async () => { setS(await api().pickPresentMon()); refreshInfo(); }}><FolderOpen size={15} /> Select PresentMon.exe</button>
            <button className="btn-ghost text-sm" onClick={() => api().openExternal('https://github.com/GameTechDev/PresentMon/releases')}>Download page</button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            {info?.isAdmin ? <><ShieldCheck size={16} className="text-neon" /> Running as administrator: FPS capture enabled.</> : <><ShieldAlert size={16} className="text-warn" /> FPS capture uses Windows ETW and needs administrator rights.</>}
          </div>
          {!info?.isAdmin && info?.isWindows && <button className="btn-ghost mt-2 text-sm" onClick={async () => setMsg((await api().relaunchAdmin()).message)}>Restart as administrator</button>}
          {msg && <div className="mt-2 text-sm text-neon2">{msg}</div>}
        </Card>

        <Card title="Monitoring">
          {s && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2"><span className="label w-40">Update interval</span>
                {[500, 1000, 2000].map((v) => <button key={v} onClick={() => patch({ monitorIntervalMs: v })} className={`chip border ${s.monitorIntervalMs === v ? 'border-neon/50 text-neon' : 'border-line text-muted'}`}>{v / 1000}s</button>)}
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-purple/30 bg-purple/[0.05] p-3">
                <input id="record-matches" type="checkbox" className="mt-1 accent-[#B44CFF]" checked={s.recordMatches} onChange={(e) => patch({ recordMatches: e.target.checked })} />
                <span><b className="text-white">Record every match</b> (FPS analysis, bottleneck report, auto-lock, Tuner)
                  <span className="block text-xs text-muted">Off by default: frame capture runs on every frame and costs some CPU while you play. When off, TWECD measures only while you look at it, during Benchmarks and in the Experiments Lab.</span></span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="accent-[#39FF14]" checked={s.trackFortniteWhileMinimized} onChange={(e) => patch({ trackFortniteWhileMinimized: e.target.checked })} />
                Keep recording Fortnite sessions while TWECD is minimized (light 2 s sampling)
              </label>
              <div className="flex items-center gap-2"><span className="label w-40">Live ping host</span>
                <input id="live-ping-host" value={pingHost || s.livePingHost} onChange={(e) => setPingHost(e.target.value)} className="w-44 rounded-lg border border-line bg-black/30 px-2 py-1 text-sm outline-none focus:border-neon/50" />
                <button className="btn-ghost !py-1 text-xs" disabled={!pingHost || pingHost === s.livePingHost} onClick={() => { patch({ livePingHost: pingHost.trim() }); setPingHost(''); }}>Save</button>
              </div>
              <p className="text-xs text-muted">When the window is minimized, all other monitoring stops to keep TWECD lightweight. While Fortnite runs, only a 2 s sampler and one ping every 2 s stay active.</p>
            </div>
          )}
        </Card>

        <Card title="Auto-Boost when Fortnite starts" className="col-span-2">
          {s && (
            <>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input id="auto-boost" type="checkbox" className="accent-[#39FF14]" checked={s.autoBoost} onChange={(e) => patch({ autoBoost: e.target.checked })} />
                <span><b className="text-white">Close these apps automatically as soon as Fortnite starts</b><span className="block text-xs text-muted">Frees CPU and RAM for steadier FPS. Only apps you tick are closed; Windows, drivers and anti-cheat are never touched. Save your work in them before playing.</span></span>
              </label>
              <div className={`mt-4 grid grid-cols-4 gap-2 ${s.autoBoost ? '' : 'pointer-events-none opacity-40'}`}>
                {(() => { const seen = new Set<string>(); return catalog.filter((c) => !seen.has(c.name) && seen.add(c.name)); })().map((c) => {
                  const exes = catalog.filter((x) => x.name === c.name).map((x) => x.exe);
                  const on = exes.some((x) => s.autoBoostApps.includes(x));
                  return (
                    <label key={c.name} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-neon/40 bg-neon/[0.05]' : 'border-line bg-black/20'}`}>
                      <input type="checkbox" className="accent-[#39FF14]" checked={on} onChange={() => patch({ autoBoostApps: on ? s.autoBoostApps.filter((x) => !exes.includes(x)) : [...new Set([...s.autoBoostApps, ...exes])] })} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <Card title="Updates">
          {s && (
            <div className="space-y-3 text-sm">
              <label className="flex cursor-pointer items-center gap-3"><input id="auto-check-updates" type="checkbox" className="accent-[#39FF14]" checked={s.autoCheckUpdates} onChange={(e) => patch({ autoCheckUpdates: e.target.checked })} /> Check for updates when TWECD starts (nothing is downloaded without your click)</label>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-ghost text-sm" disabled={upd.state === 'checking' || upd.state === 'downloading'} onClick={() => { setUpd({ state: 'checking' }); api().updateCheck().then(setUpd).catch((e) => setUpd({ state: 'error', message: errMsg(e) })); }}>Check now</button>
                {upd.state === 'available' && <button className="btn-primary text-sm" onClick={() => api().updateDownload().catch((e) => setUpd({ state: 'error', message: errMsg(e) }))}>Download v{upd.version}</button>}
                {upd.state === 'error' && <button className="btn-ghost text-sm" onClick={() => api().openExternal('https://github.com/avihihaviv-bit/twecd/releases/latest')}>Download manually</button>}
                {upd.state === 'ready' && <button className="btn-primary text-sm" onClick={() => api().updateInstall()}>Restart & install v{upd.version}</button>}
                <span className="text-muted">{({ idle: '', checking: 'Checking...', none: 'You have the latest version.', available: `Version ${upd.version} is available.`, downloading: `Downloading ${upd.percent ?? 0}%...`, ready: 'Downloaded. Install when you are ready.', error: `Update error: ${upd.message}`, disabled: upd.message ?? '' } as Record<string, string>)[upd.state]}</span>
              </div>
            </div>
          )}
        </Card>

        <Card title="System">
          {info && (
            <div className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <span className="text-muted">CPU</span><span>{info.cpu.model} ({info.cpu.logicalCores} threads)</span>
              <span className="text-muted">GPU</span><span>{info.gpu.name ?? 'Unavailable'}{info.gpu.driver ? ` · driver ${info.gpu.driver}` : ''}</span>
              <span className="text-muted">RAM</span><span>{(info.ram.totalMB / 1024).toFixed(1)} GB</span>
              <span className="text-muted">Platform</span><span>{info.platform}{info.isAdmin ? ' (admin)' : ''}</span>
              <span className="text-muted">Version</span><span>TWECD GAMING BOOSTER - EXTREME EDITION v{info.appVersion}</span>
            </div>
          )}
          <div className="mt-3 text-xs text-muted">TWECD never disables Windows Defender, Firewall, Windows Update or system services, never interacts with anti-cheat, and never modifies the Fortnite game or its memory (only its settings file, when you click Apply Max FPS, with a backup).</div>
        </Card>
      </div>

    </div>
  );
}
