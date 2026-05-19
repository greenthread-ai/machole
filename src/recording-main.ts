import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  session,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { loadRendererPage } from './window-utils';
import { compress, findFfmpeg } from './ffmpeg';
import type { BeginPayload, CaptureSource, CropFraction, ShortcutAction } from './recording-types';

// Recording orchestration lives in the main process: it owns the windows,
// the desktopCapturer source list, global shortcuts, and writing the final
// file. The actual MediaRecorder runs in the controls window (renderer).

const OVERLAY_PRELOAD = path.join(__dirname, 'overlay-preload.js');

let controlsWindow: BrowserWindow | null = null;
let pickerWindow: BrowserWindow | null = null;
let countdownWindow: BrowserWindow | null = null;
let areaWindow: BrowserWindow | null = null;
// Border drawn around the recorded region while recording.
let frameWindow: BrowserWindow | null = null;
// Progress overlay shown while ffmpeg compresses the finished recording.
let compressingWindow: BrowserWindow | null = null;

let getCameraWindow: () => BrowserWindow | null = () => null;

// The desktopCapturer source the displayMedia request handler should grant.
let pendingSourceId: string | null = null;
// Config carried from source selection through the countdown to "begin".
let pendingBegin: BeginPayload | null = null;
// Where to draw the recording border once the countdown finishes.
let pendingFrame: {
  displayId: string;
  mode: BeginPayload['mode'];
  rect: Electron.Rectangle | null;
} | null = null;
let recordingActive = false;

// Temp file the controls window streams recorded chunks into.
let recordingTmpPath: string | null = null;
let recordingStream: fs.WriteStream | null = null;

function cursorDisplay(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function sendToControls(channel: string, payload?: unknown): void {
  controlsWindow?.webContents.send(channel, payload);
}

// --- Controls overlay -------------------------------------------------------

function createControlsWindow(): void {
  const width = 380;
  const height = 286;
  const { workArea } = screen.getPrimaryDisplay();
  controlsWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + 24,
    y: workArea.y + workArea.height - height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: OVERLAY_PRELOAD,
      backgroundThrottling: false,
    },
  });
  controlsWindow.setAlwaysOnTop(true, 'screen-saver');
  controlsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Keep the controls/shortcuts overlay out of the recording itself.
  controlsWindow.setContentProtection(true);
  loadRendererPage(controlsWindow, 'controls.html');
  controlsWindow.on('closed', () => {
    controlsWindow = null;
  });
}

// --- Source picker ----------------------------------------------------------

function openPicker(): void {
  if (pickerWindow) {
    pickerWindow.focus();
    return;
  }
  const display = cursorDisplay();
  const width = 780;
  const height = 580;
  pickerWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: OVERLAY_PRELOAD },
  });
  pickerWindow.setAlwaysOnTop(true, 'screen-saver');
  pickerWindow.setContentProtection(true);
  loadRendererPage(pickerWindow, 'picker.html');
  pickerWindow.on('closed', () => {
    pickerWindow = null;
  });
}

function closePicker(): void {
  pickerWindow?.close();
  pickerWindow = null;
}

// --- Area selector ----------------------------------------------------------

function selectArea(): Promise<{ display: Electron.Display; rect: Electron.Rectangle } | null> {
  return new Promise((resolve) => {
    const display = cursorDisplay();
    const { x, y, width, height } = display.bounds;
    areaWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      skipTaskbar: true,
      fullscreenable: false,
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: OVERLAY_PRELOAD, backgroundThrottling: false },
    });
    areaWindow.setAlwaysOnTop(true, 'screen-saver');
    areaWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    areaWindow.setContentProtection(true);
    loadRendererPage(areaWindow, 'area.html');
    areaWindow.once('ready-to-show', () => areaWindow?.focus());

    const finish = (rect: Electron.Rectangle | null) => {
      ipcMain.removeListener('area:commit', onCommit);
      ipcMain.removeListener('area:cancel', onCancel);
      areaWindow?.close();
      areaWindow = null;
      resolve(rect ? { display, rect } : null);
    };
    const onCommit = (_e: unknown, rect: Electron.Rectangle) => finish(rect);
    const onCancel = () => finish(null);
    ipcMain.once('area:commit', onCommit);
    ipcMain.once('area:cancel', onCancel);
    areaWindow.on('closed', () => {
      ipcMain.removeListener('area:commit', onCommit);
      ipcMain.removeListener('area:cancel', onCancel);
    });
  });
}

// --- Countdown --------------------------------------------------------------

function startCountdown(displayId: string): void {
  const display =
    screen.getAllDisplays().find((d) => String(d.id) === String(displayId)) ?? cursorDisplay();
  const { x, y, width, height } = display.bounds;
  countdownWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: OVERLAY_PRELOAD, backgroundThrottling: false },
  });
  countdownWindow.setAlwaysOnTop(true, 'screen-saver');
  countdownWindow.setIgnoreMouseEvents(true);
  countdownWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // The countdown is a cue for the user, not part of the recording.
  countdownWindow.setContentProtection(true);
  loadRendererPage(countdownWindow, 'countdown.html');
  countdownWindow.on('closed', () => {
    countdownWindow = null;
  });
}

// --- Recording border -------------------------------------------------------

function openFrame(): void {
  if (!pendingFrame) return;
  const display =
    screen.getAllDisplays().find((d) => String(d.id) === String(pendingFrame?.displayId)) ??
    cursorDisplay();
  const { x, y, width, height } = display.bounds;
  frameWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: OVERLAY_PRELOAD, backgroundThrottling: false },
  });
  frameWindow.setAlwaysOnTop(true, 'screen-saver');
  frameWindow.setIgnoreMouseEvents(true);
  frameWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // The border is a guide for the user, not part of the recording.
  frameWindow.setContentProtection(true);
  loadRendererPage(frameWindow, 'frame.html');
  const frame = pendingFrame;
  frameWindow.webContents.on('did-finish-load', () => {
    frameWindow?.webContents.send('frame:config', { mode: frame.mode, rect: frame.rect });
  });
  frameWindow.on('closed', () => {
    frameWindow = null;
  });
  // Keep the controls panel above the border line.
  controlsWindow?.moveTop();
}

function closeFrame(): void {
  frameWindow?.close();
  frameWindow = null;
}

// --- Compression overlay ----------------------------------------------------

function openCompressing(): void {
  const display = cursorDisplay();
  const width = 380;
  const height = 150;
  compressingWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: OVERLAY_PRELOAD, backgroundThrottling: false },
  });
  compressingWindow.setAlwaysOnTop(true, 'screen-saver');
  compressingWindow.setIgnoreMouseEvents(true);
  compressingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRendererPage(compressingWindow, 'compressing.html');
  compressingWindow.on('closed', () => {
    compressingWindow = null;
  });
}

function closeCompressing(): void {
  compressingWindow?.close();
  compressingWindow = null;
}

// --- Recording lifecycle ----------------------------------------------------

const RECORDING_SHORTCUTS: Record<string, ShortcutAction> = {
  'CommandOrControl+Shift+P': 'pause',
  'CommandOrControl+Shift+M': 'mute',
  'CommandOrControl+Shift+E': 'camera',
};

function registerRecordingShortcuts(): void {
  for (const [accel, action] of Object.entries(RECORDING_SHORTCUTS)) {
    globalShortcut.register(accel, () => sendToControls('shortcut', action));
  }
}

function unregisterRecordingShortcuts(): void {
  for (const accel of Object.keys(RECORDING_SHORTCUTS)) {
    globalShortcut.unregister(accel);
  }
}

/** Begin a session: stash the source, run the countdown, then tell the
 *  controls window to start the MediaRecorder. */
function beginSession(
  sourceId: string,
  payload: BeginPayload,
  displayId: string,
  rect: Electron.Rectangle | null = null,
): void {
  pendingSourceId = sourceId;
  pendingBegin = payload;
  pendingFrame = { displayId, mode: payload.mode, rect };
  startCountdown(displayId);
}

function tearDownRecording(): void {
  recordingActive = false;
  pendingSourceId = null;
  pendingBegin = null;
  pendingFrame = null;
  closeFrame();
  unregisterRecordingShortcuts();
  getCameraWindow()?.show();
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(
    d.getMinutes(),
  )}.${p(d.getSeconds())}`;
}

/** Move a file, copying across volumes if a plain rename fails. */
function moveFile(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch {
    // The temp dir may be on a different volume than the destination.
    fs.copyFileSync(from, to);
    fs.unlink(from, () => undefined);
  }
}

/** Return `filePath` with its extension replaced by `ext`. */
function swapExtension(filePath: string, ext: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(path.dirname(filePath), `${base}.${ext}`);
}

// --- IPC + handler wiring ---------------------------------------------------

/** True from the moment a source is chosen until the recording ends — i.e.
 *  during the countdown and the recording itself. */
function isBusy(): boolean {
  return recordingActive || pendingBegin !== null;
}

function registerIpc(): void {
  // The controls window asks to start a recording -> show the source picker.
  ipcMain.on('rec:request-record', () => {
    if (!isBusy()) openPicker();
  });

  ipcMain.on('rec:cancel-picker', () => closePicker());

  ipcMain.handle('rec:get-sources', async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 360, height: 224 },
      fetchWindowIcons: true,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      displayId: s.display_id,
    }));
  });

  // A screen or window thumbnail was picked.
  ipcMain.on('rec:start-with-source', (_e, src: CaptureSource) => {
    closePicker();
    beginSession(src.id, { mode: src.type, crop: null }, src.displayId);
  });

  // "Select Area" was picked -> draw a rectangle, crop that display's screen.
  ipcMain.on('rec:start-with-area', async () => {
    closePicker();
    const selection = await selectArea();
    if (!selection) {
      openPicker();
      return;
    }
    const { display, rect } = selection;
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const screenSource =
      sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0];
    if (!screenSource) {
      openPicker();
      return;
    }
    // Express the crop as fractions of the display so it survives whatever
    // pixel resolution the OS hands the renderer.
    const crop: CropFraction = {
      x: rect.x / display.size.width,
      y: rect.y / display.size.height,
      width: rect.width / display.size.width,
      height: rect.height / display.size.height,
    };
    beginSession(screenSource.id, { mode: 'area', crop }, String(display.id), rect);
  });

  // Pause/resume reported by the controls window -> recolour the border.
  ipcMain.on('rec:paused', (_e, paused: boolean) => {
    frameWindow?.webContents.send('frame:state', paused ? 'paused' : 'recording');
  });

  // Countdown finished -> hand off to the recorder.
  ipcMain.on('countdown:done', () => {
    countdownWindow?.close();
    countdownWindow = null;
    if (!pendingBegin) return;
    recordingActive = true;
    registerRecordingShortcuts();
    sendToControls('rec:begin', pendingBegin);
    openFrame();
  });

  // --- chunk streaming to a temp file ---
  ipcMain.handle('rec:recorder-open', () => {
    recordingTmpPath = path.join(app.getPath('temp'), `machole-${Date.now()}.tmp`);
    recordingStream = fs.createWriteStream(recordingTmpPath);
  });

  ipcMain.handle('rec:chunk', (_e, payload: { buffer: ArrayBuffer }) => {
    recordingStream?.write(Buffer.from(payload.buffer));
  });

  ipcMain.handle(
    'rec:finalize',
    async (_e, payload: { ext: string; durationSec?: number }) => {
      await new Promise<void>((resolve) => {
        if (recordingStream) recordingStream.end(() => resolve());
        else resolve();
      });
      recordingStream = null;
      const tmp = recordingTmpPath;
      recordingTmpPath = null;
      if (!tmp) return { saved: false };

      // Compression re-encodes to mp4, so the saved file is mp4 whenever
      // ffmpeg is available; otherwise we keep what the recorder produced.
      const ffmpegPath = findFfmpeg();
      const outExt = ffmpegPath ? 'mp4' : payload.ext;

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save recording',
        defaultPath: path.join(app.getPath('videos'), `Machole ${timestamp()}.${outExt}`),
        filters: [{ name: 'Video', extensions: [outExt] }],
      });
      if (canceled || !filePath) {
        fs.unlink(tmp, () => undefined);
        return { saved: false };
      }

      // No ffmpeg on this machine — save the raw recording, as before.
      if (!ffmpegPath) {
        moveFile(tmp, filePath);
        return { saved: true, path: filePath, compressed: false };
      }

      // Compress the temp file straight to the chosen destination, showing a
      // progress overlay. If anything fails, fall back to the raw recording
      // so a recording is never lost.
      openCompressing();
      try {
        await compress({
          ffmpegPath,
          input: tmp,
          output: filePath,
          durationSec: payload.durationSec ?? 0,
          onProgress: (fraction) => {
            compressingWindow?.webContents.send('compress:progress', fraction);
          },
        });
        closeCompressing();
        fs.unlink(tmp, () => undefined);
        return { saved: true, path: filePath, compressed: true };
      } catch (err) {
        console.error('Compression failed; saving the raw recording instead:', err);
        closeCompressing();
        fs.unlink(filePath, () => undefined); // discard the partial output
        const rawPath =
          payload.ext === outExt ? filePath : swapExtension(filePath, payload.ext);
        moveFile(tmp, rawPath);
        return { saved: true, path: rawPath, compressed: false };
      }
    },
  );

  // Controls window reports the recorder has fully stopped.
  ipcMain.on('rec:stopped', () => tearDownRecording());

  // Toggle the camera overlay (its "video") in/out of the recording.
  ipcMain.on('rec:camera-visibility', (_e, visible: boolean) => {
    const cam = getCameraWindow();
    if (!cam) return;
    if (visible) cam.show();
    else cam.hide();
  });
}

/** Public entry point, called from main.ts once the app is ready. */
export function initRecording(cameraWindowGetter: () => BrowserWindow | null): void {
  getCameraWindow = cameraWindowGetter;

  // Hand the renderer's getDisplayMedia() call the source the user picked.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      if (!pendingSourceId) {
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          const source = sources.find((s) => s.id === pendingSourceId);
          // 'loopback' captures system audio (speakers) on macOS 13+.
          if (source) callback({ video: source, audio: 'loopback' });
          else callback({});
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );

  registerIpc();
  createControlsWindow();

  // Cmd+Shift+R always toggles recording: open the picker when idle, stop
  // when recording. The pause/mute/camera shortcuts are only live mid-record.
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (recordingActive) sendToControls('shortcut', 'stop' as ShortcutAction);
    else if (!isBusy()) openPicker();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
