# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Machole is a macOS Electron app that creates a persistent, always-on-top circular camera overlay for screen recordings. It displays the user's camera feed in a small draggable window with an animated gradient outline and no native window chrome. The camera overlay is configured via a right-click context menu.

Machole also records the screen itself: pick a screen, window, or custom area; a 3-2-1 countdown plays; and screen video, microphone, and system audio are captured together and saved to an `.mp4` (falling back to `.webm` when the OS can't encode mp4). An always-on-screen controls overlay exposes record/stop/pause/mute/camera actions and their global keyboard shortcuts; it is content-protected so it never appears in the recording.

## Commands

- `npm install` — Install dependencies (dev tooling only; no build side effects)
- `npm run dev` — Build and run the app in development mode (electron-forge + Vite)
- `npm run build` — Package the app into a runnable `.app` bundle in `out/`
- `npm run make` — Build distributable installers (`.dmg` / `.zip`)
- `npm run install-binary` — Build the app and install a `machole` launcher into `~/.local/bin`
- `npm run lint` — Lint TypeScript files with ESLint
- `npm run icon` — Regenerate `build/icon.icns` from the logo artwork (`scripts/generate-icon.mjs`)

## Architecture

This is an **Electron Forge + Vite + TypeScript** project.

**Main process:**
- `src/main.ts` — Creates the camera overlay window, its context menu, and app lifecycle. Uses `electron-squirrel-startup` for Windows install/uninstall shortcuts.
- `src/permissions-main.ts` — Startup permissions gate (`ensurePermissions`): checks camera/microphone/screen access via `systemPreferences`, shows onboarding when something is missing, and only loads the rest of the app once all three are granted.
- `src/recording-main.ts` — Recording orchestration: owns the recording windows, the `desktopCapturer` source list, the `setDisplayMediaRequestHandler` (which grants `audio: 'loopback'` for system audio), global shortcuts, the recording-border window, and streaming recorded chunks to a temp file then saving via a dialog.
- `src/window-utils.ts` — `loadRendererPage` helper for loading a multi-page renderer entry.

**Preload scripts:**
- `src/preload.ts` — Bridge for the camera overlay renderer.
- `src/overlay-preload.ts` — Generic `window.bridge` IPC bridge shared by every recording window.

**Renderer** — a multi-page app (one Vite renderer, several HTML entries):
- `index.html` + `src/renderer.ts` — the camera overlay (face).
- `permissions.html` + `src/permissions.ts` — first-launch permissions onboarding.
- `controls.html` + `src/controls.ts` — always-on-screen controls overlay; **hosts the `MediaRecorder`** that captures/mixes screen + mic + system audio. The microphone device and system-audio on/off are chosen here before recording.
- `picker.html` + `src/picker.ts` — screen/window/area source picker.
- `countdown.html` + `src/countdown.ts` — full-screen 3-2-1 countdown.
- `area.html` + `src/area.ts` — drag-to-select capture rectangle.
- `frame.html` + `src/frame.ts` — animated border drawn around the recorded region while recording.
- `compressing.html` + `src/compressing.ts` — progress overlay shown while ffmpeg re-encodes the finished recording.

`src/recording-types.ts` holds the shared main↔renderer IPC contract. `src/ffmpeg.ts` (main process) locates an optional system `ffmpeg` and runs the post-recording compression.

Vite configs: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts` (the renderer config declares the multi-page `rollupOptions.input`). The Forge config (`forge.config.ts`) wires these via `VitePlugin` and configures Electron Fuses for security hardening at package time.

## Distribution

Two macOS build paths, both env-gated in `forge.config.ts` (local builds stay unsigned):
- **Developer ID** — notarized `.dmg`, triggered by `APPLE_SIGNING_IDENTITY`; built by `.github/workflows/release.yml`. See `docs/RELEASING.md`.
- **Mac App Store** — sandboxed `.pkg` built with `--platform=mas`, triggered by `APPLE_MAS_IDENTITY`; built by `.github/workflows/appstore.yml`. MAS entitlements are `build/entitlements.mas*.plist`. See `docs/APP_STORE.md`.

## Recording flow

`controls` Record → `picker` → user picks source/area (area uses the `area` window) → `recording-main` stashes the source and runs the `countdown` window → on `countdown:done`, main tells `controls` to begin → `controls` calls `getDisplayMedia` (capture is capped at 30 fps / 4K so the software H.264 encoder doesn't choke), mixes mic + system audio via an `AudioContext`, and streams `MediaRecorder` chunks to main → on stop, main shows a Save dialog.

If a system `ffmpeg` is found (`findFfmpeg` in `src/ffmpeg.ts` probes the usual install dirs — a GUI app doesn't inherit the shell `PATH`), the recording is re-encoded to a smaller H.264 mp4 with the `compressing` overlay showing progress. If ffmpeg is missing or the re-encode fails, the raw recording is saved unchanged — a recording is never lost.

Window content protection: the controls, picker, countdown, and area windows are `setContentProtection(true)` so they stay out of the recording. The camera overlay is **not** protected — the face is meant to be recorded.

## Key Design Constraints

- **macOS-only target** — System-audio loopback capture needs macOS 13+
- **No window chrome** — Frameless, draggable overlay windows
- **Permissions** — App prompts for camera, microphone, and screen-recording access
- **Context menu interaction** — Right-click menu configures the camera overlay
- **mp4 output** — Prefer native `MediaRecorder` mp4; fall back to `.webm` when unsupported
