// Shared contract between the main process and the recording windows.

export type SourceType = 'screen' | 'window';

export interface CaptureSource {
  id: string; // desktopCapturer source id
  name: string;
  type: SourceType;
  thumbnail: string; // data URL
  appIcon: string | null; // data URL
  displayId: string;
}

/** A crop expressed as fractions (0..1) of the captured video, so it is
 *  independent of the actual pixel resolution the OS hands us. */
export interface CropFraction {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sent to the controls window once the countdown finishes. */
export interface BeginPayload {
  mode: 'screen' | 'window' | 'area';
  crop: CropFraction | null; // area mode only
}

export type ShortcutAction = 'stop' | 'pause' | 'mute' | 'camera';

/** Generic IPC bridge exposed by overlay-preload.ts. */
export interface OverlayBridge {
  invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>;
  send: (channel: string, payload?: unknown) => void;
  on: (channel: string, callback: (payload: unknown) => void) => () => void;
}

declare global {
  interface Window {
    bridge: OverlayBridge;
  }
}
