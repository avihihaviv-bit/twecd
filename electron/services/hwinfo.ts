import { isWin } from './exec';
import { regListValues } from './windows';

/**
 * HWiNFO integration without drivers or shared-memory hacks:
 * HWiNFO64 can publish chosen sensors to HKCU\Software\HWiNFO64\VSB
 * (Sensor settings > HWiNFO Gadget > "Enable reporting to Gadget", then tick "Report value in Gadget" per sensor).
 */
export const HWINFO_KEY = 'HKCU\\Software\\HWiNFO64\\VSB';

export interface HwSensor { sensor: string; label: string; value: string; raw: number | null }

export function parseVsb(values: { name: string; data: string }[]): HwSensor[] {
  const by = new Map(values.map((v) => [v.name.toLowerCase(), v.data]));
  const out: HwSensor[] = [];
  for (let i = 0; i < 500; i++) {
    const label = by.get(`label${i}`);
    if (label === undefined) { if (i > 0 && by.get(`label${i + 1}`) === undefined) break; continue; }
    const rawS = by.get(`valueraw${i}`);
    const raw = rawS !== undefined ? parseFloat(rawS.replace(',', '.')) : NaN;
    out.push({ sensor: by.get(`sensor${i}`) ?? '', label, value: by.get(`value${i}`) ?? '', raw: Number.isFinite(raw) ? raw : null });
  }
  return out;
}

/** Picks the well-known i5-14600K sensors when the user has published them. */
export function pickCpu(sensors: HwSensor[]) {
  const find = (re: RegExp) => sensors.find((s) => re.test(s.label))?.raw ?? null;
  return {
    packageTemp: find(/^cpu package$|package.*temp|^cpu package \[/i),
    packagePower: find(/cpu package power/i),
    pl1: find(/pl1 power limit/i),
    pl2: find(/pl2 power limit/i),
    effClock: find(/average effective clock|core effective clocks/i),
    thermalThrottle: find(/thermal throttling|thermal limit/i),
    powerThrottle: find(/power limit exceeded|power limit throttl/i),
  };
}

export async function readHwinfo(): Promise<HwSensor[] | null> {
  if (!isWin) return null;
  const vals = await regListValues(HWINFO_KEY);
  return vals.length ? parseVsb(vals) : null;
}
