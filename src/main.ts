import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
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
}

const defaults: Settings = {
  blurEnabled: true,
  autoframeEnabled: true,
  closeupEnabled: false,
  pulseEnabled: true,
  currentTheme: 'Rainbow',
  currentSize: 200,
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
  };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2));
}

const settings = loadSettings();
let blurEnabled = settings.blurEnabled;
let autoframeEnabled = settings.autoframeEnabled;
let closeupEnabled = settings.closeupEnabled;
let pulseEnabled = settings.pulseEnabled;
let currentTheme = settings.currentTheme;
let currentSize = settings.currentSize;

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
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]);
    contextMenu.popup({ window: mainWindow });
  });

  // Send saved settings to renderer once the page is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('set-theme', themes[currentTheme] || themes.Rainbow);
    mainWindow.webContents.send('set-size', currentSize);
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
