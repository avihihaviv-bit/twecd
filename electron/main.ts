import { app, BrowserWindow, dialog, ipcMain, screen, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import type { BenchmarkResult, ChangeLogEntry, Settings, StaticInfo } from '../shared/types';
import { ApplySchema, CapSchema, ProfileSchema, RestoreSchema, BenchSchema, ExternalSchema, NetTestSchema, SettingsSchema, VisibleSchema } from './validation';
import { JsonStore } from './services/store';
import { MonitorHub } from './services/monitor';
import { PresentMonCapture } from './services/presentMon';
import { collectStaticInfo } from './services/staticInfo';
import { runScan } from './services/scan';
import { Optimizer, type Backup } from './services/optimizer';
import { getNetContext, runNetTest } from './services/network';
import { readFortniteConfig, applyFortniteCap, applyFortniteProfile, isDx12, FORTNITE_LAUNCH_URI } from './services/fortniteFiles';
import { PROFILES } from './services/fortniteConfig';
import { Updater } from './services/updater';
import { closableCatalog, friendlyName, isClosable } from './services/processCatalog';
import { runBenchmark } from './services/benchmark';
import { isAdmin, listProcesses, listUserStartup } from './services/windows';
import { isWin, run } from './services/exec';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DEFAULT_SETTINGS: Settings = {
  presentMonPath: null,
  monitorIntervalMs: 1000,
  trackFortniteWhileMinimized: true,
  autoBoost: false,
  autoBoostApps: [],
  livePingHost: '1.1.1.1',
  autoCheckUpdates: true,
  nvidiaChecklist: [],
  netTargets: [
    { label: 'Cloudflare DNS', host: '1.1.1.1' },
    { label: 'Google DNS', host: '8.8.8.8' },
    { label: 'Epic Games', host: 'epicgames.com' },
  ],
};

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let staticInfo: StaticInfo | null = null;
let busy = { scan: false, net: false, bench: false };

const ud = () => app.getPath('userData');
const settingsStore = new JsonStore<Settings>(ud(), 'settings.json', DEFAULT_SETTINGS);
const benchStore = new JsonStore<{ results: BenchmarkResult[] }>(ud(), 'benchmarks.json', { results: [] });
let settings = settingsStore.read();

const pmPath = () => PresentMonCapture.resolve(settings.presentMonPath, process.resourcesPath ?? '');
const hub = new MonitorHub({
  intervalMs: () => settings.monitorIntervalMs,
  trackWhileHidden: () => settings.trackFortniteWhileMinimized,
  baseClockMHz: () => staticInfo?.cpu.baseClockMHz ?? null,
  presentMonPath: pmPath,
  emit: (m) => win?.webContents.send(IPC.metrics, m),
  onFortniteStart: () => void runAutoBoost(),
  pingHost: () => settings.livePingHost,
  isDx12: () => isDx12(),
});
const updater = new Updater((s) => win?.webContents.send(IPC.updateStatus, s));
const optimizer = new Optimizer(
  new JsonStore<Backup>(ud(), 'backup.json', { createdAt: 0 }),
  new JsonStore<{ entries: ChangeLogEntry[] }>(ud(), 'changelog.json', { entries: [] }),
  path.join(ud(), 'fortnite-backup'),
  () => hub.latest?.fortnite.running ?? false,
  async () => staticInfo?.isAdmin ?? (await isAdmin()),
);

/** Auto-Boost: when Fortnite starts, close ONLY the apps the user ticked in Settings (never system or anti-cheat). */
async function runAutoBoost() {
  if (!settings.autoBoost || settings.autoBoostApps.length === 0) return;
  const wanted = new Set(settings.autoBoostApps.map((n) => n.toLowerCase()));
  const procs = await listProcesses(false);
  const closed = new Set<string>();
  for (const p of procs) {
    if (!wanted.has(p.name.toLowerCase()) || !isClosable(p.name)) continue;
    try { process.kill(p.pid); closed.add(friendlyName(p.name)); } catch { /* already gone or protected */ }
  }
  if (closed.size) optimizer.note('Auto-Boost (Fortnite started)', `Closed: ${[...closed].join(', ')}`);
}

function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
}

/** Registers a handler that rejects untrusted senders and validates its input before running. */
function handle<T>(channel: string, schema: { parse: (v: unknown) => T } | null, fn: (arg: T, e: IpcMainInvokeEvent) => unknown) {
  ipcMain.handle(channel, async (e, raw) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    const arg = schema ? schema.parse(raw) : (undefined as T);
    return fn(arg, e);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 950, minWidth: 1350, minHeight: 800, show: false, backgroundColor: '#050706',
    title: 'TWECD GAMING BOOSTER - ULTRA WIDE EXTREME EDITION',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#050706', symbolColor: '#39FF14', height: 38 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  win.removeMenu();
  win.once('ready-to-show', () => {
    // Use the ultra-wide default, but never exceed the screen's work area.
    const wa = screen.getDisplayMatching(win!.getBounds()).workAreaSize;
    if (wa.width < 1600 || wa.height < 950) win!.maximize();
    win?.show();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (ev, url) => { if (!(DEV_URL && url.startsWith(DEV_URL))) ev.preventDefault(); });
  win.on('minimize', () => hub.setVisible(false));
  win.on('hide', () => hub.setVisible(false));
  win.on('restore', () => hub.setVisible(true));
  win.on('show', () => hub.setVisible(true));
  win.on('closed', () => { win = null; });
  if (DEV_URL) void win.loadURL(DEV_URL); else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function registerIpc() {
  handle(IPC.getStatic, null, async () => {
    if (!staticInfo) staticInfo = await collectStaticInfo(app.getVersion(), hub.gpu, pmPath());
    staticInfo.presentMon = { available: !!pmPath(), path: pmPath() };
    return staticInfo;
  });
  handle(IPC.setVisible, VisibleSchema, (v) => hub.setVisible(v && !win?.isMinimized()));
  handle(IPC.openExternal, ExternalSchema, (url) => shell.openExternal(url));
  handle(IPC.relaunchAdmin, null, async () => {
    if (!isWin || !app.isPackaged) return { ok: false, message: 'Only available in the installed Windows app.' };
    // Free the single-instance lock first, otherwise the elevated copy sees this one and exits immediately.
    app.releaseSingleInstanceLock();
    const exe = process.execPath.replace(/'/g, "''");
    // Waits for the UAC answer: exit 0 = elevated copy started, 1 = user clicked "No".
    const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `try { Start-Process -FilePath '${exe}' -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }`], 120000);
    if (r.code !== 0) {
      app.requestSingleInstanceLock();
      return { ok: false, message: 'Administrator permission was not given, so TWECD keeps running normally. FPS capture needs it; click again and choose "Yes".' };
    }
    setTimeout(() => app.quit(), 300);
    return { ok: true, message: 'Reopening TWECD as administrator...' };
  });

  handle(IPC.scan, null, async (_a, e) => {
    if (busy.scan) throw new Error('A scan is already running');
    busy.scan = true;
    try {
      if (!staticInfo) staticInfo = await collectStaticInfo(app.getVersion(), hub.gpu, pmPath());
      return await runScan(staticInfo, hub, (s) => e.sender.send(IPC.scanStep, s));
    } finally { busy.scan = false; }
  });
  handle(IPC.apply, ApplySchema, (req) => optimizer.apply(req));
  handle(IPC.restore, RestoreSchema, (ids) => optimizer.restore(ids ?? undefined));
  handle(IPC.restorable, null, () => optimizer.restorable());
  handle(IPC.startupList, null, () => listUserStartup());
  handle(IPC.changeLog, null, () => optimizer.changeLog());
  handle(IPC.hasBackup, null, () => optimizer.hasBackup());
  handle(IPC.processes, null, async () => (await listProcesses(false)).sort((a, b) => b.memMB - a.memMB).slice(0, 40));

  handle(IPC.netContext, null, () => getNetContext());
  handle(IPC.netTest, NetTestSchema, async (req, e) => {
    if (busy.net) throw new Error('A network test is already running');
    busy.net = true;
    try { return await runNetTest(req.targets, req.count, (p) => e.sender.send(IPC.netProgress, p)); } finally { busy.net = false; }
  });

  handle(IPC.fortniteConfig, null, () => readFortniteConfig());
  handle(IPC.fortniteLaunch, null, async () => {
    if (!isWin) return { ok: false, message: 'Fortnite launch is only available on Windows.' };
    try { await shell.openExternal(FORTNITE_LAUNCH_URI); return { ok: true, message: 'Launching Fortnite through the Epic Games Launcher...' }; }
    catch { return { ok: false, message: 'Epic Games Launcher not found. Install it from epicgames.com.' }; }
  });
  handle(IPC.sessionGet, null, () => hub.getSession());
  handle(IPC.fortniteSetCap, CapSchema, (cap) => {
    if (!isWin) return { ok: false, message: 'Only available on Windows.' };
    if (hub.latest?.fortnite.running) return { ok: false, message: 'Close Fortnite first: the game overwrites its settings file when it exits.' };
    const r = applyFortniteCap(path.join(ud(), 'fortnite-backup'), cap);
    if (r.ok) optimizer.note(cap === 0 ? 'Stable FPS Lock removed' : `Stable FPS Lock: ${cap} FPS`, r.message);
    return r;
  });
  handle(IPC.closableCatalog, null, () => closableCatalog());
  handle(IPC.fortniteProfiles, null, () => Object.values(PROFILES));
  handle(IPC.fortniteApplyProfile, ProfileSchema, (req) => {
    if (!isWin) return { ok: false, message: 'Only available on Windows.', changed: [] };
    if (hub.latest?.fortnite.running) return { ok: false, message: 'Close Fortnite first: the game overwrites its settings file when it exits.', changed: [] };
    const r = applyFortniteProfile(path.join(ud(), 'fortnite-backup'), req.profile, req.cap);
    if (r.ok && r.changed.length) optimizer.note(`Fortnite profile: ${PROFILES[req.profile].name}`, r.message);
    return r;
  });
  handle(IPC.updateCheck, null, () => updater.check());
  handle(IPC.updateDownload, null, () => updater.download());
  handle(IPC.updateInstall, null, () => updater.install());
  handle(IPC.updateGet, null, () => updater.status);

  handle(IPC.benchRun, BenchSchema, async (req, e) => {
    if (busy.bench) throw new Error('A benchmark is already running');
    busy.bench = true;
    try {
      const r = await runBenchmark(req, hub, (p) => e.sender.send(IPC.benchProgress, p));
      const s = benchStore.read(); s.results.unshift(r); s.results = s.results.slice(0, 50); benchStore.write(s);
      return r;
    } finally { busy.bench = false; }
  });
  handle(IPC.benchList, null, () => benchStore.read().results);
  handle(IPC.benchClear, null, () => { benchStore.write({ results: [] }); return true; });

  handle(IPC.settingsGet, null, () => settings);
  handle(IPC.settingsSet, SettingsSchema, (patch) => {
    const prevInterval = settings.monitorIntervalMs;
    settings = { ...settings, ...patch };
    settingsStore.write(settings);
    if (patch.monitorIntervalMs && patch.monitorIntervalMs !== prevInterval) hub.restart();
    return settings;
  });
  handle(IPC.pickPresentMon, null, async () => {
    if (!win) return settings;
    const r = await dialog.showOpenDialog(win, { title: 'Select PresentMon executable', properties: ['openFile'], filters: [{ name: 'PresentMon', extensions: ['exe'] }] });
    if (!r.canceled && r.filePaths[0]) { settings = { ...settings, presentMonPath: r.filePaths[0] }; settingsStore.write(settings); }
    return settings;
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  registerIpc();
  createWindow();
  hub.start();
  if (settings.autoCheckUpdates) setTimeout(() => void updater.check(), 8000);
});
app.on('window-all-closed', () => { hub.shutdown(); app.quit(); });
app.on('web-contents-created', (_e, wc) => wc.on('will-attach-webview', (ev) => ev.preventDefault()));
