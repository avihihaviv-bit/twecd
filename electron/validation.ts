import { z } from 'zod';
import { isValidHost } from './services/ping';

const host = z.string().trim().min(1).max(253).refine(isValidHost, 'Invalid host');
export const NetTargetSchema = z.object({ label: z.string().trim().min(1).max(40), host });
export const NetTestSchema = z.object({ targets: z.array(NetTargetSchema).min(1).max(8), count: z.number().int().min(5).max(100) });
export const OptId = z.enum(['game-mode-on', 'power-plan-high', 'background-recording-off', 'close-background-apps', 'clean-temp-files', 'fortnite-max-fps', 'windowed-optimizations-on']);
export const ApplySchema = z.object({ ids: z.array(OptId).min(1).max(10), pids: z.array(z.number().int().positive()).max(200).optional() });
export const BenchSchema = z.object({ label: z.enum(['before', 'after']), durationSec: z.number().int().min(10).max(600), pingHost: host });
export const SettingsSchema = z.object({
  monitorIntervalMs: z.number().int().min(500).max(5000).optional(),
  netTargets: z.array(NetTargetSchema).min(1).max(8).optional(),
  trackFortniteWhileMinimized: z.boolean().optional(),
  presentMonPath: z.string().max(500).nullable().optional(),
  autoBoost: z.boolean().optional(),
  autoBoostApps: z.array(z.string().max(80)).max(60).optional(),
}).strict();
export const VisibleSchema = z.boolean();
/** 0 = unlimited, otherwise 30..1000 FPS */
export const CapSchema = z.number().int().refine((v) => v === 0 || (v >= 30 && v <= 1000), 'Cap must be 0 (unlimited) or 30-1000');

const ALLOWED_EXTERNAL = [
  /^ms-settings:(gaming-gamemode|gaming-gamedvr|startupapps|powersleep|display-advancedgraphics|network-status|windowsupdate)$/,
  /^https:\/\/(www\.)?nvidia\.com\//,
  /^https:\/\/github\.com\/GameTechDev\/PresentMon/,
  /^https:\/\/(www\.)?epicgames\.com\//,
];
export const ExternalSchema = z.string().max(300).refine((u) => ALLOWED_EXTERNAL.some((r) => r.test(u)), 'URL not allowed');
