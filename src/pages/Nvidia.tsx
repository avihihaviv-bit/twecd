import { useEffect, useState } from 'react';
import type { BiosReport } from '../../shared/types';
import { api, fmt, gb } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Card, PageHeader, Stat } from '../components/ui';
import { NvidiaChecklist } from '../components/NvidiaChecklist';

export default function Nvidia() {
  const { live, info } = useApp();
  const [r, setR] = useState<BiosReport | null>(null);
  useEffect(() => { api().biosReport().then(setR).catch(() => undefined); }, []);
  const g = live?.gpu ?? null;
  return (
    <div className="animate-fadeUp">
      <PageHeader title="NVIDIA OPTIMIZATION" subtitle="RTX 5060 status read from the NVIDIA driver, plus the exact Fortnite profile to set in NVIDIA Control Panel. TWECD never overclocks the GPU or changes its power limit." />
      <div className="grid grid-cols-6 gap-3">
        <Stat label="GPU" value={g?.name?.replace('NVIDIA GeForce ', '') ?? info?.gpu.name ?? null} />
        <Stat label="Driver" value={g?.driver ?? info?.gpu.driver ?? null} sub="update via NVIDIA App" />
        <Stat label="Usage" value={g ? fmt(g.usage) : null} unit="%" />
        <Stat label="Clock" value={g ? fmt(g.clockMHz) : null} unit="MHz" sub={g?.maxClockMHz ? `max ${g.maxClockMHz}` : undefined} />
        <Stat label="Temperature" value={g ? fmt(g.tempC) : null} unit="°C" />
        <Stat label="VRAM" value={g ? gb(g.vramUsedMB) : null} sub={g?.vramTotalMB ? `of ${gb(g.vramTotalMB, 0)}` : undefined} />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Card title="Resizable BAR">
          <div className="flex items-center gap-2 text-lg">{r?.rebar === true ? <Badge tone="good">ENABLED</Badge> : r?.rebar === false ? <Badge tone="warn">DISABLED</Badge> : <Badge tone="muted">UNKNOWN</Badge>}<span className="num text-sm text-muted">{r?.bar1MB != null ? `BAR1 aperture ${r.bar1MB} MiB` : 'nvidia-smi did not report BAR1'}</span></div>
          <p className="mt-2 text-sm text-muted">Measured from the GPU's BAR1 size (about 256 MiB = off, about the VRAM size = on). Turning it on is a BIOS setting: see BIOS Guide. Effect on Fortnite Performance mode is usually small.</p>
        </Card>
        <Card title="PCIe link">
          <div className="num text-lg text-white">{r?.pcie ? `Gen ${r.pcie.genCur ?? '?'} x${r.pcie.widthCur ?? '?'}` : 'Unavailable'}<span className="ml-2 text-sm text-muted">{r?.pcie ? `(max Gen ${r.pcie.genMax ?? '?'} x${r.pcie.widthMax ?? '?'})` : ''}</span></div>
          <p className="mt-2 text-sm text-muted">The RTX 5060 uses 8 lanes. "x8" is correct; "x4" or lower means it is in the wrong slot (use the top PCIEX16 slot). The generation drops at idle to save power; that is normal.</p>
        </Card>
        <Card title="Reflex vs Low Latency Mode">
          <p className="text-sm text-[#cfc3e3]">Use <b className="text-white">NVIDIA Reflex: On + Boost</b> inside Fortnite. When Reflex is active the driver's Low Latency Mode is ignored, so set Low Latency Mode to Off/On, never Ultra, to avoid stacking two frame limiters.</p>
          <p className="mt-2 text-xs text-muted">Separate from ping: Reflex lowers <b>local</b> input-to-display latency; it cannot change your connection to the server.</p>
        </Card>
      </div>
      <div className="mt-6"><NvidiaChecklist /></div>
    </div>
  );
}
