import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// A small, generic IPC bridge shared by every recording window (controls,
// picker, countdown, area selector). Each window only uses the channels it
// needs; the main process owns the channel contract.
contextBridge.exposeInMainWorld('bridge', {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  send: (channel: string, payload?: unknown) => ipcRenderer.send(channel, payload),
  on: (channel: string, callback: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
