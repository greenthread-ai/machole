# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Machole is a macOS Electron app that creates a persistent, always-on-top circular camera overlay for screen recordings. It displays the user's camera feed in a small draggable window with an animated gradient outline and no native window chrome. The camera overlay is configured via a right-click context menu.

Machole also records the screen itself: pick a screen, window, or custom area; a 3-2-1 countdown plays; and screen video, microphone, and system audio are captured together and saved to an `.mp4` (falling back to `.webm` when the OS can't encode mp4). An always-on-screen controls overlay exposes record/stop/pause/mute/camera actions and their global keyboard shortcuts; it is content-protected so it never appears in the recording.

## Commands

- `npm start` — Run the app in development mode (electron-forge + Vite)
- `npm run lint` — Lint TypeScript files with ESLint
- `npm run package` — Package the app for distribution
- `npm run make` — Build distributable installers

## Architecture

This is an **Electron Forge + Vite + TypeScript** project.

**Main process:**
- `src/main.ts` — Creates the camera overlay window, its context menu, and app lifecycle. Uses `electron-squirrel-startup` for Windows install/uninstall shortcuts.
- `src/recording-main.ts` — Recording orchestration: owns the recording windows, the `desktopCapturer` source list, the `setDisplayMediaRequestHandler` (which grants `audio: 'loopback'` for system audio), global shortcuts, and streaming recorded chunks to a temp file then saving via a dialog.

**Preload scripts:**
- `src/preload.ts` — Bridge for the camera overlay renderer.
- `src/overlay-preload.ts` — Generic `window.bridge` IPC bridge shared by every recording window.

**Renderer** — a multi-page app (one Vite renderer, several HTML entries):
- `index.html` + `src/renderer.ts` — the camera overlay (face).
- `controls.html` + `src/controls.ts` — always-on-screen controls overlay; **hosts the `MediaRecorder`** that captures/mixes screen + mic + system audio.
- `picker.html` + `src/picker.ts` — screen/window/area source picker.
- `countdown.html` + `src/countdown.ts` — full-screen 3-2-1 countdown.
- `area.html` + `src/area.ts` — drag-to-select capture rectangle.

`src/recording-types.ts` holds the shared main↔renderer IPC contract.

Vite configs: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts` (the renderer config declares the multi-page `rollupOptions.input`). The Forge config (`forge.config.ts`) wires these via `VitePlugin` and configures Electron Fuses for security hardening at package time.

## Recording flow

`controls` Record → `picker` → user picks source/area (area uses the `area` window) → `recording-main` stashes the source and runs the `countdown` window → on `countdown:done`, main tells `controls` to begin → `controls` calls `getDisplayMedia`, mixes mic + system audio via an `AudioContext`, and streams `MediaRecorder` chunks to main → on stop, main shows a Save dialog.

Window content protection: the controls, picker, countdown, and area windows are `setContentProtection(true)` so they stay out of the recording. The camera overlay is **not** protected — the face is meant to be recorded.

## Key Design Constraints

- **macOS-only target** — System-audio loopback capture needs macOS 13+
- **No window chrome** — Frameless, draggable overlay windows
- **Permissions** — App prompts for camera, microphone, and screen-recording access
- **Context menu interaction** — Right-click menu configures the camera overlay
- **mp4 output** — Prefer native `MediaRecorder` mp4; fall back to `.webm` when unsupported
