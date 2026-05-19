import path from 'node:path';
import type { BrowserWindow } from 'electron';

/** Load one page of the multi-page renderer into a window — from the Vite
 *  dev server in development, or the built files in production. */
export function loadRendererPage(win: BrowserWindow, page: string): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/${page}`);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/${page}`));
  }
}
