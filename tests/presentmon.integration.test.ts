import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PresentMonCapture } from '../electron/services/presentMon';

// Exercises the real spawn -> stream -> parse -> stats path with a stand-in executable
// that prints PresentMon 2.x CSV (Linux/macOS only; Windows CI uses the real tool).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
const exe = path.join(dir, 'fake-presentmon');
fs.writeFileSync(exe, `#!/bin/sh
echo "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy,GPUWait"
i=0
while [ $i -lt 600 ]; do
  ft=2.50; if [ $((i % 100)) -eq 50 ]; then ft=20.00; fi
  echo "Game.exe,1,0x1,DXGI,0,0,1,Flip,Application,$i,$ft,1.20,1.0,0.1,2.0,2.10,0.2"
  i=$((i+1))
done
sleep 5
`, { mode: 0o755 });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('PresentMon capture pipeline', () => {
  it('streams frames into real statistics', async () => {
    const pm = new PresentMonCapture(() => exe);
    pm.startRecording();
    pm.start('Game.exe');
    await new Promise((r) => setTimeout(r, 1500));
    const m = pm.metrics()!;
    const rec = pm.stopRecording();
    pm.stop();
    expect(pm.running).toBe(false);
    expect(rec.length).toBe(600);
    expect(m.sampleCount).toBe(600);
    expect(m.avg).toBeGreaterThan(300);
    expect(m.avg).toBeLessThan(400);
    expect(m.stutters).toBe(6);
    expect(m.gpuBusyMs).toBeCloseTo(2.1);
    expect(m.cpuBusyMs).toBeCloseTo(1.2);
    expect(m.stabilityScore).toBeLessThan(100);
  });
  it('reports missing PresentMon instead of fabricating data', () => {
    const pm = new PresentMonCapture(() => null);
    pm.start('Game.exe');
    expect(pm.status).toMatch(/not installed/);
    expect(pm.metrics()).toBeNull();
  });
});
