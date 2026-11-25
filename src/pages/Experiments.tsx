import { useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, Loader2, MinusCircle, RotateCcw, XCircle } from 'lucide-react';
import type { ExpDef, ExpId, ExpProgress, ExpRun, ExpState } from '../../shared/types';
import { api, errMsg, fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, PageHeader } from '../components/ui';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** A/B tests on this PC: 3 runs without the change, 3 with it; a verdict only when the difference beats run-to-run noise. */
export default function Experiments() {
  const { live, info } = useApp();
  const [defs, setDefs] = useState<ExpDef[]>([]);
  const [states, setStates] = useState<Record<string, ExpState>>({});
  const [running, setRunning] = useState<{ id: ExpId; phase: 'A' | 'B' } | null>(null);
  const [prog, setProg] = useState<ExpProgress | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const load = () => api().expList().then((r) => { setDefs(r.defs); setStates(Object.fromEntries(r.states.map((s) => [s.id, s]))); });
  useEffect(() => { load(); return api().onExpProgress(setProg); }, []);
  const fnRunning = live?.fortnite.running ?? false;
  const fpsOk = !!live?.fps;

  const runPhase = async (d: ExpDef, phase: 'A' | 'B') => {
    if (phase === 'B' && d.kind === 'guided' && !confirm(`Before phase B:\n\n${d.applyStep}\n\nClick OK when it is done and you are back in the same spot.`)) return;
    setRunning({ id: d.id, phase }); setProg(null); setMsg((m) => ({ ...m, [d.id]: undefined as never }));
    try { const st = await api().expRun({ id: d.id, phase }); setStates((s) => ({ ...s, [d.id]: st })); }
    catch (e) { setMsg((m) => ({ ...m, [d.id]: { ok: false, text: errMsg(e) } })); }
    finally { setRunning(null); setProg(null); }
  };
  const keep = async (id: ExpId, k: boolean) => { const r = await api().expKeep({ id, keep: k }); setMsg((m) => ({ ...m, [id]: { ok: r.ok, text: r.message } })); load(); };
  const reset = async (id: ExpId) => { await api().expReset(id); load(); };

  const winners = defs.filter((d) => states[d.id]?.verdict?.status === 'improved');
  return (
    <div className="animate-fadeUp">
      <PageHeader title="EXPERIMENTS LAB" subtitle="The last few percent are different on every PC. Each experiment is measured on YOUR PC: 3 runs without the change, 3 runs with it, same spot. TWECD reports an improvement only when it is at least 3% AND clearly larger than the normal run-to-run variation. No promised numbers." />

      <div className="mb-6 grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-purple/30 bg-purple/[0.06] p-4 text-sm text-[#d9c6f5]">
        <div><b className="text-white">How to test:</b> open Fortnite → an empty 1v1 / Creative map → stand still looking at the same spot (the most repeatable scene) → alt-tab and click "Phase A". Then phase B. Each phase takes about 1 minute (3 × 20 s); the game keeps running while TWECD measures.</div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge tone={fnRunning ? 'good' : 'muted'}>{fnRunning ? 'FORTNITE RUNNING' : 'FORTNITE NOT RUNNING'}</Badge>
          <Badge tone={fpsOk ? 'good' : 'warn'}>{fpsOk ? 'FPS CAPTURE OK' : info?.isAdmin ? 'WAITING FOR FPS' : 'FPS CAPTURE NEEDS ADMIN'}</Badge>
        </div>
      </div>

      {winners.length > 0 && (
        <Card className="mb-6" title={`Proven on your PC · ${winners.length}`}>
          <div className="space-y-1 text-sm">{winners.map((d) => <div key={d.id}><CheckCircle2 size={14} className="mr-1 inline text-neon" /><b className="text-white">{d.name}</b> <span className="text-muted">{states[d.id]?.verdict?.detail}</span></div>)}</div>
        </Card>
      )}

      <div className="space-y-4">
        {defs.map((d, i) => {
          const st = states[d.id];
          const busy = running?.id === d.id;
          const v = st?.verdict ?? null;
          return (
            <Card key={d.id} title={<span className="flex items-center gap-2"><FlaskConical size={14} className="text-purple" /> {i + 1}. {d.name}</span>}
              right={<div className="flex flex-wrap gap-2">
                <Badge tone={d.kind === 'software' ? 'info' : 'muted'}>{d.kind === 'software' ? 'TWECD APPLIES IT' : 'YOU FLIP IT'}</Badge>
                <Badge tone={d.risk === 'none' ? 'good' : d.risk === 'low' ? 'info' : 'warn'}>RISK: {d.risk.toUpperCase()}</Badge>
                {d.restart && <Badge tone="info">RESTART</Badge>}
              </div>}>
              <p className="text-sm text-[#cfc3e3]">{d.what}</p>
              <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-muted">
                <div><span className="label">Phase B change</span><div className="text-[#cfc3e3]">{d.applyStep}</div></div>
                <div><span className="label">Undo</span><div className="text-[#cfc3e3]">{d.revertStep}</div></div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-stretch gap-3">
                <PhaseBox label="A · without the change" runs={st?.a ?? []} />
                <PhaseBox label="B · with the change" runs={st?.b ?? []} />
                <div className="flex w-[190px] flex-col gap-2">
                  <button className="btn-ghost" disabled={!!running || !fnRunning} onClick={() => runPhase(d, 'A')}>{busy && running?.phase === 'A' ? <Loader2 size={15} className="animate-spin" /> : null}Phase A (3 runs)</button>
                  <button className="btn-primary" disabled={!!running || !fnRunning || !(st?.a?.length)} onClick={() => runPhase(d, 'B')}>{busy && running?.phase === 'B' ? <Loader2 size={15} className="animate-spin" /> : null}Phase B (3 runs)</button>
                  {!!(st?.a.length || st?.b.length) && <button className="text-xs text-muted hover:text-white" onClick={() => reset(d.id)}><RotateCcw size={11} className="mr-1 inline" />Reset</button>}
                </div>
              </div>
              {busy && prog && <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-muted"><span>Phase {prog.phase}: run {prog.run}/{prog.runs}. Keep standing in the same spot.</span><span className="num">{prog.elapsedSec}/{prog.durationSec}s</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-gradient-to-r from-purple to-neon transition-all" style={{ width: `${(((prog.run - 1) * prog.durationSec + prog.elapsedSec) / (prog.runs * prog.durationSec)) * 100}%` }} /></div></div>}
              {!fnRunning && !st?.a.length && <div className="mt-2 text-xs text-warn">Start Fortnite first. Nothing is measured without the game running.</div>}

              {v && (
                <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${v.status === 'improved' ? 'border-neon/40 bg-neon/[0.05]' : v.status === 'worse' ? 'border-bad/40 bg-bad/[0.05]' : 'border-line bg-panel2/60'}`}>
                  {v.status === 'improved' ? <CheckCircle2 className="text-neon" /> : v.status === 'worse' ? <XCircle className="text-bad" /> : <MinusCircle className="text-muted" />}
                  <div className="flex-1"><b className={v.status === 'improved' ? 'text-neon' : v.status === 'worse' ? 'text-bad' : 'text-white'}>{v.status === 'improved' ? 'IMPROVED' : v.status === 'worse' ? 'WORSE' : v.status === 'same' ? 'NO MEASURABLE DIFFERENCE' : 'NOT ENOUGH DATA'}</b> <span className="text-[#cfc3e3]">{v.detail}</span>
                    <div className="text-xs text-muted">{d.kind === 'software' ? (v.status === 'improved' ? 'Applied to the running Fortnite. Tick "keep" to re-apply it on every launch.' : 'Reverted automatically.') : v.status === 'improved' ? 'Keep the change if the trade-off is worth it to you.' : `Undo it: ${d.revertStep}`}</div>
                  </div>
                  {v.status === 'improved' && d.kind === 'software' && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-[#39FF14]" checked={!!st?.kept} onChange={(e) => keep(d.id, e.target.checked)} />Keep (apply every launch)</label>
                  )}
                </div>
              )}
              {msg[d.id] && <div className={`mt-2 text-sm ${msg[d.id].ok ? 'text-neon2' : 'text-bad'}`}>{msg[d.id].text}</div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PhaseBox({ label, runs }: { label: string; runs: ExpRun[] }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-3">
      <div className="label">{label}</div>
      {runs.length === 0 ? <div className="mt-2 text-sm text-[#6b5d85]">Not measured yet</div> : (
        <>
          <div className="num mt-1 text-2xl font-bold text-white">{fmt(mean(runs.map((r) => r.avgFps)))} <span className="text-sm font-normal text-muted">avg FPS</span></div>
          <div className="num text-xs text-[#cfc3e3]">1% low {fmt(mean(runs.map((r) => r.low1)))} · runs: {runs.map((r) => Math.round(r.avgFps)).join(' / ')}</div>
        </>
      )}
    </div>
  );
}
