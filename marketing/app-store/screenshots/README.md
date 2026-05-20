# Screenshots

Apple wants macOS screenshots at **2880×1800** (16:10 retina). Each HTML file in this directory is laid out at **1440×900 CSS pixels** — captured on any retina Mac with `⌘⇧4 → Space → click the window` it lands at exactly 2880×1800.

## Capture

1. `open 01-hero.html` (or each in turn).
2. Press `⌘⇧4`, then `Space`, then click the browser window.
3. The PNG drops on your Desktop at retina resolution.
4. Upload to App Store Connect under **Version → macOS App Screenshots**.

If your browser window has chrome (title bar, address bar) that adds height, switch the browser into **Reader / Distraction-Free** or use Chrome's `View → Always Show Toolbar in Full Screen` off + full-screen the tab. Alternatively, capture programmatically with Playwright at a clean 1440×900 viewport — see below.

## Programmatic capture (optional)

If you have `npx` and would like a one-shot:

```bash
npx -y playwright install chromium
npx -y playwright codegen file://"$(pwd)/01-hero.html" --viewport-size 1440,900
```

…or write a tiny `playwright` script that loads each file at viewport `1440×900`, `deviceScaleFactor: 2`, and writes a `.png`. Manual `⌘⇧4` works fine for a one-time submission.

## The files

| File | Story |
|---|---|
| `01-hero.html` | Recording-in-progress hero: editor under a red recording border with the camera overlay composited inside. The "what is this app" shot. |
| `02-picker.html` | The source picker centered on screen — communicates **screen / window / area** choice. |
| `03-controls.html` | Controls panel + keyboard shortcuts callout — "always one tap away." |
| `04-themes.html` | All five gradient ring themes side by side. |

## The face

`face.jpg` is the portrait shared by every screenshot. It's
**AI-generated** (Google AI Studio), so no model-release concerns apply.

To swap it for a different face, just drop a 600×600-ish JPEG over
`face.jpg` — every screenshot points at the same filename. To compress and
square-crop a larger source from the macOS command line:

```bash
sips -Z 600 -s format jpeg source.png --out face.jpg
```
