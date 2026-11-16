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
    'TWECD only reads this file. Change settings inside Fortnite (Settings > Video) so the game stays in control of its own files.',
    'In Fortnite: enable NVIDIA Reflex "On + Boost" for lower latency.',
  ];
  return { found: true, path, settings: s, notes };
}
