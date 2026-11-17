import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { HwSensor } from '../../shared/types';
import { api, fmt } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, PageHeader, Stat } from '../components/ui';
import Hardware from './Hardware';
import Ram from './Ram';

export default function Diagnostics({ onAutoBoost }: { onAutoBoost: () => void }) {
  const { live } = useApp();
  const [sensors, setSensors] = useState<HwSensor[] | null | undefined>(undefined);
  useEffect(() => { const t = () => api().hwinfo().then(setSensors).catch(() => setSensors(null)); t(); const iv = setInterval(t, 4000); return () => clearInterval(iv); }, []);
  const hw = live?.hw ?? null;
  return (
    <div className="animate-fadeUp">
      <PageHeader title="SYSTEM DIAGNOSTICS" subtitle="Every value is read from Windows performance counters, the NVIDIA driver, or HWiNFO when it is running. Anything that cannot be read is shown as Unavailable, never estimated." />
      <Card title="HWiNFO sensors (CPU package temperature, power, limits)" right={sensors?.length ? <Badge tone="good">CONNECTED · {sensors.length} SENSORS</Badge> : <Badge tone="muted">NOT CONNECTED</Badge>}>
        {sensors?.length ? (
          <>
            <div className="grid grid-cols-6 gap-3">
              <Stat label="CPU package" value={hw?.packageTemp != null ? fmt(hw.packageTemp) : null} unit="°C" tone={(hw?.packageTemp ?? 0) >= 95 ? 'bad' : 'default'} />
              <Stat label="Package power" value={hw?.packagePower != null ? fmt(hw.packagePower) : null} unit="W" />
              <Stat label="PL1 limit" value={hw?.pl1 != null ? fmt(hw.pl1) : null} unit="W" />
              <Stat label="PL2 limit" value={hw?.pl2 != null ? fmt(hw.pl2) : null} unit="W" />
              <Stat label="Effective clock" value={hw?.effClock != null ? fmt(hw.effClock) : null} unit="MHz" />
              <Stat label="Throttling" value={hw?.thermalThrottle != null || hw?.powerThrottle != null ? ((hw?.thermalThrottle ?? 0) > 0 ? 'THERMAL' : (hw?.powerThrottle ?? 0) > 0 ? 'POWER' : 'None') : null} tone={(hw?.thermalThrottle ?? 0) > 0 ? 'bad' : 'default'} />
            </div>
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-lilac">All published sensors</summary>
              <div className="mt-2 grid grid-cols-3 gap-x-6">{sensors.map((s, i) => <div key={i} className="flex justify-between border-b border-line/60 py-1"><span className="truncate text-muted" title={s.sensor}>{s.label}</span><span className="num text-white">{s.value}</span></div>)}</div>
            </details>
          </>
        ) : (
          <div className="text-sm text-[#cfc3e3]">
            Windows does not expose CPU package temperature, power or throttling flags without a hardware driver. TWECD reads them from <b className="text-white">HWiNFO64</b> (free) when you allow it:
            <ol className="mt-2 list-decimal space-y-0.5 pl-5">
              <li>Install and open HWiNFO64 in "Sensors-only" mode.</li>
              <li>Sensor settings &gt; <b className="text-white">HWiNFO Gadget</b> tab &gt; tick "Enable reporting to Gadget".</li>
              <li>Select "CPU Package" (temperature), "CPU Package Power", "PL1/PL2 Power Limit", "Average Effective Clock" and tick "Report value in Gadget" for each. OK.</li>
            </ol>
            <button className="btn-ghost mt-3 text-sm" onClick={() => api().openExternal('https://www.hwinfo.com/download/')}><ExternalLink size={14} /> Download HWiNFO (official site)</button>
            <div className="mt-2 text-xs text-muted">TWECD does not install it for you. It only reads the values HWiNFO publishes in your user registry.</div>
          </div>
        )}
      </Card>
      <div className="mt-8"><Hardware embedded /></div>
      <h2 className="title-glow mb-4 mt-10 font-display text-xl font-bold tracking-[0.08em]">MEMORY</h2>
      <Ram embedded onAutoBoost={onAutoBoost} />
    </div>
  );
}
