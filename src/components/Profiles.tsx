import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { FortniteProfileId, FortniteProfileInfo, SessionSummary } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { useApp } from '../lib/store';
import { Card } from './ui';

/** Four tested Fortnite profiles, one click each. Writes only GameUserSettings.ini (backed up). */
export function Profiles({ current, onChanged }: { current: FortniteProfileId | null | undefined; onChanged: () => void }) {
  const { live, info } = useApp();
  const [list, setList] = useState<FortniteProfileInfo[]>([]);
  const [busy, setBusy] = useState<FortniteProfileId | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sess, setSess] = useState<SessionSummary | null>(null);
  useEffect(() => { api().fortniteProfiles().then(setList); api().session().then((s) => setSess(s.current ?? s.last)); }, []);
  const running = live?.fortnite.running ?? false;
  const cap = sess?.recommendedCap ?? null;

  const apply = async (p: FortniteProfileInfo) => {
    if (!confirm(`Switch Fortnite to "${p.name}"?\n\n${p.summary}\n\nOnly Fortnite's settings file is changed; your original is backed up (Settings > Restore Defaults).`)) return;
    setBusy(p.id); setMsg(null);
    try { const r = await api().applyFortniteProfile({ profile: p.id, cap: p.needsCap ? cap ?? undefined : undefined }); setMsg({ ok: r.ok, text: r.message }); onChanged(); }
    catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(null); }
  };

  return (
    <Card title="Fortnite performance profiles" right={<span className="text-xs text-muted">Active: <b className="text-white">{current ? list.find((l) => l.id === current)?.name ?? current : current === null ? 'Custom settings' : 'Unavailable'}</b></span>}>
      <div className="grid grid-cols-4 gap-3">
        {list.map((p) => {
          const active = current === p.id;
          const blocked = p.needsCap && !cap;
          return (
            <div key={p.id} className={`flex flex-col rounded-xl border p-4 ${active ? 'border-neon/50 bg-neon/[0.05]' : 'border-line bg-panel2/60'}`}>
              <div className="flex items-center gap-2"><span className="font-display text-[13px] font-bold tracking-[0.1em] text-white">{p.name.toUpperCase()}</span>{active && <Check size={15} className="text-neon" />}</div>
              <p className="mt-2 flex-1 text-[13px] text-[#c3cdc7]">{p.summary}{p.needsCap && <span className="mt-1 block text-neon2">{cap ? `Lock: ${cap} FPS (from your last match)` : 'Needs one measured match first.'}</span>}</p>
              <button className={active ? 'btn-ghost mt-3' : 'btn-primary mt-3'} disabled={!!busy || running || blocked || !info?.isWindows || current === undefined} onClick={() => apply(p)}>
                {busy === p.id ? <Loader2 size={15} className="animate-spin" /> : null}{active ? 'RE-APPLY' : 'APPLY'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted">Compare profiles with repeatable runs: apply one, play the same Creative route, run "Benchmark current profile" on the FPS Optimizer page, then switch and repeat. {running && <span className="text-warn">Close Fortnite to switch profiles.</span>}</div>
      {msg && <div className={`mt-2 text-sm ${msg.ok ? 'text-neon2' : 'text-bad'}`}>{msg.text}</div>}
    </Card>
  );
}
