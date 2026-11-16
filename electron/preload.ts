import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc';

const invoke = (ch: string, ...a: unknown[]) => ipcRenderer.invoke(ch, ...a);
const on = (ch: string) => (cb: (v: unknown) => void) => {
  const h = (_e: IpcRendererEvent, v: unknown) => cb(v);
  ipcRenderer.on(ch, h);
  return () => { ipcRenderer.removeListener(ch, h); };
};

// Narrow, typed surface. The renderer has no Node.js access.
contextBridge.exposeInMainWorld('twecd', {
  getStatic: () => invoke(IPC.getStatic),
  setVisible: (v: boolean) => invoke(IPC.setVisible, v),
  relaunchAdmin: () => invoke(IPC.relaunchAdmin),
  openExternal: (url: string) => invoke(IPC.openExternal, url),
  scan: () => invoke(IPC.scan),
  onScanStep: on(IPC.scanStep),
  apply: (req: unknown) => invoke(IPC.apply, req),
  restore: () => invoke(IPC.restore),
  changeLog: () => invoke(IPC.changeLog),
  hasBackup: () => invoke(IPC.hasBackup),
  processes: () => invoke(IPC.processes),
  onMetrics: on(IPC.metrics),
  netTest: (req: unknown) => invoke(IPC.netTest, req),
  onNetProgress: on(IPC.netProgress),
  netContext: () => invoke(IPC.netContext),
  fortniteConfig: () => invoke(IPC.fortniteConfig),
  launchFortnite: () => invoke(IPC.fortniteLaunch),
  session: () => invoke(IPC.sessionGet),
  benchRun: (req: unknown) => invoke(IPC.benchRun, req),
  onBenchProgress: on(IPC.benchProgress),
  benchList: () => invoke(IPC.benchList),
  benchClear: () => invoke(IPC.benchClear),
  settingsGet: () => invoke(IPC.settingsGet),
  settingsSet: (s: unknown) => invoke(IPC.settingsSet, s),
  pickPresentMon: () => invoke(IPC.pickPresentMon),
});
