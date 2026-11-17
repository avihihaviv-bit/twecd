import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, XCircle } from 'lucide-react';
import type { BiosReport } from '../../shared/types';
import { api } from '../lib/api';
import { Badge, Card, PageHeader } from '../components/ui';

type St = 'ok' | 'action' | 'unknown';
const Icon = ({ s }: { s: St }) => (s === 'ok' ? <CheckCircle2 size={20} className="text-neon" /> : s === 'action' ? <XCircle size={20} className="text-purple" /> : <HelpCircle size={20} className="text-muted" />);

/** Guide for Gigabyte B760 GAMING X AX DDR5 + i5-14600K. Read-only checks; every BIOS change is done by the user. */
export default function Bios() {
  const [r, setR] = useState<BiosReport | null>(null);
  useEffect(() => { api().biosReport().then(setR).catch(() => undefined); }, []);
  const isGigabyteB760 = !!r?.board && /gigabyte/i.test(r.board) && /b760/i.test(r.board);
  const mc = r?.microcode ?? null;
  const items: { title: string; state: St; found: string; steps: string[]; note?: string }[] = [
    {
      title: 'Intel microcode 0x12B or newer (BIOS update)', state: mc === null ? 'unknown' : mc >= 0x12b ? 'ok' : 'action',
      found: mc === null ? 'Microcode revision not reported' : `Running microcode 0x${mc.toString(16).toUpperCase()}; BIOS ${r?.biosVersion ?? '?'}${r?.biosDate ? ` (${r.biosDate})` : ''}`,
      steps: [
        `Find your board revision: printed on the motherboard near the bottom-left (e.g. "REV: 1.0") and on the box.${r?.boardRevision ? ` Windows reports: "${r.boardRevision}".` : ''} Download only the BIOS for exactly that revision.`,
        'On gigabyte.com open B760 GAMING X AX DDR5 > Support > BIOS. Pick the newest release whose notes mention Intel microcode 0x12B or later (or "Intel Default Settings" / Vmin shift fix).',
        'Unzip it to a USB stick formatted FAT32.',
        'Restart, press DEL to enter the BIOS, then press F8 (Q-Flash). Choose "Update BIOS", select the file, confirm. Do NOT power off until it finishes and reboots by itself.',
        'After the update, BIOS settings reset to defaults: enable XMP and Resizable BAR again (below).',
      ],
      note: 'TWECD never flashes the BIOS. A wrong file or a power cut during flashing can make the board unbootable, so only you start it, with the file for your exact revision.',
    },
    {
      title: 'Intel Default Settings (stable power limits for 14th gen)', state: 'unknown', found: 'Not readable from Windows',
      steps: [
        'In the BIOS (F2 for Advanced Mode) open the Tweaker tab.',
        'Look for "Intel Default Settings" (added in 2024 BIOS releases; on some versions under "CPU Upgrade" or "Performance"). Select it, or the "Intel Default Settings - Performance" option that matches your cooler (the H150 360 mm handles it).',
        'Leave CPU voltages and Load-Line on Auto. Do not enable "unlimited" power limits.',
      ],
      note: 'This trades nothing measurable in Fortnite (which is far below the CPU power limit) and protects the i5-14600K long-term.',
    },
    {
      title: 'XMP: DDR5-6000', state: r?.xmp === true ? 'ok' : r?.xmp === false ? 'action' : 'unknown',
      found: r?.ramConfiguredMHz ? `Memory running at ${r.ramConfiguredMHz} MT/s${r.ramRatedMHz ? ` (JEDEC base ${r.ramRatedMHz})` : ''}` : 'Memory speed not reported',
      steps: [
        'BIOS > Tweaker > "Extreme Memory Profile (X.M.P.)" > Profile1 (DDR5-6000). Save & Exit (F10).',
        'Check stability: in Windows run "Windows Memory Diagnostic" (mdsched.exe) once, then play normally. If you get crashes, set XMP back to Disabled.',
      ],
      note: 'In CPU-bound Fortnite, memory speed directly affects FPS and 1% lows. This is one of the few real "free" gains.',
    },
    {
      title: 'Resizable BAR + Above 4G Decoding', state: r?.rebar === true ? 'ok' : r?.rebar === false ? 'action' : 'unknown',
      found: r?.bar1MB != null ? `GPU BAR1 aperture ${r.bar1MB} MiB` : 'Not reported by the NVIDIA driver',
      steps: [
        'BIOS > Boot > "CSM Support": Disabled (Windows 11 already boots in UEFI mode).',
        'BIOS > Settings > IO Ports > "Above 4G Decoding": Enabled, then "Re-Size BAR Support": Auto/Enabled.',
        'Save & Exit. Confirm here: the BAR1 aperture should read about 8192 MiB.',
      ],
    },
    {
      title: 'PCIe slot for the RTX 5060', state: r?.pcie?.widthCur ? (r.pcie.widthCur >= 8 ? 'ok' : 'action') : 'unknown',
      found: r?.pcie ? `Gen ${r.pcie.genCur ?? '?'} x${r.pcie.widthCur ?? '?'}` : 'Not reported',
      steps: ['The card must be in the top "PCIEX16" slot (CPU lanes). It uses 8 lanes, so x8 is full speed.', 'BIOS > Settings > IO Ports > PCIEX16 Bandwidth / Slot Configuration: Auto.'],
    },
    {
      title: 'Turbo Boost and thermal protection', state: 'unknown', found: 'Defaults are correct',
      steps: ['Leave Intel Turbo Boost, Turbo Boost Max 3.0 and all thermal protections enabled (Auto). Never disable thermal throttling: it is what stops damage.'],
    },
    {
      title: 'Fan and pump curves (Corsair H150)', state: 'unknown', found: 'Not readable from Windows',
      steps: [
        'BIOS > Smart Fan 6 (F6). Pump header (CPU_OPT / the header the H150 pump uses): Full Speed.',
        'Radiator fans (CPU_FAN): a curve that reaches ~70% at 80 °C. iCUE can also control the H150; use one tool, not both.',
      ],
    },
  ];
  return (
    <div className="animate-fadeUp">
      <PageHeader title="BIOS GUIDE" subtitle="Checks what Windows can read about your BIOS, then shows exact steps for the Gigabyte B760 GAMING X AX DDR5. TWECD never changes BIOS settings, never flashes the BIOS and never overclocks." />
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[['Motherboard', r?.board ?? 'Unknown'], ['Board revision (Windows)', r?.boardRevision ?? 'Unknown: check the board'], ['BIOS', r?.biosVersion ? `${r.biosVersion}${r.biosDate ? ` · ${r.biosDate}` : ''}` : 'Unknown'], ['CPU', r?.cpuModel ?? 'Unknown']].map(([k, v]) => (
          <div key={k} className="card p-4"><div className="label">{k}</div><div className="mt-1 truncate font-semibold text-white" title={v}>{v}</div></div>
        ))}
      </div>
      {r && !isGigabyteB760 && <div className="mb-6 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/[0.06] p-3 text-sm text-warn"><AlertTriangle size={16} /> Windows does not report a Gigabyte B760 board{r.board ? ` (it reports "${r.board}")` : ''}. Menu names below are for Gigabyte B760; use your board's manual if it differs.</div>}
      <div className="space-y-4">
        {items.map((it) => (
          <Card key={it.title} title={<span className="flex items-center gap-2"><Icon s={it.state} />{it.title}</span>} right={it.state === 'ok' ? <Badge tone="good">OK</Badge> : it.state === 'action' ? <Badge tone="warn">ACTION</Badge> : <Badge tone="muted">CHECK IN BIOS</Badge>}>
            <div className="mb-2 text-sm"><span className="label mr-2">Detected</span><span className="text-lilac">{it.found}</span></div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-[#cfc3e3]">{it.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {it.note && <div className="mt-3 text-xs text-muted">{it.note}</div>}
          </Card>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button className="btn-primary" onClick={() => api().openExternal('https://www.gigabyte.com/Support')}><ExternalLink size={15} /> Gigabyte support (search: B760 GAMING X AX DDR5)</button>
        <button className="btn-ghost" onClick={() => api().openExternal('https://www.hwinfo.com/download/')}><ExternalLink size={15} /> HWiNFO (for power/temperature sensors)</button>
      </div>
    </div>
  );
}
