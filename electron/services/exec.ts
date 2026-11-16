import { spawn } from 'node:child_process';

export interface RunResult { code: number | null; stdout: string; stderr: string; error?: string }

/** Runs a program WITHOUT a shell (arguments are never interpreted), hidden window, with timeout. */
export function run(cmd: string, args: string[], timeoutMs = 15000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, shell: false });
    } catch (e) {
      resolve({ code: null, stdout, stderr, error: String(e) });
      return;
    }
    const timer = setTimeout(() => { if (!done) { done = true; child.kill(); resolve({ code: null, stdout, stderr, error: 'timeout' }); } }, timeoutMs);
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ code: null, stdout, stderr, error: e.message }); } });
    child.on('close', (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr }); } });
  });
}

export const isWin = process.platform === 'win32';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
