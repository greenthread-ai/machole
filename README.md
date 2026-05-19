# Machole

A persistent, always-on-top camera overlay **and** screen recorder for macOS —
built for clean product demos.

## Motivation

Machole exists to make screen recordings look good. It was built so that
[GreenThread](https://greenthread.ai) can record polished demos of its
**self-hosted AI models doing Real Work** — without juggling QuickTime, a
separate webcam app, and a video editor.

It gives you one tool: a presenter camera that frames your face automatically
and blurs the room behind you, plus a built-in recorder that captures the
screen, your microphone, and system audio into a single file.

## Features

- **Camera overlay** — a draggable, always-on-top circular camera bubble with an
  animated gradient ring, background blur, and auto-framing. No window chrome;
  right-click to configure.
- **Screen recording** — capture a full screen, a single window, or a
  drag-selected area, with a 3-2-1 countdown before capture begins.
- **Combined capture** — screen video, microphone, and system audio are mixed
  into one file, saved as `.mp4` (or `.webm` where mp4 isn't supported).
- **Automatic compression** — when [ffmpeg](https://ffmpeg.org) is installed,
  finished recordings are re-encoded to a much smaller H.264 mp4, with a
  progress overlay. Without ffmpeg the recording is saved unchanged.
- **Controls overlay** — an always-on-screen panel for record / stop / pause /
  mute / camera, with global keyboard shortcuts. It's excluded from the
  recording itself.

## Getting Started

You need:

- **macOS 13 or newer** (system-audio capture requires Ventura+)
- **Node.js 20+** and **npm**

Optionally install [ffmpeg](https://ffmpeg.org) — `brew install ffmpeg` — and
Machole will automatically compress finished recordings to a smaller file.

Clone the repo and install dependencies:

```bash
git clone https://github.com/greenthread-ai/machole.git
cd machole
npm install
```

`npm install` only fetches dev tooling — it has no build side effects. To
produce a runnable app:

```bash
npm run build   # package the app into a .app bundle in out/
npm run make    # build distributable installers (.dmg / .zip)
```

See [`docs/RELEASING.md`](docs/RELEASING.md) for signed, notarized release builds.

## Running Machole

Run straight from source with live reload:

```bash
npm run dev
```

Or build the app and install a `machole` launcher into `~/.local/bin` (add that
directory to your `PATH` if it isn't already):

```bash
npm run install-binary
machole
```

On first launch Machole checks for **camera**, **microphone**, and
**screen-recording** permissions and walks you through granting any that are
missing. Once running:

- **Right-click** the camera bubble for its menu: background blur, auto-frame,
  close-up, audio pulse, theme, size, and camera selection.
- **Drag** either overlay to reposition it.
- Use the **controls panel** — or its global shortcuts — to record, pause,
  stop, mute, and toggle the camera.

## License

Licensed under the [PolyForm Strict License 1.0.0](https://polyformproject.org/licenses/strict/1.0.0/).
See [`LICENSE`](LICENSE).

You are free to clone, build, and run Machole for your own use. You may **not**
distribute Machole or its binaries — or any modified version — without prior
written permission. To request distribution rights, contact
[accounts@greenthread.ai](mailto:accounts@greenthread.ai).
