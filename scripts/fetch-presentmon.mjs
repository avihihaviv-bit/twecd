// Downloads Intel PresentMon (MIT license) into resources/bin so the installer can bundle it.
// PresentMon provides REAL frame-time data via Windows ETW. If the download fails the app still
// works; FPS shows "Unavailable" and the user can select PresentMon.exe in Settings.
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('resources/bin');
const exe = path.join(outDir, 'PresentMon.exe');
fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(exe)) { console.log('PresentMon already present:', exe); process.exit(0); }

try {
  const rel = await (await fetch('https://api.github.com/repos/GameTechDev/PresentMon/releases/latest', { headers: { 'User-Agent': 'twecd-build' } })).json();
  const asset = (rel.assets ?? []).find((a) => /^PresentMon-[\d.]+-x64\.exe$/i.test(a.name));
  if (!asset) throw new Error('No x64 console PresentMon asset in latest release ' + rel.tag_name);
  console.log('Downloading', asset.name, 'from', rel.tag_name);
  const buf = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer());
  if (buf.length < 100000) throw new Error('Download too small');
  fs.writeFileSync(exe, buf);
  const lic = await fetch('https://raw.githubusercontent.com/GameTechDev/PresentMon/main/LICENSE.txt');
  if (lic.ok) fs.writeFileSync(path.join(outDir, 'PresentMon-LICENSE.txt'), await lic.text());
  console.log('Saved', exe, `(${(buf.length / 1048576).toFixed(1)} MB)`);
} catch (e) {
  console.warn('WARNING: could not fetch PresentMon:', e.message);
  console.warn('The installer will be built without it. FPS capture will show "Unavailable" until PresentMon.exe is selected in Settings.');
}
