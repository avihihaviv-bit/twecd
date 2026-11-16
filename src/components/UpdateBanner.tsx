import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { UpdateStatus } from '../../shared/types';
import { api } from '../lib/api';

/** Asks before downloading and before installing. Nothing happens without a click. */
export function UpdateBanner() {
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' });
  const [hidden, setHidden] = useState(false);
  useEffect(() => { api().updateGet().then(setS); return api().onUpdateStatus(setS); }, []);
  if (hidden || !['available', 'downloading', 'ready'].includes(s.state)) return null;
  return (
    <div className="mx-8 mb-4 flex items-center gap-4 rounded-xl border border-neon/40 bg-neon/[0.07] px-4 py-3 text-sm">
      <Download size={18} className="text-neon" />
      <span className="flex-1 text-white">
        {s.state === 'available' && <>TWECD <b>v{s.version}</b> is available. Download it?</>}
        {s.state === 'downloading' && <>Downloading v{s.version}: {s.percent ?? 0}%</>}
        {s.state === 'ready' && <>v{s.version} is ready. TWECD will close and update.</>}
      </span>
      {s.state === 'available' && <button className="btn-primary !py-1.5 text-sm" onClick={() => api().updateDownload()}>Download</button>}
      {s.state === 'ready' && <button className="btn-primary !py-1.5 text-sm" onClick={() => api().updateInstall()}>Restart & update</button>}
      {s.state !== 'downloading' && <button className="text-muted hover:text-white" onClick={() => setHidden(true)} aria-label="Later"><X size={16} /></button>}
    </div>
  );
}
