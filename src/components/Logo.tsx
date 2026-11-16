export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#39FF14" /><stop offset="1" stopColor="#B44CFF" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d="M32 3 L58 17 V47 L32 61 L6 47 V17 Z" fill="#0a0f0c" stroke="url(#lg)" strokeWidth="2.5" />
      <path d="M18 22 H46 L42 28 H35 V46 L29 50 V28 H22 Z" fill="url(#lg)" filter="url(#glow)" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-none">
        <div className="font-display text-xl font-extrabold tracking-[0.2em] text-white">TWECD</div>
        <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-purple">ULTRA WIDE EXTREME</div>
      </div>
    </div>
  );
}
