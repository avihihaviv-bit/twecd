# TWECD GAMING BOOSTER – ULTRA WIDE EXTREME EDITION

Windows 11 desktop app for Fortnite players. Built and tuned for **RTX 5060 8GB · Intel i5-14600K · 16GB RAM**.

Real monitoring, safe and reversible optimizations, honest results. Nothing is simulated: any metric that can't be measured shows **Unavailable**.

## Get the installer (TWECD-Setup.exe)

On your Windows PC:

1. Install **Node.js LTS** from nodejs.org (one time only).
2. Double-click **`BUILD-INSTALLER.bat`** in this folder.
3. When it finishes, the `release` folder opens. Double-click **`TWECD-Setup.exe`**.

The installer creates a **desktop shortcut** and a Start-menu entry. After that, open TWECD with a double-click. No command line is needed.

You can also build it on GitHub: push this folder to a repository and run the *Build TWECD-Setup.exe* workflow (Actions tab). It uploads `TWECD-Setup.exe` as an artifact.

## Easy mode

1. Open TWECD and click **BOOST MY PC**. It runs 10 checks: CPU, GPU, VRAM, RAM, processes, Fortnite config, Game Mode, power, network, bottlenecks.
2. Review the recommendations. Each one says what it changes and why.
3. Click **APPLY** and confirm. You see which items succeeded, which were skipped, and which are unavailable.
4. Click **START FORTNITE**.

## Auto Mode, Region Finder (v1.5)

- **Auto Mode**: one switch. At startup and after every match, TWECD re-applies the safe Windows settings and your chosen Fortnite profile. It also sets the Stable FPS Lock from real data: your target (default 500) only if your PC held it 90% of the last match, otherwise the highest FPS it actually held. It never closes apps or deletes files, and every change is logged and undoable.
- **Fortnite Region Finder**: measures the connection to the datacenter area of every Fortnite matchmaking region and recommends the lowest-latency one. A physics check (light in fiber covers about 200 km/ms) rejects impossible results caused by a VPN, proxy or antivirus HTTPS scanning, so it never recommends a region from fake numbers.
- **Ping killers**: detects torrent clients, cloud sync, game launchers downloading in the background, and Wi-Fi.
- **Design**: a deeper purple-black palette, with responsive cards from 1350 px up to ultra-wide.

## MAX FPS: Optimize Everything (v1.4)

One button scans Windows, Fortnite and the NVIDIA setup and shows what will change. Nothing is applied until you approve it. After applying, TWECD **reads every value back to verify it saved** and shows a before/after table. Each change has its own Undo button, Settings has per-item restore plus Restore All, and a System Restore point is attempted first when TWECD runs as administrator. The scan also lists what it deliberately does **not** change, and why.

## What TWECD can change (each change is confirmed first and restorable)

| Optimization | Reversible |
|---|---|
| Turn on Windows Game Mode (HKCU) | Yes – Restore Defaults |
| Turn off Xbox background recording "Record what happened" (HKCU) | Yes – Restore Defaults |
| Switch to High/Ultimate Performance power plan (if it exists) | Yes – Restore Defaults |
| Close background apps **you tick** (browsers, Spotify, launchers…) | Re-open them |
| Delete user TEMP files untouched for 24h+ (in-use files skipped) | No (temporary files) |
| **Apply Max FPS settings to Fortnite**: Performance mode, unlimited FPS, VSync/shadows/effects off (edits only `GameUserSettings.ini`, Fortnite must be closed) | Yes – original file backed up |
| Create/use the Ultimate Performance power plan when no High Performance plan exists | Yes – switched back and removed |
| Turn on Windows 11 optimizations for windowed games (HKCU) | Yes – Restore Defaults |
| Turn off Xbox Game Bar game capture (GameDVR_Enabled / AppCaptureEnabled, HKCU) | Yes – per item |
| Run Fortnite on the NVIDIA GPU (per-app GPU preference, HKCU) | Yes – per item |
| Hardware-accelerated GPU scheduling (HwSchMode, admin + restart) | Yes – per item |
| Disable ticked startup apps (Task Manager method, HKCU; security/driver/anti-cheat entries never listed) | Yes – per item |
| Windows visual effects: Best performance (optional, desktop only) | Yes – per item |

**Never touched:** Windows Defender, Firewall, Windows Update, system services, Windows processes, anti-cheat (EasyAntiCheat/BattlEye), the Fortnite game files and memory, GPU clocks/voltage/firmware, CPU cores/voltage, BIOS, router.

NVIDIA driver settings, Fortnite graphics settings, BIOS (XMP, microcode) and HAGS appear as **manual tips**. TWECD explains them but doesn't change them.

## Features

**Ultra-wide interface** – 1600x950 by default (minimum 1350x800, maximizes on smaller screens). The sidebar has Dashboard, FPS Optimizer, Ping Optimizer, Fortnite Mode, System Optimizer, RAM Optimizer and Settings. The dashboard shows six live cards (FPS, CPU, GPU, RAM, ping and packet loss) and four wide graphs.

- **Scene-load analysis** – each measured second of a match is classified as Low load (sky, empty scenes; this is where 900+ FPS peaks happen), Normal gameplay or Intense combat. Each class gets its own average, worst second and best second, so a peak in an empty scene never stands in for real gameplay FPS.
- **Bottleneck report with evidence** – each second is classified as CPU-, GPU- or engine-limited using PresentMon CPU/GPU busy times. The report also checks VRAM, RAM and paging, thermal throttling, power limits, DX12 shader compilation, background apps and network. Each finding lists its evidence, the fix, the expected effect, the risk and how to roll it back.
- **Fortnite profiles** – Competitive Performance, High FPS, Frame Time Stability (uses your measured Stable FPS Lock) and DirectX 12. You switch with one click, and the original settings file is backed up. Benchmarks record which profile was active, and you can compare any two runs.
- **Monitor check** – shows your current and highest supported refresh rate (for example, a 520 Hz monitor left at 240 Hz) and gives frame-rate advice that matches your sustained FPS.
- **Intel CPU health** – reads the microcode revision (0x12B+ check for 13th/14th gen), BIOS version and date, motherboard, clocks and throttling.
- **RAM Optimizer** – dual vs single channel based on slot names, running vs rated speed, paging and hard faults, commit charge, page file use, memory-heavy apps and Fortnite's working set.
- **Updates with consent** – the app checks for updates when it starts (you can turn this off). Downloading and installing each need your click.

- **FPS Stability Engine** – current, average, 1% low and 0.1% low FPS, a frame-time graph, spike and stutter detection, a CPU vs GPU bottleneck verdict from per-frame busy times, and VRAM/RAM pressure. The **Stability Score** (0–100) is 50% (1% low ÷ average) + 30% frame-time consistency + 20% stutter rate. 750 FPS is shown as an aspirational target, not a promise.
- **RTX 5060** – usage, VRAM, temperature, clock, power and limit, driver version, and active clock limits (power or thermal). Data comes from `nvidia-smi`, which ships with the NVIDIA driver.
- **i5-14600K** – total and per-thread load with the P-core/E-core map (6P+8E, 20 threads), effective clock, temperature when Windows exposes it, and throttling hints.
- **16GB RAM** – total, available and used, Fortnite's working set, top memory users, and single-channel / XMP hints.
- **Fortnite Extreme Mode** – detects Fortnite automatically, captures FPS while you play, logs performance drops with a likely cause, and compares your `GameUserSettings.ini` with recommended settings and applies the Max FPS profile in one click (backed up, restorable).
- **Ping & Network** – average, min and max ping, jitter, packet loss, a per-probe graph, Ethernet vs Wi-Fi with signal strength, and editable destinations. It tests your router automatically to tell Wi-Fi, local-network, ISP and destination problems apart.
- **Stable FPS Lock** – measures the FPS your PC holds 90% of the time during real matches, recommends a lock just below it, and writes it to Fortnite's settings in one click (backed up). Flat frame times feel smoother than a higher, unstable number.
- **Auto-Boost** – optional: closes the background apps you tick (browsers, launchers, Spotify…) automatically when Fortnite starts. Never touches Windows, drivers or anti-cheat.
- **Before/After Benchmark** – records FPS, 1% low, frame-time std dev, CPU, GPU, RAM, VRAM, ping and loss over 30/60/120 s, then shows the raw difference.

## FPS capture (PresentMon)

FPS and frame times come from Intel **PresentMon** (MIT license). It reads Windows presentation events through ETW. It doesn't inject into the game or touch anti-cheat. `BUILD-INSTALLER.bat` downloads it and bundles it into the installer. ETW capture needs **administrator rights**: use *Settings → Restart as administrator* when you want FPS data.

## Lightweight by design

- One long-lived `nvidia-smi` stream instead of a new process per sample. CPU load comes from OS counters, with no extra process.
- When the window is minimized, GPU and clock streams stop. Only a check for Fortnite runs every 10 s, plus optional light 2 s session recording while Fortnite runs.
- The update interval can be set to 0.5 s, 1 s or 2 s in Settings.

## Security

Context isolation, sandboxed renderer, `nodeIntegration: false`, strict CSP, and a narrow preload bridge. Every IPC input is checked with zod, including host names, optimization IDs and allowed links. Senders are verified, navigation and pop-ups are blocked, and commands are spawned without a shell.

## Development

```bash
npm install
npm test          # unit + integration tests
npm run build     # typecheck + renderer + main
npm run dev       # live dev mode
npm run dist      # Windows: build release/TWECD-Setup.exe
```
