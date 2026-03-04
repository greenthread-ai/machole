import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('machole', {
  quitApp: () => ipcRenderer.send('quit-app'),
  onToggleBlur: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('toggle-blur', (_event, enabled: boolean) => callback(enabled));
  },
  onToggleAutoframe: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('toggle-autoframe', (_event, enabled: boolean) => callback(enabled));
  },
  onToggleCloseup: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('toggle-closeup', (_event, enabled: boolean) => callback(enabled));
  },
  onTogglePulse: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on('toggle-pulse', (_event, enabled: boolean) => callback(enabled));
  },
  onSetTheme: (callback: (colors: string[]) => void) => {
    ipcRenderer.on('set-theme', (_event, colors: string[]) => callback(colors));
  },
  onSetSize: (callback: (size: number) => void) => {
    ipcRenderer.on('set-size', (_event, size: number) => callback(size));
  },
});
