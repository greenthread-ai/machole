import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from 'electron';
import path from 'node:path';
import { loadRendererPage } from './window-utils';

// Startup permissions gate. macOS requires camera, microphone, and screen
// recording access; screen recording in particular only takes effect after
// the app is restarted, so the user is walked through granting + restarting
// before the camera overlay and recorder load.

const OVERLAY_PRELOAD = path.join(__dirname, 'overlay-preload.js');

type MediaType = 'camera' | 'microphone' | 'screen';

// System Settings > Privacy panes.
const PANE: Record<MediaType, string> = {
  camera: 'Privacy_Camera',
  microphone: 'Privacy_Microphone',
  screen: 'Privacy_ScreenCapture',
};

let permWindow: BrowserWindow | null = null;
let proceeded = false;
let screenGrantedAtBoot = false;

function status(type: MediaType): string {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus(type);
}

function teardownIpc(): void {
  ipcMain.removeHandler('perm:get');
  ipcMain.removeHandler('perm:request');
  ipcMain.removeAllListeners('perm:open-settings');
  ipcMain.removeAllListeners('perm:continue');
  ipcMain.removeAllListeners('perm:restart');
  ipcMain.removeAllListeners('perm:quit');
}

/** Run `startApp` once camera, microphone, and screen access are all in
 *  place — immediately if already granted, otherwise after onboarding. */
export function ensurePermissions(startApp: () => void): void {
  // Unsigned local builds skip the onboarding entirely. TCC for unsigned
  // apps is flaky across `npm run build` (binary identity changes), and
  // dev iteration doesn't benefit from being gated — the OS still prompts
  // on the actual getUserMedia / getSources call.
  if (!MACHOLE_SIGNED) {
    startApp();
    return;
  }

  screenGrantedAtBoot = status('screen') === 'granted';

  if (
    status('camera') === 'granted' &&
    status('microphone') === 'granted' &&
    screenGrantedAtBoot
  ) {
    startApp();
    return;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = 460;
  const height = 600;
  permWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: OVERLAY_PRELOAD },
  });
  loadRendererPage(permWindow, 'permissions.html');

  ipcMain.handle('perm:get', () => ({
    camera: status('camera'),
    microphone: status('microphone'),
    screen: status('screen'),
    screenGrantedAtBoot,
  }));

  // Trigger the OS's own permission prompt. Camera/microphone use the
  // in-process askForMediaAccess dialog; screen recording has no such API, so
  // attempting a capture makes macOS raise its own "record this screen"
  // dialog. In every case the system prompt — not a Settings redirect — is
  // what the user sees first (App Store Guideline 5.1.1(iv)).
  ipcMain.handle('perm:request', async (_e, type: MediaType) => {
    try {
      if (type === 'camera' || type === 'microphone') {
        await systemPreferences.askForMediaAccess(type);
      } else if (type === 'screen') {
        await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 },
        });
      }
    } catch {
      // The returned status reflects the outcome either way.
    }
    return status(type);
  });

  // Fallback only — used once a permission has been explicitly denied, where
  // the OS will no longer re-prompt and the user must toggle it in Settings.
  ipcMain.on('perm:open-settings', (_e, type: MediaType) => {
    shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${PANE[type]}`);
  });

  ipcMain.on('perm:continue', () => {
    if (proceeded) return;
    proceeded = true;
    teardownIpc();
    permWindow?.close();
    startApp();
  });

  ipcMain.on('perm:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.on('perm:quit', () => app.quit());

  permWindow.on('closed', () => {
    permWindow = null;
    teardownIpc();
    // Closed without finishing onboarding -> there is nothing else to do.
    if (!proceeded) app.quit();
  });
}
