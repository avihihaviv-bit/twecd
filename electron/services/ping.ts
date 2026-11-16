import type { NetContext, NetDiagnosis, NetTargetResult } from '../../shared/types';

/**
 * Parses one line of `ping` output (Windows or Unix, most locales).
 * Returns latency in ms for a reply line, or undefined if the line is not a reply.
 * Windows: "Reply from 1.1.1.1: bytes=32 time=12ms TTL=57" / "time<1ms"
 * Unix:    "64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.3 ms"
 */
export function parsePingLine(line: string): number | undefined {
  if (!/ttl[=:]/i.test(line)) return undefined;
  const lt = line.match(/[<]\s*1\s*ms/i);
  if (lt) return 0.5;
  const m = line.match(/[=:]\s*(\d+(?:[.,]\d+)?)\s*ms/i);
  if (!m) return undefined;
  return parseFloat(m[1].replace(',', '.'));
}

export function summarize(label: string, host: string, samples: (number | null)[], error: string | null = null): NetTargetResult {
  const got = samples.filter((s): s is number => s !== null);
  const sent = samples.length;
  let jitter: number | null = null;
  if (got.length >= 2) {
    let d = 0;
    for (let i = 1; i < got.length; i++) d += Math.abs(got[i] - got[i - 1]);
    jitter = d / (got.length - 1);
  }
  return {
    label, host, sent, received: got.length,
    lossPct: sent ? ((sent - got.length) / sent) * 100 : 0,
    min: got.length ? Math.min(...got) : null,
    avg: got.length ? got.reduce((a, b) => a + b, 0) / got.length : null,
    max: got.length ? Math.max(...got) : null,
    jitter, samples, error,
  };
}

/** Valid hostname or IPv4 literal. Rejects anything that could be parsed as a CLI flag. */
export function isValidHost(h: string): boolean {
  if (h.length < 1 || h.length > 253 || h.startsWith('-')) return false;
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const name = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return ipv4.test(h) || name.test(h);
}

const bad = (r: NetTargetResult) => r.received === 0 ? true : (r.lossPct >= 2 || (r.jitter ?? 0) >= 15 || (r.avg ?? 0) >= 80);

/**
 * Localizes where latency/instability comes from, by comparing the default gateway (your router)
 * against external destinations. Measured values only; inconclusive when data is missing.
 */
export function diagnose(ctx: NetContext, gw: NetTargetResult | null, results: NetTargetResult[]): NetDiagnosis {
  const reachable = results.filter((r) => r.received > 0);
  if (!gw && reachable.length === 0) {
    return { source: 'inconclusive', title: 'No measurements', explanation: 'No destination answered. Check that you are connected to the internet, or that ICMP ping is not blocked by a firewall.' };
  }
  const gwBad = gw ? gw.received > 0 && (gw.lossPct >= 1 || (gw.jitter ?? 0) >= 5 || (gw.avg ?? 0) >= 10) : null;
  if (gw && gw.received === 0) {
    return { source: 'inconclusive', title: 'Router does not answer ping', explanation: 'Your router (default gateway) did not reply to ping, which many routers do by design. Local-network quality could not be separated from ISP routing.' };
  }
  if (gwBad) {
    if (ctx.connectionType === 'wireless') {
      return { source: 'wifi', title: 'Latency starts on your Wi-Fi', explanation: `The hop to your own router already shows ${fmt(gw!)}. That is your Wi-Fi link, before your ISP. Moving closer to the router, using 5 GHz/6 GHz, or using an Ethernet cable usually helps the most.` };
    }
    return { source: 'local-network', title: 'Latency starts in your local network', explanation: `The hop to your router already shows ${fmt(gw!)}. Check the cable, the router load (downloads/streams on other devices), or restart the router.` };
  }
  const badExt = results.filter(bad);
  if (results.length > 0 && badExt.length === results.length) {
    return { source: 'isp', title: 'Likely ISP or upstream routing', explanation: 'Your local network is clean, but every external destination shows high latency, jitter or loss. This points to your ISP connection or its routing. Run the test again at a different time; if it persists, contact your ISP with these numbers.' };
  }
  if (badExt.length > 0) {
    return { source: 'destination', title: 'Specific destinations are slow', explanation: `Your local network and most destinations are fine; only ${badExt.map((b) => b.label).join(', ')} look worse. That is the destination server or the route to it, not your PC.` };
  }
  return { source: 'healthy', title: 'Connection looks healthy', explanation: 'Low latency, low jitter and no meaningful packet loss on the measured destinations.' };
}

const fmt = (r: NetTargetResult) => `avg ${r.avg?.toFixed(1)} ms, jitter ${r.jitter?.toFixed(1) ?? '-'} ms, loss ${r.lossPct.toFixed(0)}%`;
