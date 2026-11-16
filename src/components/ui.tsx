import type { ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { UNAVAILABLE } from '../lib/api';

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="title-glow font-display text-[28px] font-extrabold tracking-[0.08em]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || right) && <div className="mb-4 flex items-center justify-between gap-3">{title && <h2 className="card-title">{title}</h2>}{right}</div>}
      {children}
    </section>
  );
}

/** Metric tile. Pass value=null to show "Unavailable" (never a placeholder number). */
export function Stat({ label, value, unit, sub, tone = 'default', big = false }: { label: string; value: string | null; unit?: string; sub?: ReactNode; tone?: 'default' | 'neon' | 'warn' | 'bad'; big?: boolean }) {
  const un = value === null || value === UNAVAILABLE;
  const color = un ? 'text-[#56625b]' : tone === 'neon' ? 'text-neon' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-white';
  return (
    <div className="card card-hover p-4">
      <div className="label">{label}</div>
      <div className={`mt-2 flex items-baseline gap-1 ${color}`}>
        <span className={`num font-bold ${un ? 'text-base tracking-wide' : big ? 'text-4xl' : 'text-[28px]'}`}>{un ? UNAVAILABLE : value}</span>
        {!un && unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, tone }: { value: number | null; max?: number; tone?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const c = tone ?? (pct >= 90 ? 'bg-bad' : pct >= 75 ? 'bg-warn' : 'bg-neon');
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${c} transition-all duration-500`} style={{ width: `${pct}%` }} /></div>;
}

export function Ring({ value, label, sub, size = 132 }: { value: number | null; label: string; sub?: string; size?: number }) {
  const r = size / 2 - 10; const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const col = value === null ? '#2a352f' : pct >= 90 ? '#ff4d5e' : pct >= 75 ? '#ffb020' : '#39FF14';
  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#18211c" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s ease, stroke .3s', filter: value === null ? undefined : `drop-shadow(0 0 6px ${col}88)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ height: size }}>
        <span className={`num font-bold ${value === null ? 'text-xs text-[#56625b]' : 'text-2xl text-white'}`}>{value === null ? UNAVAILABLE : `${Math.round(value)}%`}</span>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
      </div>
      <div className="label mt-2">{label}</div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'good' | 'info' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  const m = { good: 'bg-neon/10 text-neon border-neon/30', info: 'bg-sky-400/10 text-sky-300 border-sky-400/25', warn: 'bg-warn/10 text-warn border-warn/30', bad: 'bg-bad/10 text-bad border-bad/30', muted: 'bg-white/5 text-muted border-line' }[tone];
  return <span className={`chip border ${m}`}>{children}</span>;
}

const tt = { contentStyle: { background: '#0d1210', border: '1px solid #1c2621', borderRadius: 10, fontFamily: 'Rajdhani', fontSize: 13 }, labelStyle: { display: 'none' } };

export interface SeriesDef { key: string; name: string; color: string }
export function LiveChart({ data, series, height = 180, max, unit = '%', area = true }: { data: Record<string, number | null>[]; series: SeriesDef[]; height?: number; max?: number | 'auto'; unit?: string; area?: boolean }) {
  const hasAny = data.some((d) => series.some((s) => d[s.key] !== null && d[s.key] !== undefined));
  if (!hasAny) return <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-[#56625b]" style={{ height }}>{UNAVAILABLE}</div>;
  const domain: [number, number | 'auto'] = [0, max === undefined ? 100 : max];
  return (
    <ResponsiveContainer width="100%" height={height}>
      {area ? (
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <defs>{series.map((s) => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.35} /><stop offset="1" stopColor={s.color} stopOpacity={0} /></linearGradient>)}</defs>
          <CartesianGrid stroke="#16201b" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis domain={domain} tick={{ fill: '#5d6a63', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...tt} formatter={(v: number, n: string) => [`${v?.toFixed?.(1)}${unit}`, n]} />
          {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} isAnimationActive={false} connectNulls={false} />)}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#16201b" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis domain={domain} tick={{ fill: '#5d6a63', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...tt} formatter={(v: number, n: string) => [`${v?.toFixed?.(2)}${unit}`, n]} />
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.6} dot={false} isAnimationActive={false} />)}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export function FrameTimeChart({ frames, height = 200 }: { frames: number[]; height?: number }) {
  if (frames.length === 0) return <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-[#56625b]" style={{ height }}>{UNAVAILABLE} - frame times appear while Fortnite runs with PresentMon capture</div>;
  const sorted = [...frames].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const data = frames.map((v, i) => ({ i, ft: v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#16201b" vertical={false} />
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: '#5d6a63', fontSize: 11 }} axisLine={false} tickLine={false} width={44} unit="ms" />
        <ReferenceLine y={med * 2.5} stroke="#ff4d5e" strokeDasharray="4 4" label={{ value: 'stutter', fill: '#ff4d5e', fontSize: 10, position: 'insideTopRight' }} />
        <Tooltip {...tt} formatter={(v: number) => [`${v.toFixed(2)} ms (${(1000 / v).toFixed(0)} FPS)`, 'Frame time']} />
        <Line type="linear" dataKey="ft" stroke="#39FF14" strokeWidth={1.3} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</div>;
}
