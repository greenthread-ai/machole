import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Post-recording compression. A GUI app launched from Finder does NOT inherit
// the shell PATH, so a Homebrew-installed ffmpeg won't be on PATH — we probe
// the usual install locations explicitly. ffmpeg is optional: when it's
// missing the recording is simply saved unchanged.

const KNOWN_DIRS = [
  '/opt/homebrew/bin', // Apple Silicon Homebrew
  '/usr/local/bin', // Intel Homebrew
  '/opt/local/bin', // MacPorts
  '/usr/bin',
];

/** Locate an `ffmpeg` executable, or return null if none is installed. */
export function findFfmpeg(): string | null {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of [...KNOWN_DIRS, ...pathDirs]) {
    const candidate = path.join(dir, 'ffmpeg');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory — keep looking.
    }
  }
  return null;
}

export interface CompressOptions {
  ffmpegPath: string;
  input: string;
  output: string;
  /** Recording length in seconds, used to compute progress. 0 = unknown. */
  durationSec: number;
  /** Called with a 0..1 fraction as encoding proceeds. */
  onProgress: (fraction: number) => void;
}

/** Parse an ffmpeg `HH:MM:SS.ffffff` timestamp into seconds. */
function parseTimestamp(value: string): number {
  const m = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Re-encode `input` to a smaller H.264 mp4 at `output`. Rejects if ffmpeg
 *  fails or exits non-zero, leaving `input` untouched so the caller can fall
 *  back to saving the raw recording. */
export function compress(opts: CompressOptions): Promise<void> {
  const { ffmpegPath, input, output, durationSec, onProgress } = opts;
  return new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-nostdin',
      '-i',
      input,
      // H.264 at a constant quality — screen content compresses heavily.
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '26',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      // Machine-readable progress on stdout; keep stderr to real errors.
      '-progress',
      'pipe:1',
      '-nostats',
      '-loglevel',
      'error',
      output,
    ];
    const child = spawn(ffmpegPath, args);

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    // `-progress` output arrives as newline-separated key=value pairs.
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const eq = line.indexOf('=');
        if (eq !== -1 && line.slice(0, eq) === 'out_time' && durationSec > 0) {
          const seconds = parseTimestamp(line.slice(eq + 1));
          if (Number.isFinite(seconds)) {
            onProgress(Math.min(1, Math.max(0, seconds / durationSec)));
          }
        }
        newline = buffer.indexOf('\n');
      }
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
