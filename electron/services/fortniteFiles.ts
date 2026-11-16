import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FortniteConfigReport } from '../../shared/types';
import { analyzeFortniteConfig } from './fortniteConfig';

export function fortniteConfigPath(): string {
  const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
}

/** Read-only. */
export function readFortniteConfig(): FortniteConfigReport {
  const p = fortniteConfigPath();
  try {
    return analyzeFortniteConfig(fs.readFileSync(p, 'utf8'), p);
  } catch {
    return { found: false, path: p, settings: [], notes: ['Fortnite settings file not found. Launch Fortnite once (and change any video setting) so it is created.'] };
  }
}

export const FORTNITE_LAUNCH_URI = 'com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true';
