// Render every *.html in this directory to a PNG using Electron's headless
// page capture. Output lands next to each HTML at the matching `.png` name.
// Run with:
//   node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
//     marketing/app-store/screenshots/render.mjs
//
// Captured pixel size is 1440x900 * the runner's screen scale factor —
// on a Retina Mac that's the App-Store-preferred 2880x1800.

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, writeFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmls = readdirSync(here).filter((f) => f.endsWith('.html') && f !== 'index.html');

app.commandLine.appendSwitch('disable-gpu-rasterization');

await app.whenReady();

for (const file of htmls) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    useContentSize: true,
    webPreferences: { sandbox: false, backgroundThrottling: false },
  });
  await win.loadFile(path.join(here, file));
  // Give CSS animations / fonts a moment to settle.
  await new Promise((r) => setTimeout(r, 700));
  const image = await win.webContents.capturePage();
  const outPath = path.join(here, file.replace(/\.html$/, '.png'));
  writeFileSync(outPath, image.toPNG());
  console.log('wrote', outPath, image.getSize());
  win.destroy();
}

app.quit();
