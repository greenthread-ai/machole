# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Machole is a macOS Electron app that creates a persistent, always-on-top circular camera overlay for screen recordings. It displays the user's camera feed in a small draggable window with an animated gradient outline and no native window chrome. All user interaction is via right-click context menu.

## Commands

- `npm start` — Run the app in development mode (electron-forge + Vite)
- `npm run lint` — Lint TypeScript files with ESLint
- `npm run package` — Package the app for distribution
- `npm run make` — Build distributable installers

## Architecture

This is an **Electron Forge + Vite + TypeScript** project with three process entry points:

- **Main process** (`src/main.ts`) — Creates the BrowserWindow, handles app lifecycle. Uses `electron-squirrel-startup` for Windows install/uninstall shortcuts. Loads renderer via Vite dev server in dev or from built files in production.
- **Preload script** (`src/preload.ts`) — Bridge between main and renderer processes. Currently empty stub.
- **Renderer process** (`src/renderer.ts` + `index.html` + `src/index.css`) — The UI layer loaded into the BrowserWindow.

Each process has its own Vite config: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`. The Forge config (`forge.config.ts`) wires these together via `VitePlugin` and configures Electron Fuses for security hardening at package time.

## Key Design Constraints

- **macOS-only target** — Must work correctly with macOS screen recorder
- **No window chrome** — Frameless, draggable overlay window
- **Camera permissions** — App prompts for camera access on first launch
- **Context menu interaction** — Right-click menu is the primary UI (not yet implemented)
