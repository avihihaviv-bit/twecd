import { spawn } from 'node:child_process';
import electron from 'electron';
const wait = async () => { for (let i = 0; i < 60; i++) { try { await fetch('http://localhost:5183'); return; } catch { await new Promise(r => setTimeout(r, 500)); } } };
await wait();
const p = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5183' } });
p.on('exit', (c) => process.exit(c ?? 0));
