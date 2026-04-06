import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Module from 'node:module';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
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

interface NativeSpaceBridge {
  configurePiPWindow: (nativeWindowHandle: Buffer) => boolean;
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
let nativeSpaceBridge: NativeSpaceBridge | null | undefined;
let nativeSpaceBridgeApplyFailed = false;
const nativeRequire = Module.createRequire(__filename);

function loadNativeSpaceBridge(): NativeSpaceBridge | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  if (nativeSpaceBridge !== undefined) {
    return nativeSpaceBridge;
  }

  const candidates = [
    path.join(app.getAppPath(), 'native/window-space/build/Release/window_space.node'),
    path.join(process.resourcesPath, 'app.asar.unpacked/native/window-space/build/Release/window_space.node'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      const bridge = nativeRequire(candidate) as NativeSpaceBridge;
      if (typeof bridge.configurePiPWindow === 'function') {
        nativeSpaceBridge = bridge;
        return nativeSpaceBridge;
      }
    } catch (error) {
      console.warn('Failed loading native macOS space bridge:', error);
    }
  }

  nativeSpaceBridge = null;
  console.warn('Native macOS space bridge not found. Run `npm run native:build` to enable PiP-style space behavior.');
  return nativeSpaceBridge;
}

const themes: Record<string, string[]> = {
  Rainbow: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b'],
  Sunset: ['#ff6b6b', '#ff9f43', '#feca57', '#ff9f43', '#ff6b6b'],
  Ocean: ['#0abde3', '#48dbfb', '#54a0ff', '#48dbfb', '#0abde3'],
  Neon: ['#f368e0', '#ff9ff3', '#5f27cd', '#6c5ce7', '#f368e0'],
  Forest: ['#4ecb8d', '#6edba3', '#ffffff', '#6edba3', '#3dab78', '#4ecb8d'],
};

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
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const pinAcrossSpaces = () => {
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');

    const bridge = loadNativeSpaceBridge();
    if (bridge) {
      const applied = bridge.configurePiPWindow(mainWindow.getNativeWindowHandle());
      if (!applied && !nativeSpaceBridgeApplyFailed) {
        nativeSpaceBridgeApplyFailed = true;
        console.warn('Native macOS space bridge loaded but could not resolve NSWindow from native handle.');
      }
    }
  };

  pinAcrossSpaces();
  mainWindow.on('show', pinAcrossSpaces);
  mainWindow.on('focus', pinAcrossSpaces);

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

  const visibilityGuard = setInterval(ensureWindowVisible, 220);
  mainWindow.on('move', ensureWindowVisible);
  mainWindow.on('show', ensureWindowVisible);
  mainWindow.on('closed', () => clearInterval(visibilityGuard));

  // Position bottom-right with 10px margin
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow.setPosition(
    workArea.x + workArea.width - winSize - 10,
    workArea.y + workArea.height - winSize - 10,
  );

  mainWindow.webContents.on('context-menu', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Background Blur',
        type: 'checkbox',
        checked: blurEnabled,
        click: () => {
          blurEnabled = !blurEnabled;
          mainWindow.webContents.send('toggle-blur', blurEnabled);
          saveSettings();
        },
      },
      {
        label: 'Auto-Frame',
        type: 'checkbox',
        checked: autoframeEnabled,
        click: () => {
          autoframeEnabled = !autoframeEnabled;
          mainWindow.webContents.send('toggle-autoframe', autoframeEnabled);
          saveSettings();
        },
      },
      {
        label: 'Close-Up',
        type: 'checkbox',
        checked: closeupEnabled,
        click: () => {
          closeupEnabled = !closeupEnabled;
          mainWindow.webContents.send('toggle-closeup', closeupEnabled);
          saveSettings();
        },
      },
      {
        label: 'Audio Pulse',
        type: 'checkbox',
        checked: pulseEnabled,
        click: () => {
          pulseEnabled = !pulseEnabled;
          mainWindow.webContents.send('toggle-pulse', pulseEnabled);
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
            mainWindow.webContents.send('set-theme', themes[name]);
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
            mainWindow.setSize(value + PULSE_BUFFER, value + PULSE_BUFFER);
            mainWindow.webContents.send('set-size', value);
            saveSettings();
          },
        })),
      },
      {
        label: 'Camera',
        submenu: [
          {
            label: 'Refresh Cameras',
            click: () => {
              mainWindow.webContents.send('request-camera-list');
            },
          },
          { type: 'separator' },
          ...(cameraDevices.length > 0
            ? cameraDevices.map(({ id, label }) => ({
                label,
                type: 'radio' as const,
                checked: currentCamera ? currentCamera === id : cameraDevices[0]?.id === id,
                click: () => {
                  currentCamera = id;
                  mainWindow.webContents.send('set-camera', id);
                  saveSettings();
                },
              }))
            : [
                {
                  label: 'No cameras detected yet',
                  enabled: false,
                },
              ]),
        ],
      },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]);
    contextMenu.popup({ window: mainWindow });
  });

  // Receive camera list from renderer
ipcMain.on('camera-list', (_event, devices: { id: string; label: string }[]) => {
  cameraDevices = devices;
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

app.on('ready', () => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
  }

  if (app.dock) {
    app.dock.hide();
  }
  createWindow();
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
