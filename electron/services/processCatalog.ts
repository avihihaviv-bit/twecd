import type { ProcessInfo } from '../../shared/types';

export const FORTNITE_EXE = 'FortniteClient-Win64-Shipping.exe';

const GAME = [FORTNITE_EXE.toLowerCase(), 'fortnitelauncher.exe', 'epicgameslauncher.exe'];
// Never touched: anti-cheat.
const ANTI_CHEAT = ['easyanticheat.exe', 'easyanticheat_eos.exe', 'beservice.exe', 'beservice_x64.exe', 'fortniteclient-win64-shipping_eac.exe', 'fortniteclient-win64-shipping_be.exe', 'fortniteclient-win64-shipping_eac_eos.exe'];
// Never touched: Windows, security, drivers, audio, input.
const SYSTEM = [
  'system', 'idle', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'svchost.exe',
  'dwm.exe', 'explorer.exe', 'fontdrvhost.exe', 'sihost.exe', 'ctfmon.exe', 'taskhostw.exe', 'runtimebroker.exe', 'searchhost.exe',
  'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'textinputhost.exe', 'audiodg.exe', 'conhost.exe', 'spoolsv.exe',
  'msmpeng.exe', 'nissrv.exe', 'securityhealthservice.exe', 'securityhealthsystray.exe', 'mpdefendercoreservice.exe', 'smartscreen.exe',
  'wudfhost.exe', 'dllhost.exe', 'lsaiso.exe', 'memory compression', 'secure system', 'nvcontainer.exe', 'nvdisplay.container.exe',
  'igfxem.exe', 'rtkauduservice64.exe', 'wmiprvse.exe', 'searchindexer.exe', 'msedgewebview2.exe', 'applicationframehost.exe',
  'systemsettings.exe', 'lockapp.exe', 'useroobebroker.exe', 'twecd gaming booster - extreme edition.exe', 'electron.exe',
];
// Common user apps that are safe to close before playing (user still confirms each one).
const CLOSABLE: Record<string, string> = {
  'chrome.exe': 'Google Chrome', 'msedge.exe': 'Microsoft Edge', 'firefox.exe': 'Firefox', 'opera.exe': 'Opera', 'brave.exe': 'Brave',
  'spotify.exe': 'Spotify', 'teams.exe': 'Microsoft Teams', 'ms-teams.exe': 'Microsoft Teams', 'onedrive.exe': 'OneDrive',
  'steam.exe': 'Steam', 'steamwebhelper.exe': 'Steam (web helper)', 'epicwebhelper.exe': 'Epic web helper', 'battle.net.exe': 'Battle.net',
  'origin.exe': 'Origin', 'eadesktop.exe': 'EA App', 'ubisoftconnect.exe': 'Ubisoft Connect', 'skype.exe': 'Skype',
  'adobe desktop service.exe': 'Adobe Creative Cloud', 'creative cloud.exe': 'Adobe Creative Cloud', 'dropbox.exe': 'Dropbox',
  'googledrivefs.exe': 'Google Drive', 'whatsapp.exe': 'WhatsApp', 'telegram.exe': 'Telegram', 'slack.exe': 'Slack', 'zoom.exe': 'Zoom',
  'code.exe': 'Visual Studio Code', 'winword.exe': 'Word', 'excel.exe': 'Excel', 'powerpnt.exe': 'PowerPoint', 'obs64.exe': 'OBS Studio',
  'icue.exe': 'Corsair iCUE', 'razer synapse 3.exe': 'Razer Synapse', 'lghub.exe': 'Logitech G HUB', 'wallpaper64.exe': 'Wallpaper Engine',
};

export function categorize(name: string): ProcessInfo['category'] {
  const n = name.toLowerCase();
  if (GAME.includes(n)) return 'game';
  if (ANTI_CHEAT.includes(n) || n.includes('anticheat') || n.includes('battleye')) return 'anti-cheat';
  if (SYSTEM.includes(n)) return 'system';
  if (n in CLOSABLE) return 'closable';
  return 'other';
}

export const friendlyName = (name: string) => CLOSABLE[name.toLowerCase()] ?? name;
export const isClosable = (name: string) => categorize(name) === 'closable';
