import { z } from 'zod';
import { isValidHost } from './services/ping';

const host = z.string().trim().min(1).max(253).refine(isValidHost, 'Invalid host');
export const NetTargetSchema = z.object({ label: z.string().trim().min(1).max(40), host });
export const NetTestSchema = z.object({ targets: z.array(NetTargetSchema).min(1).max(8), count: z.number().int().min(5).max(100) });
export const OptId = z.enum(['game-mode-on', 'power-plan-high', 'background-recording-off', 'close-background-apps', 'clean-temp-files', 'fortnite-max-fps', 'windowed-optimizations-on', 'game-capture-off', 'fortnite-gpu-preference', 'hags-on', 'startup-apps-off', 'visual-effects-performance', 'fortnite-power-throttling-off', 'delivery-optimization-p2p-off']);
export const ApplySchema = z.object({ ids: z.array(OptId).min(1).max(20), pids: z.array(z.number().int().positive()).max(200).optional(), startupNames: z.array(z.string().min(1).max(260)).max(60).optional() });
export const RestoreSchema = z.array(OptId).min(1).max(20).nullable().optional();
export const BenchSchema = z.object({ scenario: z.enum(['creative-freebuild', 'build-fight', '1v1', 'reload', 'battle-royale', 'other']).optional(), label: z.string().trim().min(1).max(40), durationSec: z.number().int().min(10).max(600), pingHost: host });
export const SettingsSchema = z.object({
  monitorIntervalMs: z.number().int().min(500).max(5000).optional(),
  netTargets: z.array(NetTargetSchema).min(1).max(8).optional(),
  trackFortniteWhileMinimized: z.boolean().optional(),
  presentMonPath: z.string().max(500).nullable().optional(),
  autoBoost: z.boolean().optional(),
  livePingHost: host.optional(),
  autoCheckUpdates: z.boolean().optional(),
  nvidiaChecklist: z.array(z.string().max(40)).max(30).optional(),
  autoMode: z.boolean().optional(),
  autoProfile: z.enum(['ultra', 'competitive', 'high-fps', 'stability', 'dx12']).optional(),
  autoLock: z.boolean().optional(),
  autoLockTarget: z.number().int().min(60).max(1000).optional(),
  autoBoostApps: z.array(z.string().max(80)).max(60).optional(),
}).strict();
export const VisibleSchema = z.boolean();
/** 0 = unlimited, otherwise 30..1000 FPS */
export const CapSchema = z.number().int().refine((v) => v === 0 || (v >= 30 && v <= 1000), 'Cap must be 0 (unlimited) or 30-1000');

const ALLOWED_EXTERNAL = [
  /^ms-settings:(gaming-gamemode|gaming-gamedvr|startupapps|powersleep|display-advancedgraphics|network-status|windowsupdate)$/,
  /^https:\/\/(www\.)?nvidia\.com\//,
  /^https:\/\/github\.com\/GameTechDev\/PresentMon/,
  /^https:\/\/github\.com\/avihihaviv-bit\/twecd\/releases/,
  /^https:\/\/(www\.)?epicgames\.com\//,
  /^https:\/\/(www\.)?gigabyte\.com\//,
  /^https:\/\/(www\.)?hwinfo\.com\//,
  /^https:\/\/(www\.)?intel\.com\//,
];
export const ExternalSchema = z.string().max(300).refine((u) => ALLOWED_EXTERNAL.some((r) => r.test(u)), 'URL not allowed');

export const ProfileSchema = z.object({ profile: z.enum(['ultra', 'competitive', 'high-fps', 'stability', 'dx12']), cap: z.number().int().min(30).max(1000).optional() });
