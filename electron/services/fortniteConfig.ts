import type { FortniteConfigReport, FortniteSetting } from '../../shared/types';

export function parseIni(text: string): Map<string, string> {
  // Flat map "key" -> value (last wins). Fortnite keys are unique across the sections we read.
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('[')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out.set(line.slice(0, eq).trim().toLowerCase(), line.slice(eq + 1).trim());
  }
  return out;
}

const QUALITY = ['Low', 'Medium', 'High', 'Epic', 'Cinematic'];
const q = (v: string | null) => (v === null ? null : QUALITY[parseInt(v, 10)] ?? v);
const bool = (v: string | null) => (v === null ? null : /^true$/i.test(v) ? 'On' : 'Off');

/**
 * Read-only analysis of Fortnite's GameUserSettings.ini.
 * Recommendations target maximum, stable FPS on an RTX 5060 8GB + i5-14600K.
 * TWECD never writes to this file; the user applies settings in-game.
 */
export function analyzeFortniteConfig(text: string, path: string): FortniteConfigReport {
  const ini = parseIni(text);
  const get = (k: string) => ini.get(k.toLowerCase()) ?? null;
  const s: FortniteSetting[] = [];
  const add = (key: string, label: string, current: string | null, recommended: string, ok: boolean | null, note: string) =>
    s.push({ key, label, current, recommended, ok: current === null ? null : ok, note });

  const level = get('PreferredFeatureLevel');
  const rhi = get('PreferredRHI');
  const perfMode = level !== null ? /es31/i.test(level) : null;
  const modeName = perfMode ? 'Performance' : rhi ? rhi.toUpperCase() : null;
  add('PreferredFeatureLevel', 'Rendering Mode', modeName, 'Performance', perfMode === true,
    'Performance mode gives the highest FPS on this hardware and lowers VRAM use. It is the only realistic path toward very high frame rates (500+).');

  const fl = get('FrameRateLimit');
  const flNum = fl === null ? null : parseFloat(fl);
  add('FrameRateLimit', 'Frame Rate Limit', flNum === null ? null : flNum === 0 ? 'Unlimited' : `${Math.round(flNum)} FPS`, 'Unlimited (or cap just below your stable FPS)',
    flNum === 0 || (flNum !== null && flNum >= 360),
    'Unlimited lets the game run as fast as the hardware allows. If FPS swings a lot, a cap slightly below your average gives smoother frame times.');

  const vs = get('bUseVSync');
  add('bUseVSync', 'VSync', bool(vs), 'Off', vs !== null && !/^true$/i.test(vs), 'VSync caps FPS to your refresh rate and adds input latency.');

  const fm = get('FullscreenMode');
  const fmName = fm === null ? null : ['Fullscreen', 'Windowed Fullscreen', 'Windowed'][parseInt(fm, 10)] ?? fm;
  add('FullscreenMode', 'Window Mode', fmName, 'Fullscreen', fm === '0', 'Exclusive fullscreen usually gives the most consistent frame pacing.');

  const rx = get('ResolutionSizeX'); const ry = get('ResolutionSizeY');
  add('Resolution', 'Resolution', rx && ry ? `${rx} x ${ry}` : null, 'Native monitor resolution', null, 'Keep native resolution; lower 3D Resolution instead if you are GPU-bound.');

  const rq = get('sg.ResolutionQuality');
  add('sg.ResolutionQuality', '3D Resolution', rq === null ? null : `${parseFloat(rq).toFixed(0)}%`, '100% (lower only if GPU-bound)', rq !== null && parseFloat(rq) >= 70,
    'Below ~70% the image gets very blurry. Only lower it if the GPU is at 95%+ usage.');

  const lowKeys: [string, string, number, string][] = [
    ['sg.ShadowQuality', 'Shadows', 0, 'Shadows are one of the heaviest settings for both CPU and GPU.'],
    ['sg.GlobalIlluminationQuality', 'Global Illumination', 0, 'Heavy GPU cost; little competitive value.'],
    ['sg.ReflectionQuality', 'Reflections', 0, 'Heavy GPU cost.'],
    ['sg.PostProcessQuality', 'Post Processing', 0, 'Bloom and similar effects; costs FPS and visibility.'],
    ['sg.EffectsQuality', 'Effects', 0, 'Explosion/build effects; spikes during fights.'],
    ['sg.FoliageQuality', 'Foliage', 0, 'Less grass/bushes to draw.'],
    ['sg.AntiAliasingQuality', 'Anti-Aliasing', 0, 'Off for max FPS (Performance mode).'],
    ['sg.ViewDistanceQuality', 'View Distance', 2, 'Medium/Far is a good balance; Epic costs CPU in late game.'],
    ['sg.TextureQuality', 'Textures', 2, '8 GB VRAM handles Medium/High in Performance mode; lower if VRAM is near full.'],
    ['sg.ShadingQuality', 'Shading', 1, 'Low/Medium for high FPS.'],
  ];
  for (const [key, label, max, note] of lowKeys) {
    const v = get(key);
    add(key, label, q(v), max === 0 ? 'Low' : `${QUALITY[max]} or lower`, v !== null && parseInt(v, 10) <= max, note);
  }

  const mb = get('bMotionBlur');
  add('bMotionBlur', 'Motion Blur', bool(mb), 'Off', mb !== null && !/^true$/i.test(mb), 'Blurs fast movement; off is clearer and cheaper.');
  const rt = get('bRayTracing');
  add('bRayTracing', 'Ray Tracing', bool(rt), 'Off', rt !== null && !/^true$/i.test(rt), 'Very heavy for an RTX 5060 at high FPS targets.');

  const notes = [
    'Use "Apply Max FPS settings" to set these automatically (Fortnite must be closed). Your original file is backed up and can be restored.',
    'In Fortnite: enable NVIDIA Reflex "On + Boost" for lower latency (not stored in this file).',
  ];
  return { found: true, path, settings: s, notes };
}

// ---------- Max-FPS profile (written only with user confirmation, original is backed up) ----------
const GUS = '/Script/FortniteGame.FortGameUserSettings';
type Target = { section: string; key: string; value: string; label: string; onlyIfAbove?: number };

/** Profile for the highest stable FPS on RTX 5060 8GB + i5-14600K. */
export const MAX_FPS_PROFILE: Target[] = [
  { section: 'D3DRHIPreference', key: 'PreferredRHI', value: 'dx11', label: 'Rendering Mode: Performance' },
  { section: 'D3DRHIPreference', key: 'PreferredFeatureLevel', value: 'es31', label: 'Rendering Mode: Performance' },
  { section: GUS, key: 'FrameRateLimit', value: '0.000000', label: 'Frame Rate Limit: Unlimited' },
  { section: GUS, key: 'bUseVSync', value: 'False', label: 'VSync: Off' },
  { section: GUS, key: 'FullscreenMode', value: '0', label: 'Window Mode: Fullscreen' },
  { section: GUS, key: 'LastConfirmedFullscreenMode', value: '0', label: 'Window Mode: Fullscreen' },
  { section: GUS, key: 'PreferredFullscreenMode', value: '0', label: 'Window Mode: Fullscreen' },
  { section: GUS, key: 'bMotionBlur', value: 'False', label: 'Motion Blur: Off' },
  { section: GUS, key: 'bRayTracing', value: 'False', label: 'Ray Tracing: Off' },
  { section: 'ScalabilityGroups', key: 'sg.ResolutionQuality', value: '100.000000', label: '3D Resolution: 100%' },
  { section: 'ScalabilityGroups', key: 'sg.ViewDistanceQuality', value: '2', label: 'View Distance: Far or lower', onlyIfAbove: 2 },
  { section: 'ScalabilityGroups', key: 'sg.TextureQuality', value: '1', label: 'Textures: Medium or lower', onlyIfAbove: 2 },
  { section: 'ScalabilityGroups', key: 'sg.ShadowQuality', value: '0', label: 'Shadows: Off' },
  { section: 'ScalabilityGroups', key: 'sg.GlobalIlluminationQuality', value: '0', label: 'Global Illumination: Low' },
  { section: 'ScalabilityGroups', key: 'sg.ReflectionQuality', value: '0', label: 'Reflections: Low' },
  { section: 'ScalabilityGroups', key: 'sg.PostProcessQuality', value: '0', label: 'Post Processing: Low' },
  { section: 'ScalabilityGroups', key: 'sg.EffectsQuality', value: '0', label: 'Effects: Low' },
  { section: 'ScalabilityGroups', key: 'sg.FoliageQuality', value: '0', label: 'Foliage: Low' },
  { section: 'ScalabilityGroups', key: 'sg.AntiAliasingQuality', value: '0', label: 'Anti-Aliasing: Off' },
  { section: 'ScalabilityGroups', key: 'sg.ShadingQuality', value: '0', label: 'Shading: Low' },
];

/**
 * Applies MAX_FPS_PROFILE to an ini text. Only touches listed keys, keeps every other line,
 * comment, order and line ending. Missing keys are added to their section (section created if absent).
 */
export function applyMaxFps(text: string): { text: string; changed: string[] } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const changed = new Set<string>();
  const sectionOf: string[] = [];
  let cur = '';
  for (const l of lines) { const m = l.trim().match(/^\[(.+)\]$/); if (m) cur = m[1]; sectionOf.push(cur); }

  for (const t of MAX_FPS_PROFILE) {
    const idx = lines.findIndex((l, i) => sectionOf[i] === t.section && l.trim().toLowerCase().startsWith(t.key.toLowerCase() + '='));
    if (idx >= 0) {
      const curVal = lines[idx].slice(lines[idx].indexOf('=') + 1).trim();
      if (t.onlyIfAbove !== undefined && parseFloat(curVal) <= t.onlyIfAbove) continue;
      if (curVal.toLowerCase() === t.value.toLowerCase()) continue;
      lines[idx] = `${t.key}=${t.value}`;
      changed.add(t.label);
      continue;
    }
    // Key absent: optional keys (only-if-above, ray tracing, fullscreen bookkeeping) are left alone.
    if (t.onlyIfAbove !== undefined || t.key === 'bRayTracing' || t.key.endsWith('FullscreenMode') && t.key !== 'FullscreenMode') continue;
    let secIdx = lines.findIndex((l) => l.trim() === `[${t.section}]`);
    if (secIdx < 0) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', `[${t.section}]`);
      sectionOf.push('', t.section);
      secIdx = lines.length - 1;
    }
    let end = secIdx + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
    while (end > secIdx + 1 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, `${t.key}=${t.value}`);
    sectionOf.splice(end, 0, t.section);
    changed.add(t.label);
  }
  return { text: lines.join(eol), changed: [...changed] };
}
