import type { Finding, LiveMetrics, Recommendation, ScanResult, ScanStep, ScanStepId, StaticInfo } from '../../shared/types';
import { analyzeBottleneck, type PerfSample } from './bottleneck';
import { isWin, sleep } from './exec';
import { readFortniteConfig } from './fortniteFiles';
import type { MonitorHub } from './monitor';
import { pingSeries, getNetContext } from './network';
import { diagnose } from './ping';
import { friendlyName } from './processCatalog';
import { INTEL_SAFE_MICROCODE, isRaptorLake } from './winProbe';
import { getBackgroundRecording, getGameMode, getHags, listPowerSchemes, listProcesses, listStartupApps, listUserStartup, scanTemp, regQuery, regRead, dwordOf, dxFlagOn, fortniteExePath, DX_GLOBAL, DX_PREFS_KEY, GAMEDVR_KEY, HIGH_PERF, ULTIMATE } from './windows';

const LABELS: Record<ScanStepId, string> = {
  cpu: 'Scan CPU', gpu: 'Scan GPU', vram: 'Scan VRAM', ram: 'Scan RAM', processes: 'Scan running processes',
  'fortnite-config': 'Analyze Fortnite configuration', 'game-mode': 'Check Windows Game Mode', power: 'Inspect power settings',
  network: 'Check network stability', bottlenecks: 'Identify performance bottlenecks',
};

export async function runScan(info: StaticInfo, hub: MonitorHub, onStep: (s: ScanStep) => void): Promise<ScanResult> {
  const startedAt = Date.now();
  const steps: ScanStep[] = (Object.keys(LABELS) as ScanStepId[]).map((id) => ({ id, label: LABELS[id], status: 'pending', summary: '' }));
  const findings: Finding[] = [];
  const recs: Recommendation[] = [];
  const samples: LiveMetrics[] = [];
  const release = hub.hold((m) => samples.push(m));
  const step = async (id: ScanStepId, fn: () => Promise<[ScanStep['status'], string]>) => {
    const s = steps.find((x) => x.id === id)!;
    s.status = 'running'; onStep({ ...s });
    try { const [st, sum] = await fn(); s.status = st; s.summary = sum; }
    catch (e) { s.status = 'error'; s.summary = String(e).slice(0, 160); }
    onStep({ ...s });
  };
  const f = (x: Finding) => findings.push(x);

  try {
    // 1. CPU (collect a few real samples first)
    await step('cpu', async () => {
      await sleep(3200);
      const avg = samples.length ? samples.reduce((a, m) => a + m.cpu.usage, 0) / samples.length : null;
      const t = info.cpu.topology;
      f({ id: 'cpu-model', area: 'CPU', severity: 'info', title: info.cpu.model, detail: `${info.cpu.logicalCores} threads${t ? `: ${t.pCoreThreads.length / 2} P-cores (HT) + ${t.eCoreThreads.length} E-cores` : ''}. Base clock ${info.cpu.baseClockMHz ?? '?'} MHz.` });
      if (isRaptorLake(info.cpu.model)) {
        const mc = info.platformInfo?.microcode ?? null;
        const bios = info.platformInfo;
        const biosLine = bios?.biosVersion ? `BIOS ${bios.biosVersion}${bios.biosDate ? ` (${bios.biosDate})` : ''}${bios.board ? ` on ${bios.board}` : ''}.` : 'BIOS version unavailable.';
        if (mc !== null && mc < INTEL_SAFE_MICROCODE) f({ id: 'cpu-microcode', area: 'CPU health', severity: 'bad', title: `Outdated CPU microcode 0x${mc.toString(16).toUpperCase()}`, detail: 'Intel 13th/14th-gen CPUs need microcode 0x12B or newer to prevent long-term instability (Vmin shift).',
          evidence: [`Windows reports microcode revision 0x${mc.toString(16).toUpperCase()}; Intel's fix is 0x12B (Sept 2024) or later.`, biosLine],
          fix: 'Install the latest BIOS from your motherboard manufacturer\'s website, then keep "Intel Default Settings" enabled. TWECD cannot and will not change BIOS settings.', expected: 'Long-term CPU stability; no direct FPS change.', risk: 'low', rollback: 'Handled by your motherboard\'s BIOS update tool.' });
        else f({ id: 'cpu-microcode', area: 'CPU health', severity: mc !== null ? 'good' : 'info', title: mc !== null ? `CPU microcode 0x${mc.toString(16).toUpperCase()} is up to date` : 'Check your BIOS for Intel microcode 0x12B+', detail: `${biosLine} Keep "Intel Default Settings" enabled in BIOS for 13th/14th-gen stability.` });
      }
      const temp = samples.at(-1)?.cpu.tempC ?? null;
      if (temp !== null && temp >= 95) f({ id: 'cpu-hot', area: 'CPU', severity: 'bad', title: `CPU at ${temp.toFixed(0)} °C`, detail: 'At this temperature the i5-14600K will thermal-throttle. Check cooler mounting, fan curve and case airflow.' });
      return ['done', `${avg !== null ? `${avg.toFixed(0)}% load` : 'load measured'}${temp !== null ? `, ${temp.toFixed(0)} °C` : ', temperature unavailable'}`];
    });

    // 2. GPU
    await step('gpu', async () => {
      const g = samples.at(-1)?.gpu ?? hub.gpu.latest;
      if (!g) { f({ id: 'gpu-none', area: 'GPU', severity: 'warn', title: 'NVIDIA GPU telemetry unavailable', detail: `${hub.gpu.status}. Install/update the NVIDIA driver to enable GPU monitoring.` }); return ['unavailable', hub.gpu.status]; }
      f({ id: 'gpu-model', area: 'GPU', severity: 'info', title: g.name, detail: `Driver ${g.driver}. Keep the driver current via the NVIDIA App; new Game Ready drivers often include Fortnite fixes.` });
      if (g.throttleReasons.length) f({ id: 'gpu-throttle', area: 'GPU', severity: 'warn', title: 'GPU clock limited right now', detail: g.throttleReasons.join(', ') + '. Power-limit at full load is normal; thermal limits are not.' });
      const d = info.display;
      if (d?.currentHz && d.maxHz && d.currentHz < d.maxHz - 1) f({ id: 'disp-hz', area: 'Display', severity: 'bad', title: `Monitor runs at ${d.currentHz} Hz but supports ${d.maxHz} Hz`, detail: 'Windows is not using your monitor\'s full refresh rate, so extra frames are never shown.', evidence: [`Current mode ${d.width}x${d.height} @ ${d.currentHz} Hz; the monitor reports modes up to ${d.maxHz} Hz.`], fix: `Settings > System > Display > Advanced display > Choose a refresh rate: ${d.maxHz} Hz. Use DisplayPort (or a cable/port that supports it).`, expected: 'Smoother motion at high FPS.', risk: 'none', rollback: 'Pick the previous refresh rate in the same menu.' });
      else if (d?.currentHz) f({ id: 'disp-hz', area: 'Display', severity: 'good', title: `Monitor: ${d.width}x${d.height} @ ${d.currentHz} Hz`, detail: d.maxHz ? `Matches the highest refresh the monitor reports (${d.maxHz} Hz). G-SYNC/VRR status is set in NVIDIA Control Panel and is not readable by TWECD.` : 'Highest supported refresh rate not reported by Windows; check Settings > Display > Advanced display.' });
      if (g.tempC !== null && g.tempC >= 83) f({ id: 'gpu-hot', area: 'GPU', severity: 'warn', title: `GPU at ${g.tempC} °C`, detail: 'Improve airflow or clean dust filters; high temperatures reduce boost clocks.' });
      recs.push({ id: 'nv-panel', optimizationId: null, area: 'NVIDIA', title: 'NVIDIA settings for Fortnite (manual)', why: 'These driver settings help high-FPS play. TWECD does not change GPU clocks, voltage, or firmware.', change: 'In NVIDIA App > Graphics > Fortnite: Power management mode = Prefer maximum performance, Vertical sync = Off, Low Latency Mode = On (Reflex in-game takes over), Shader cache size = Driver default or larger.', impact: 'medium', reversible: true, selectedByDefault: false });
      return ['done', `${g.name}, ${g.usage ?? '?'}% load, ${g.tempC ?? '?'} °C`];
    });

    // 3. VRAM
    await step('vram', async () => {
      const g = samples.at(-1)?.gpu ?? hub.gpu.latest;
      if (!g || g.vramUsedMB === null || !g.vramTotalMB) return ['unavailable', 'VRAM telemetry unavailable'];
      const pct = (g.vramUsedMB / g.vramTotalMB) * 100;
      if (pct > 60 && !hub.latest?.fortnite.running) f({ id: 'vram-bg', area: 'VRAM', severity: 'warn', title: `${pct.toFixed(0)}% VRAM used before gaming`, detail: 'Browsers, Discord and overlays use video memory too. With 8 GB, free VRAM matters for stutter-free texture streaming.' });
      return ['done', `${(g.vramUsedMB / 1024).toFixed(1)} / ${(g.vramTotalMB / 1024).toFixed(1)} GB (${pct.toFixed(0)}%)`];
    });

    // 4. RAM
    await step('ram', async () => {
      const r = samples.at(-1)?.ram;
      if (!r) return ['unavailable', 'No sample'];
      if (info.ram.channelsHint === 'single') f({ id: 'ram-single', area: 'RAM', severity: 'bad', title: 'RAM runs in single channel', detail: 'Dual channel can noticeably raise FPS and 1% lows on Intel CPUs.', evidence: [info.ram.channelEvidence ?? ''], fix: 'Install memory in matched pairs in the slots your motherboard manual marks for dual channel (usually A2 + B2).', expected: 'Higher 1% lows in CPU-bound scenes.', risk: 'low', rollback: 'Move the module back.' });
      else if (info.ram.channelsHint) f({ id: 'ram-dual', area: 'RAM', severity: 'good', title: 'Dual-channel memory', detail: info.ram.channelEvidence ?? '' });
      const speed = info.ram.modules[0]?.speedMHz;
      if (speed) f({ id: 'ram-speed', area: 'RAM', severity: 'info', title: `Memory running at ${speed} MT/s (${info.ram.modules[0]?.type ?? 'unknown type'})`, detail: 'If your kit is rated faster, enable XMP in BIOS. TWECD does not change BIOS settings.' });
      if (r.percent >= 75) f({ id: 'ram-high', area: 'RAM', severity: 'warn', title: `${r.percent.toFixed(0)}% RAM in use before gaming`, detail: 'Fortnite commonly needs several GB. Closing background apps lowers stutter risk.' });
      return ['done', `${(r.usedMB / 1024).toFixed(1)} / ${(r.totalMB / 1024).toFixed(1)} GB used (${r.percent.toFixed(0)}%)`];
    });

    // 5. Processes
    await step('processes', async () => {
      const list = await listProcesses(true);
      const closable = list.filter((p) => p.category === 'closable');
      const grouped = new Map<string, typeof closable[number]>();
      for (const p of closable) {
        const k = p.name.toLowerCase(); const g = grouped.get(k);
        grouped.set(k, g ? { ...g, memMB: g.memMB + p.memMB, cpuPercent: (g.cpuPercent ?? 0) + (p.cpuPercent ?? 0) } : { ...p });
      }
      const pick = closable.filter((p) => p.memMB > 30 || (p.cpuPercent ?? 0) > 1);
      if (pick.length) {
        const totalMem = [...grouped.values()].reduce((a, p) => a + p.memMB, 0);
        recs.push({ id: 'rec-close-apps', optimizationId: 'close-background-apps', area: 'Processes', title: `Close ${grouped.size} background app${grouped.size > 1 ? 's' : ''}`, why: `These apps use about ${(totalMem / 1024).toFixed(1)} GB RAM and CPU time that Fortnite could use. Save your work in them first.`, change: `Closes: ${[...grouped.values()].map((p) => friendlyName(p.name)).join(', ')}. Windows processes and anti-cheat are never touched.`, impact: totalMem > 1500 ? 'high' : 'medium', reversible: true, selectedByDefault: false, processes: pick.sort((a, b) => b.memMB - a.memMB) });
      }
      if (isWin) {
        const user = (await listUserStartup()).filter((e) => e.enabled && !e.essential);
        if (user.length) recs.push({ id: 'rec-startup', optimizationId: 'startup-apps-off', area: 'Startup', title: `Disable startup apps you don't need (${user.length} found)`, why: 'Apps that start with Windows keep running in the background while you play. Disabled apps still work when you open them yourself. Security, audio, graphics and anti-cheat entries are never listed.', change: 'Disables the ticked entries exactly like Task Manager > Startup apps (current user).', impact: 'medium', reversible: true, selectedByDefault: false, startup: user.map((e) => ({ name: e.name, command: e.command })) });
        const machine = (await listStartupApps()).filter((s) => s.scope === 'machine');
        if (machine.length) f({ id: 'startup-machine', area: 'Startup', severity: 'info', title: `${machine.length} machine-wide startup entries`, detail: `${machine.slice(0, 6).map((s) => s.name).join(', ')}. These are installed for all users (often drivers); manage them in Settings > Apps > Startup if needed.` });
      }
      return ['done', `${list.length} processes, ${grouped.size} closable app${grouped.size === 1 ? '' : 's'} found`];
    });

    // 6. Fortnite config
    await step('fortnite-config', async () => {
      const r = readFortniteConfig();
      if (!r.found) return ['unavailable', 'Fortnite settings file not found'];
      const bad = r.settings.filter((s) => s.ok === false);
      if (bad.length) recs.push({ id: 'rec-fn', optimizationId: 'fortnite-max-fps', area: 'Fortnite', title: `Apply Max FPS settings to Fortnite (${bad.length} change${bad.length > 1 ? 's' : ''})`, why: 'The biggest FPS gain available: Performance rendering mode, unlimited frame rate, VSync off and heavy effects off. On an RTX 5060 + i5-14600K this commonly raises FPS far more than any Windows tweak. Fortnite must be closed while applying.', change: `Edits only Fortnite's settings file (GameUserSettings.ini), never the game or anti-cheat. ${bad.map((s) => `${s.label}: ${s.current} -> ${s.recommended}`).join(' | ')}. Your original file is backed up; Restore Defaults puts it back.`, impact: 'high', reversible: true, selectedByDefault: true });
      return ['done', bad.length ? `${bad.length} settings could be faster` : 'Settings already tuned for FPS'];
    });

    // 7. Game Mode + background recording
    await step('game-mode', async () => {
      if (!isWin) return ['unavailable', 'Windows only'];
      const gm = await getGameMode();
      const rec = await getBackgroundRecording();
      if (gm.enabled === false) recs.push({ id: 'rec-gm', optimizationId: 'game-mode-on', area: 'Windows', title: 'Turn on Game Mode', why: 'Game Mode tells Windows to prioritize the game and pause Windows Update installs and notifications while you play.', change: 'Sets Settings > Gaming > Game Mode to On (HKCU GameBar\\AutoGameModeEnabled = 1).', impact: 'medium', reversible: true, selectedByDefault: true });
      if (rec.enabled) recs.push({ id: 'rec-dvr', optimizationId: 'background-recording-off', area: 'Windows', title: 'Turn off background recording', why: '"Record what happened" continuously encodes gameplay in the background, which costs GPU time and can cause hitches.', change: 'Sets Settings > Gaming > Captures > Record what happened to Off. Manual recording still works.', impact: 'medium', reversible: true, selectedByDefault: true });
      const dx = (await regQuery(DX_PREFS_KEY, DX_GLOBAL))?.data ?? null;
      if (!dxFlagOn(dx, 'SwapEffectUpgradeEnable')) recs.push({ id: 'rec-dx', optimizationId: 'windowed-optimizations-on', area: 'Windows', title: 'Turn on optimizations for windowed games', why: 'Windows 11 feature that lowers latency and can raise FPS for games in borderless/windowed mode.', change: 'Sets Settings > System > Display > Graphics > Optimizations for windowed games to On.', impact: 'low', reversible: true, selectedByDefault: true });
      const capture = dwordOf(await regQuery('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled'));
      const appCap = dwordOf(await regQuery(GAMEDVR_KEY, 'AppCaptureEnabled'));
      if (capture !== 0 || appCap !== 0) recs.push({ id: 'rec-capture', optimizationId: 'game-capture-off', area: 'Xbox Game Bar', title: 'Turn off Xbox Game Bar game capture', why: 'Game Bar keeps its capture system hooked into games so it can record. Turning capture off removes that overhead. Game Mode keeps working.', change: 'Sets GameDVR_Enabled = 0 and AppCaptureEnabled = 0 (current user). Win+Alt+R clips will not work until restored.', impact: 'low', reversible: true, selectedByDefault: true });
      const exe = fortniteExePath();
      if (exe) {
        const pref = await regRead(DX_PREFS_KEY, exe);
        if (!pref || !/GpuPreference=2/i.test(pref.data)) recs.push({ id: 'rec-gpupref', optimizationId: 'fortnite-gpu-preference', area: 'Graphics', title: 'Run Fortnite on the NVIDIA GPU', why: 'The i5-14600K has its own integrated graphics. Marking Fortnite as "High performance" guarantees Windows never runs it on the integrated GPU.', change: `Settings > System > Display > Graphics: ${exe} = High performance.`, impact: 'low', reversible: true, selectedByDefault: true });
      }
      const hags = await getHags();
      if (hags === false) recs.push({ id: 'rec-hags', optimizationId: 'hags-on', area: 'Graphics', title: 'Turn on Hardware-accelerated GPU scheduling', why: 'Lets the RTX 5060 manage its own video memory scheduling. Required for DLSS Frame Generation and can lower latency. Effect on FPS varies by system, so benchmark before and after.', change: 'Sets HwSchMode = 2 (machine-wide). Needs administrator rights and a PC restart.', impact: 'low', reversible: true, selectedByDefault: false, needsAdmin: true, rebootRequired: true });
      else if (hags === true) f({ id: 'hags', area: 'Graphics', severity: 'good', title: 'Hardware-accelerated GPU scheduling is on', detail: 'Recommended for RTX 50-series GPUs.' });
      const vfx = dwordOf(await regQuery('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting'));
      if (vfx !== 2) recs.push({ id: 'rec-vfx', optimizationId: 'visual-effects-performance', area: 'Windows', title: 'Set Windows visual effects to Best performance', why: 'Turns off animations and shadows in Windows itself. It does not change FPS inside fullscreen Fortnite; it only makes the desktop lighter. Windows will look plainer.', change: 'System Properties > Performance Options > Adjust for best performance (current user, after sign-out).', impact: 'low', reversible: true, selectedByDefault: false });
      return ['done', `Game Mode ${gm.enabled ? 'on' : 'off'}, background recording ${rec.enabled ? 'on' : 'off'}`];
    });

    // 8. Power
    await step('power', async () => {
      if (!isWin) return ['unavailable', 'Windows only'];
      const schemes = await listPowerSchemes();
      const active = schemes.find((s) => s.active);
      const perf = schemes.find((s) => s.guid === ULTIMATE || s.guid === HIGH_PERF);
      const perfByName = perf ?? schemes.find((s) => /ultimate|high performance/i.test(s.name));
      if (active && (!perfByName || active.guid !== perfByName.guid)) recs.push({ id: 'rec-power', optimizationId: 'power-plan-high', area: 'Power', title: perfByName ? `Use the ${perfByName.name} power plan` : 'Create and use the Ultimate Performance power plan', why: 'Keeps the i5-14600K cores awake at high clocks instead of parking them, which reduces frame-time spikes and raises 1% lows. Uses a bit more power at idle.', change: perfByName ? `Switches the active power plan from "${active.name}" to "${perfByName.name}". Restore Defaults switches it back.` : `Creates Windows' built-in Ultimate Performance plan and switches to it from "${active.name}". Restore Defaults switches back and removes it.`, impact: 'medium', reversible: true, selectedByDefault: true });
      const t = scanTemp(false);
      if (t.bytes > 200 * 1048576) recs.push({ id: 'rec-temp', optimizationId: 'clean-temp-files', area: 'Storage', title: `Clean ${(t.bytes / 1048576).toFixed(0)} MB of old temporary files`, why: 'Frees disk space. This does not raise FPS by itself; it is housekeeping.', change: `Deletes ${t.files} files in your user TEMP folder that were not modified for 24+ hours. Files in use are skipped. This cannot be undone.`, impact: 'low', reversible: false, selectedByDefault: false });
      return ['done', `Active plan: ${active?.name ?? 'unknown'}`];
    });

    // 9. Network
    await step('network', async () => {
      const ctx = await getNetContext();
      const [gw, ext] = await Promise.all([
        ctx.gateway ? pingSeries({ label: 'Your router', host: ctx.gateway }, 8) : Promise.resolve(null),
        pingSeries({ label: 'Cloudflare', host: '1.1.1.1' }, 8),
      ]);
      const d = diagnose(ctx, gw, [ext]);
      if (ctx.connectionType === 'wireless') f({ id: 'net-wifi', area: 'Network', severity: 'warn', title: `On Wi-Fi${ctx.wifiSignalPct !== null ? ` (${ctx.wifiSignalPct}% signal)` : ''}`, detail: 'Wi-Fi adds jitter and packet loss compared with Ethernet. An Ethernet cable is the single most reliable ping improvement.' });
      f({ id: 'net-diag', area: 'Network', severity: d.source === 'healthy' ? 'good' : d.source === 'inconclusive' ? 'info' : 'warn', title: d.title, detail: d.explanation });
      return [ext.received ? 'done' : 'unavailable', ext.avg !== null ? `${ext.avg.toFixed(0)} ms avg, ${ext.jitter?.toFixed(1) ?? '-'} ms jitter, ${ext.lossPct.toFixed(0)}% loss (${ctx.connectionType})` : ext.error ?? 'No ping replies'];
    });

    // 10. Bottlenecks
    await step('bottlenecks', async () => {
      const ps: PerfSample[] = samples.map((m) => ({
        cpu: m.cpu.usage, maxCore: Math.max(0, ...m.cpu.perCore), gpu: m.gpu?.usage ?? null,
        vramPct: m.gpu?.vramUsedMB != null && m.gpu.vramTotalMB ? (m.gpu.vramUsedMB / m.gpu.vramTotalMB) * 100 : null,
        ramPct: m.ram.percent, cpuBusyMs: m.fps?.cpuBusyMs, gpuBusyMs: m.fps?.gpuBusyMs, frameMs: m.fps?.frameTimeAvgMs,
      }));
      const sess = hub.getSession();
      const s = sess.current ?? sess.last;
      if (s && s.diagnosis.length) {
        findings.push(...s.diagnosis);
        const hz = info.display?.currentHz;
        if (hz && s.sustainedFps) {
          const advice = s.sustainedFps >= hz
            ? `Your PC holds ${Math.round(s.sustainedFps)} FPS, above your ${hz} Hz refresh: lock at ${hz} (or Unlimited for lowest latency).`
            : `Your PC holds ${Math.round(s.sustainedFps)} FPS 90% of the time, below your ${hz} Hz refresh: a Stable FPS Lock at ${s.recommendedCap ?? '-'} gives the most even frame pacing.`;
          findings.push({ id: 'fps-vs-hz', area: 'Frame rate', severity: 'info', title: 'Frame-rate setting for your monitor', detail: advice, evidence: [`Last session: avg ${s.avgFps?.toFixed(0)} FPS, best second ${s.maxFps?.toFixed(0)}, worst second ${s.minFps?.toFixed(0)}.`], fix: 'Use Stable FPS Lock on the FPS Optimizer page.', risk: 'none', rollback: 'Set Unlimited.' });
        }
        return ['done', `From your last match: ${s.diagnosis[0].title}`];
      }
      const b = analyzeBottleneck(ps);
      findings.push(...b);
      const fn = hub.latest?.fortnite.running;
      return ['done', b.length ? b.map((x) => x.title).join('; ') : fn ? 'No bottleneck detected yet' : 'Play one match with TWECD open for an in-game bottleneck report'];
    });
  } finally {
    release();
  }
  const notApplied = [
    { title: 'NVIDIA Control Panel settings', reason: 'NVIDIA has no public way for apps to change driver profiles, and TWECD will not install third-party tools. Use the guided NVIDIA checklist in System Optimizer.' },
    { title: 'Turning off fullscreen optimizations', reason: 'Kept on: on Windows 11 they enable the flip presentation model with lower latency; disabling them has no measured benefit for Fortnite.' },
    { title: 'Disabling background apps globally', reason: 'Not changed: it breaks notifications and app updates and has no measurable FPS effect. TWECD closes or auto-closes the specific apps instead.' },
    { title: 'Network registry tweaks (Nagle, TCP)', reason: 'Not applied: Fortnite game traffic uses UDP, so TCP tweaks do not change in-game ping.' },
    { title: 'CPU scheduling / core-parking registry hacks', reason: 'Not applied: undocumented and unreliable. Game Mode and the high-performance power plan already handle scheduling and core parking.' },
    { title: 'Windows Power mode slider', reason: 'Covered by the power plan: when the Ultimate/High Performance plan is active the slider does not apply.' },
    { title: 'Fortnite Replays and NVIDIA Reflex', reason: 'Not stored in the settings file TWECD edits. Set in-game: Settings > Game > Replays Off, Settings > Video > NVIDIA Reflex On + Boost.' },
    { title: 'BIOS, XMP, overclocking, voltages', reason: 'Never automatic. TWECD only reports (e.g. memory speed, microcode) and tells you what to check.' },
    { title: 'Windows Defender, Firewall, Windows Update, system services', reason: 'Never touched. Disabling them does not raise FPS and removes protection.' },
  ];
  return { startedAt, finishedAt: Date.now(), steps, findings, recommendations: recs, notApplied };
}
