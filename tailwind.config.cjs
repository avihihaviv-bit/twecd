/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#06040a',
        panel: '#0f0b17',
        panel2: '#150f21',
        line: '#2a1f40',
        neon: '#39FF14',
        neon2: '#18C77A',
        purple: '#B44CFF',
        purple2: '#7C3AED',
        lilac: '#E4C8FF',
        muted: '#9d90b8',
        warn: '#ffb020',
        bad: '#ff4d5e',
      },
      fontFamily: {
        display: ['Orbitron', 'Rajdhani', 'Segoe UI', 'sans-serif'],
        sans: ['Rajdhani', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 24px rgba(57,255,20,0.35)',
        neonLg: '0 0 60px rgba(57,255,20,0.45), inset 0 0 40px rgba(57,255,20,0.15)',
        purple: '0 0 24px rgba(180,76,255,0.45)',
        purpleLg: '0 0 70px rgba(180,76,255,0.5), inset 0 0 44px rgba(180,76,255,0.18)',
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(0.95)', opacity: '0.7' }, '100%': { transform: 'scale(1.35)', opacity: '0' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        pulseRing: 'pulseRing 2.2s cubic-bezier(0.2,0.6,0.4,1) infinite',
        fadeUp: 'fadeUp 0.35s ease-out both',
        spinSlow: 'spinSlow 8s linear infinite',
      },
    },
  },
  plugins: [],
};
