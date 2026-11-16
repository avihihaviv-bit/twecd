import { app } from 'electron';
import type { UpdateStatus } from '../../shared/types';

/**
 * Updates from GitHub Releases, ONLY with user consent:
 * checking is automatic (can be disabled), downloading and installing each require a click.
 */
export class Updater {
  status: UpdateStatus = { state: 'idle' };
  private au: typeof import('electron-updater').autoUpdater | null = null;

  constructor(private emit: (s: UpdateStatus) => void) {}

  private set(s: UpdateStatus) { this.status = s; this.emit(s); }

  private async load() {
    if (this.au) return this.au;
    if (!app.isPackaged) { this.set({ state: 'disabled', message: 'Updates are available in the installed app only.' }); return null; }
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-available', (i) => this.set({ state: 'available', version: i.version }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'none' }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', version: this.status.version, percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => this.set({ state: 'ready', version: i.version }));
    autoUpdater.on('error', (e) => this.set({ state: 'error', message: String(e?.message ?? e).slice(0, 200) }));
    this.au = autoUpdater;
    return autoUpdater;
  }

  async check() { const au = await this.load(); if (au) await au.checkForUpdates().catch(() => undefined); return this.status; }
  async download() { const au = await this.load(); if (au && this.status.state === 'available') await au.downloadUpdate().catch(() => undefined); return this.status; }
  async install() { const au = await this.load(); if (au && this.status.state === 'ready') au.quitAndInstall(false, true); return this.status; }
}
