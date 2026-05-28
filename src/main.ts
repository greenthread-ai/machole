import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import {
  initRecording,
  isRecordingActive,
  setRecordingStateListener,
  toggleRecording,
} from './recording-main';
import { ensurePermissions } from './permissions-main';

if (started) {
  app.quit();
}

// In production / MAS builds renderer console output never reaches the
// macOS unified log, the terminal, or anywhere else visible. Mirror every
// renderer console message (and any explicit logToFile calls from main)
// into a plain file in the app container so we can `cat` it via CLI when
// something fails silently in a TestFlight build.
//   ~/Library/Containers/ai.greenthread.machole/Data/Library/Application Support/machole/machole.log
let logFilePath: string | null = null;

function logToFile(line: string): void {
  if (!logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Best effort — never let logging break the app.
  }
}

interface RendererConsoleEvent {
  level: number | string;
  message: string;
  lineNumber?: number;
  sourceId?: string;
}

const RENDERER_LEVELS = ['verbose', 'info', 'warning', 'error'];

function setupRendererLogging(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (event: unknown) => {
      const e = event as RendererConsoleEvent;
      const level =
        typeof e.level === 'number' ? RENDERER_LEVELS[e.level] ?? String(e.level) : String(e.level);
      logToFile(`[renderer ${level}] ${e.message} (${e.sourceId ?? ''}:${e.lineNumber ?? 0})`);
    });
  });
}

// Unsigned and ad-hoc builds can't access the real keychain without prompting,
// so they fall back to a mock keychain. A properly signed build uses the real
// keychain so cookie encryption (the EnableCookieEncryption fuse) works.
if (process.platform === 'darwin' && !MACHOLE_SIGNED) {
  app.commandLine.appendSwitch('use-mock-keychain');
}

const PULSE_BUFFER = 80; // extra space for glow petals

interface Settings {
  blurEnabled: boolean;
  autoframeEnabled: boolean;
  closeupEnabled: boolean;
  pulseEnabled: boolean;
  currentTheme: string;
  currentSize: number;
  currentCamera: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const defaults: Settings = {
  blurEnabled: true,
  autoframeEnabled: true,
  closeupEnabled: false,
  pulseEnabled: true,
  currentTheme: 'Rainbow',
  currentSize: 200,
  currentCamera: '',
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(): Settings {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf-8');
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  const data: Settings = {
    blurEnabled,
    autoframeEnabled,
    closeupEnabled,
    pulseEnabled,
    currentTheme,
    currentSize,
    currentCamera,
  };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2));
}

function getIntersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return width * height;
}

const settings = loadSettings();
let blurEnabled = settings.blurEnabled;
let autoframeEnabled = settings.autoframeEnabled;
let closeupEnabled = settings.closeupEnabled;
let pulseEnabled = settings.pulseEnabled;
let currentTheme = settings.currentTheme;
let currentSize = settings.currentSize;
let currentCamera = settings.currentCamera;
let cameraDevices: { id: string; label: string }[] = [];

// The camera overlay window. The recording module needs a handle to it so
// the "camera on/off" control can hide/show the face during a recording.
let cameraWindow: BrowserWindow | null = null;

// Menu bar extra. Machole runs as an agent app (no Dock icon), so the Tray is
// its required standard macOS presence (App Store Guideline 4).
let tray: Tray | null = null;

const themes: Record<string, string[]> = {
  Rainbow: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b'],
  Sunset: ['#ff6b6b', '#ff9f43', '#feca57', '#ff9f43', '#ff6b6b'],
  Ocean: ['#0abde3', '#48dbfb', '#54a0ff', '#48dbfb', '#0abde3'],
  Neon: ['#f368e0', '#ff9ff3', '#5f27cd', '#6c5ce7', '#f368e0'],
  Forest: ['#4ecb8d', '#6edba3', '#ffffff', '#6edba3', '#3dab78', '#4ecb8d'],
};

// Menu of camera-overlay settings, shared by the overlay's right-click context
// menu and the menu bar extra (Tray). Reads the live state each time it is
// built and dispatches to the camera window via IPC.
function buildOverlayMenuItems(): MenuItemConstructorOptions[] {
  const send = (channel: string, payload?: unknown) =>
    cameraWindow?.webContents.send(channel, payload);

  return [
    {
      label: 'Background Blur',
      type: 'checkbox',
      checked: blurEnabled,
      click: () => {
        blurEnabled = !blurEnabled;
        send('toggle-blur', blurEnabled);
        saveSettings();
      },
    },
    {
      label: 'Auto-Frame',
      type: 'checkbox',
      checked: autoframeEnabled,
      click: () => {
        autoframeEnabled = !autoframeEnabled;
        send('toggle-autoframe', autoframeEnabled);
        saveSettings();
      },
    },
    {
      label: 'Close-Up',
      type: 'checkbox',
      checked: closeupEnabled,
      click: () => {
        closeupEnabled = !closeupEnabled;
        send('toggle-closeup', closeupEnabled);
        saveSettings();
      },
    },
    {
      label: 'Audio Pulse',
      type: 'checkbox',
      checked: pulseEnabled,
      click: () => {
        pulseEnabled = !pulseEnabled;
        send('toggle-pulse', pulseEnabled);
        saveSettings();
      },
    },
    { type: 'separator' },
    {
      label: 'Theme',
      submenu: Object.keys(themes).map((name) => ({
        label: name,
        type: 'radio' as const,
        checked: currentTheme === name,
        click: () => {
          currentTheme = name;
          send('set-theme', themes[name]);
          saveSettings();
        },
      })),
    },
    {
      label: 'Size',
      submenu: [
        { label: 'Small', value: 150 },
        { label: 'Medium', value: 200 },
        { label: 'Large', value: 300 },
      ].map(({ label, value }) => ({
        label,
        type: 'radio' as const,
        checked: currentSize === value,
        click: () => {
          currentSize = value;
          cameraWindow?.setSize(value + PULSE_BUFFER, value + PULSE_BUFFER);
          send('set-size', value);
          saveSettings();
        },
      })),
    },
    {
      label: 'Camera',
      submenu: [
        {
          label: 'Refresh Cameras',
          click: () => send('request-camera-list'),
        },
        { type: 'separator' as const },
        ...(cameraDevices.length > 0
          ? cameraDevices.map(({ id, label }) => ({
              label,
              type: 'radio' as const,
              checked: currentCamera ? currentCamera === id : cameraDevices[0]?.id === id,
              click: () => {
                currentCamera = id;
                send('set-camera', id);
                saveSettings();
              },
            }))
          : [{ label: 'No cameras detected yet', enabled: false }]),
      ],
    },
  ];
}

const createWindow = () => {
  const winSize = currentSize + PULSE_BUFFER;
  const mainWindow = new BrowserWindow({
    width: winSize,
    height: winSize,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    // roundedCorners: false changes the underlying NSWindow class on macOS
    // and stopped this window from being draggable under the App Sandbox /
    // mas Electron variant. Leave it at the default (true) — the visible
    // content is a circle drawn in CSS, so the rectangular window's corners
    // are transparent anyway.
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  // Belt and braces — drag should work via -webkit-app-region anyway, but
  // be explicit about the OS-level movability under sandbox.
  mainWindow.setMovable(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const ensureWindowVisible = () => {
    if (mainWindow.isDestroyed()) {
      return;
    }

    const bounds = mainWindow.getBounds();
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { workArea } = cursorDisplay;

    const visibleArea = getIntersectionArea(bounds, workArea);
    const totalArea = Math.max(1, bounds.width * bounds.height);
    const visibilityRatio = visibleArea / totalArea;

    if (visibilityRatio >= 0.6) {
      return;
    }

    const margin = 10;
    const targetX = workArea.x + workArea.width - bounds.width - margin;
    const targetY = workArea.y + workArea.height - bounds.height - margin;
    mainWindow.setPosition(targetX, targetY);
  };

  cameraWindow = mainWindow;

  // No periodic poll and no `move` handler — both call setPosition and were
  // suspected of interrupting user drags in the MAS sandbox build. Only the
  // initial position and a one-shot check on show remain.
  mainWindow.on('show', ensureWindowVisible);
  mainWindow.on('closed', () => {
    cameraWindow = null;
  });

  // Position bottom-right with 10px margin
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow.setPosition(
    workArea.x + workArea.width - winSize - 10,
    workArea.y + workArea.height - winSize - 10,
  );

  mainWindow.webContents.on('context-menu', () => {
    const contextMenu = Menu.buildFromTemplate([
      ...buildOverlayMenuItems(),
      { type: 'separator' },
      { label: 'Quit Machole', click: () => app.quit() },
    ]);
    contextMenu.popup({ window: mainWindow });
  });

  // Receive camera list from renderer
ipcMain.on('camera-list', (_event, devices: { id: string; label: string }[]) => {
  cameraDevices = devices;
  // Keep the menu bar extra's Camera submenu in sync as devices appear.
  rebuildTrayMenu();
});

ipcMain.on('active-camera', (_event, deviceId: string) => {
  if (!deviceId) return;
  currentCamera = deviceId;
  saveSettings();
});

  // Send saved settings to renderer once the page is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('set-theme', themes[currentTheme] || themes.Rainbow);
    mainWindow.webContents.send('set-size', currentSize);
    mainWindow.webContents.send('set-camera', currentCamera);
    mainWindow.webContents.send('toggle-blur', blurEnabled);
    mainWindow.webContents.send('toggle-autoframe', autoframeEnabled);
    mainWindow.webContents.send('toggle-closeup', closeupEnabled);
    mainWindow.webContents.send('toggle-pulse', pulseEnabled);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

ipcMain.on('quit-app', () => {
  app.quit();
});

// --- Menu bar extra ---------------------------------------------------------

/** Locate the menu bar template icon across dev and packaged layouts. */
function trayIconPath(): string | null {
  const candidates = [
    // Packaged: copied to Contents/Resources via forge `extraResource`.
    path.join(process.resourcesPath, 'trayTemplate.png'),
    // Dev (`.vite/build/main.js`) -> repo build/ dir.
    path.join(__dirname, '../../build/trayTemplate.png'),
    path.join(app.getAppPath(), 'build/trayTemplate.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** (Re)build the tray's context menu, reflecting the live recording state. */
function rebuildTrayMenu(): void {
  if (!tray) return;
  const recording = isRecordingActive();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: recording ? 'Stop Recording' : 'Record…',
        click: () => toggleRecording(),
      },
      { type: 'separator' },
      ...buildOverlayMenuItems(),
      { type: 'separator' },
      { label: 'Quit Machole', click: () => app.quit() },
    ]),
  );
}

function createTray(): void {
  if (tray) return;
  const iconPath = trayIconPath();
  const image = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  // Template image: the OS recolours it for the light/dark menu bar.
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Machole');
  rebuildTrayMenu();
  // Recording start/stop relabels the Record/Stop item.
  setRecordingStateListener(() => rebuildTrayMenu());
}

app.on('ready', () => {
  if (app.dock) {
    app.dock.hide();
  }

  // Set up file logging as the very first thing so anything we log from here
  // on lands in the file.
  try {
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });
    logFilePath = path.join(userData, 'machole.log');
    fs.writeFileSync(logFilePath, '');
  } catch {
    logFilePath = null;
  }
  logToFile(
    `launch electron=${process.versions.electron} platform=${process.platform} signed=${MACHOLE_SIGNED} sandboxed=${(process as NodeJS.Process & { sandboxed?: boolean }).sandboxed ?? 'unknown'}`,
  );
  setupRendererLogging();

  // Gate the camera overlay and recorder behind a permissions check so the
  // app never loads into a broken state on first launch.
  ensurePermissions(() => {
    createWindow();
    initRecording(() => cameraWindow);
    createTray();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
