import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content-Security-Policy for the packaged app (dev server needs inline HMR scripts, so build only).
const csp = {
  name: 'twecd-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" />`),
};

export default defineConfig({
  plugins: [react(), csp],
  base: './',
  server: { port: 5183, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
