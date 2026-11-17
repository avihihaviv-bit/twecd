import { useEffect, useState } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import type { ApplyItemResult, ChangeLogEntry, OptimizationId, RestorableItem } from '../../shared/types';
import { api } from '../lib/api';
import { Badge, Card, Empty, PageHeader } from '../components/ui';

export default function Backup() {
  const [items, setItems] = useState<RestorableItem[]>([]);
  const [log, setLog] = useState<ChangeLogEntry[]>([]);
  const [res, setRes] = useState<ApplyItemResult[] | null>(null);
  const reload = () => { api().restorable().then(setItems); api().changeLog().then(setLog); };
  useEffect(reload, []);
  const restore = async (ids?: OptimizationId[]) => {
    if (!ids && !confirm('Restore ALL settings TWECD changed to their original values?')) return;
    setRes(await api().restore(ids)); reload();
  };
  return (
    <div className="animate-fadeUp">
      <PageHeader title="RESTORE & BACKUP" subtitle="Before its first change to any setting, TWECD saves the original value (registry values, power plan, Fortnite settings file). Restore one item or everything. A Windows System Restore point is also attempted before system changes when TWECD runs as administrator." />
      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <Card title={`Saved originals · ${items.length}`} right={<button className="btn-danger !py-1.5 text-sm" disabled={!items.length} onClick={() => restore()}><RotateCcw size={14} /> RESTORE ALL</button>}>
          {items.length === 0 ? <Empty>Nothing to restore: TWECD has not changed anything, or everything was already restored.</Empty> : (
            <div className="space-y-2">{items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel2/60 px-3 py-2.5 text-sm">
                <ShieldCheck size={16} className="text-purple" />
                <div className="flex-1"><b className="text-white">{it.title}</b><div className="text-xs text-muted">{it.detail}</div></div>
                <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => restore([it.id])}><RotateCcw size={13} /> Restore</button>
              </div>
            ))}</div>
          )}
          {res && <div className="mt-4 space-y-1">{res.length === 0 ? <div className="text-sm text-muted">Nothing needed restoring.</div> : res.map((r) => <div key={r.id} className="text-sm"><Badge tone={r.status === 'success' ? 'good' : 'bad'}>{r.status}</Badge> <b className="text-white">{r.title}</b> <span className="text-muted">{r.message}</span></div>)}</div>}
        </Card>
        <Card title="What is never changed">
          <ul className="space-y-1.5 text-sm text-[#cfc3e3]">
            <li>• Windows Defender, Firewall, Windows Update, system services</li>
            <li>• BIOS, firmware, CPU/GPU voltages, clocks or power limits</li>
            <li>• Fortnite game files, memory, Easy Anti-Cheat</li>
            <li>• Router settings</li>
          </ul>
          <div className="mt-3 text-xs text-muted">Closed apps can simply be reopened. Deleted temp files (if you chose that) are the only non-restorable action, and TWECD marks it before you apply.</div>
        </Card>
      </div>
      <Card className="mt-6" title="Change history">
        {log.length === 0 ? <Empty>No changes made yet.</Empty> : <div className="max-h-[420px] space-y-1 overflow-y-auto">{log.map((l, i) => <div key={i} className="grid grid-cols-[180px_320px_1fr] gap-3 border-b border-line/60 py-1.5 text-sm"><span className="text-muted">{new Date(l.ts).toLocaleString()}</span><b className="text-white">{l.action}</b><span className="text-[#cfc3e3]">{l.detail}</span></div>)}</div>}
      </Card>
    </div>
  );
}
