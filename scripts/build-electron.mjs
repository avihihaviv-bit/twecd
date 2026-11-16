import { build } from 'esbuild';
const prod = process.argv.includes('--prod');
const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'],
  sourcemap: !prod, minify: prod, logLevel: 'info',
  define: { 'process.env.TWECD_DEV': JSON.stringify(prod ? '' : '1') },
};
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.js' });
