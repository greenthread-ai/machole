import './controls.css';
import type { BeginPayload, CropFraction, ShortcutAction } from './recording-types';

// The controls overlay. It is always on screen, hosts the MediaRecorder, and
// is excluded from the recording itself (content protection set in main).

type State = 'idle' | 'recording' | 'paused';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

const statusEl = $('status');
const idleView = $('idle-view');
const recView = $('rec-view');
const recordBtn = $('record-btn');
const stopBtn = $('stop-btn');
const pauseBtn = $('pause-btn');
const micBtn = $('mic-btn');
const camBtn = $('cam-btn');
const recDot = $('rec-dot');
const timerEl = $('timer');

let state: State = 'idle';

// --- capture / recorder state ---
let recorder: MediaRecorder | null = null;
let displayStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let cropStream: MediaStream | null = null;
let cropVideo: HTMLVideoElement | null = null;
let cropRAF = 0;
let audioContext: AudioContext | null = null;
let micGain: GainNode | null = null;
let recordedExt: 'mp4' | 'webm' = 'webm';
// Chunks are streamed to main one at a time, in order.
let chunkQueue: Promise<void> = Promise.resolve();

let micMuted = false;
let cameraOn = true;
let hasMic = false;

// --- timer ---
let elapsed = 0;
let timerId: ReturnType<typeof setInterval> | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function formatTime(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function startTimer(): void {
  elapsed = 0;
  timerEl.textContent = '00:00';
  timerId = setInterval(() => {
    elapsed += 1;
    timerEl.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer(): void {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function setState(next: State): void {
  state = next;
  idleView.classList.toggle('hidden', next !== 'idle');
  recView.classList.toggle('hidden', next === 'idle');
  recDot.classList.toggle('paused', next === 'paused');
  pauseBtn.querySelector('.lbl').textContent = next === 'paused' ? 'Resume' : 'Pause';
}

// --- source / recording ----------------------------------------------------

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=h264,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/** Area mode: draw the chosen sub-rectangle of the screen onto a canvas and
 *  record that canvas instead of the full display. */
async function buildCroppedTrack(
  source: MediaStreamTrack,
  crop: CropFraction,
): Promise<MediaStreamTrack> {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([source]);
  video.muted = true;
  await video.play();
  await new Promise<void>((resolve) => {
    if (video.videoWidth) resolve();
    else video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  // H.264 requires even dimensions.
  const cw = Math.max(2, Math.round((crop.width * vw) / 2) * 2);
  const ch = Math.max(2, Math.round((crop.height * vh) / 2) * 2);
  const sx = Math.round(crop.x * vw);
  const sy = Math.round(crop.y * vh);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
    cropRAF = requestAnimationFrame(draw);
  };
  draw();

  cropVideo = video;
  cropStream = canvas.captureStream(30);
  return cropStream.getVideoTracks()[0];
}

/** Mix system audio (loopback) and the microphone into one track. */
function buildMixedAudio(): MediaStreamTrack | null {
  const systemTracks = displayStream?.getAudioTracks() ?? [];
  const micTracks = micStream?.getAudioTracks() ?? [];
  if (systemTracks.length === 0 && micTracks.length === 0) return null;

  audioContext = new AudioContext();
  const dest = audioContext.createMediaStreamDestination();

  if (systemTracks.length > 0) {
    const sysGain = audioContext.createGain();
    audioContext.createMediaStreamSource(new MediaStream(systemTracks)).connect(sysGain);
    sysGain.connect(dest);
  }
  if (micTracks.length > 0) {
    micGain = audioContext.createGain();
    audioContext.createMediaStreamSource(new MediaStream(micTracks)).connect(micGain);
    micGain.connect(dest);
  }
  return dest.stream.getAudioTracks()[0];
}

async function beginRecording(payload: BeginPayload): Promise<void> {
  setStatus('Starting…');
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch {
    setStatus('Screen capture denied');
    window.bridge.send('rec:stopped');
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    micStream = null;
  }
  hasMic = !!micStream && micStream.getAudioTracks().length > 0;
  micBtn.classList.toggle('disabled', !hasMic);

  const screenTrack = displayStream.getVideoTracks()[0];
  // If the user revokes the share via the OS, stop cleanly.
  screenTrack.addEventListener('ended', () => stopRecording());

  let videoTrack: MediaStreamTrack;
  if (payload.mode === 'area' && payload.crop) {
    videoTrack = await buildCroppedTrack(screenTrack, payload.crop);
  } else {
    videoTrack = screenTrack;
  }

  const audioTrack = buildMixedAudio();
  const tracks: MediaStreamTrack[] = [videoTrack];
  if (audioTrack) tracks.push(audioTrack);

  await window.bridge.invoke('rec:recorder-open');
  startRecorder(new MediaStream(tracks));
}

function startRecorder(stream: MediaStream): void {
  const mime = pickMimeType();
  recordedExt = mime.includes('mp4') ? 'mp4' : 'webm';

  const options: MediaRecorderOptions = { videoBitsPerSecond: 8_000_000 };
  if (mime) options.mimeType = mime;
  recorder = new MediaRecorder(stream, options);

  chunkQueue = Promise.resolve();
  recorder.ondataavailable = (event) => {
    if (!event.data || event.data.size === 0) return;
    chunkQueue = chunkQueue.then(async () => {
      const buffer = await event.data.arrayBuffer();
      await window.bridge.invoke('rec:chunk', { buffer });
    });
  };
  recorder.onstop = finalizeRecording;
  recorder.start(1000); // emit a chunk every second

  micMuted = false;
  cameraOn = true;
  updateButtons();
  setState('recording');
  setStatus(`Recording · ${recordedExt.toUpperCase()}`);
  startTimer();
}

async function finalizeRecording(): Promise<void> {
  stopTimer();
  await chunkQueue;
  setStatus('Saving…');
  const result = await window.bridge.invoke<{ saved: boolean; path?: string }>('rec:finalize', {
    ext: recordedExt,
  });
  cleanupStreams();
  window.bridge.send('rec:stopped');
  setState('idle');
  setStatus(result?.saved ? 'Saved ✓' : 'Discarded');
}

function cleanupStreams(): void {
  if (cropRAF) cancelAnimationFrame(cropRAF);
  cropRAF = 0;
  displayStream?.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  cropStream?.getTracks().forEach((t) => t.stop());
  cropVideo?.pause();
  audioContext?.close().catch(() => undefined);
  displayStream = null;
  micStream = null;
  cropStream = null;
  cropVideo = null;
  audioContext = null;
  micGain = null;
  recorder = null;
}

// --- controls ---------------------------------------------------------------

function stopRecording(): void {
  if (!recorder || state === 'idle') return;
  if (recorder.state !== 'inactive') recorder.stop();
}

function togglePause(): void {
  if (!recorder) return;
  if (recorder.state === 'recording') {
    recorder.pause();
    stopTimer();
    setState('paused');
    setStatus('Paused');
    window.bridge.send('rec:paused', true);
  } else if (recorder.state === 'paused') {
    recorder.resume();
    timerId = setInterval(() => {
      elapsed += 1;
      timerEl.textContent = formatTime(elapsed);
    }, 1000);
    setState('recording');
    setStatus(`Recording · ${recordedExt.toUpperCase()}`);
    window.bridge.send('rec:paused', false);
  }
}

function toggleMic(): void {
  if (!hasMic) return;
  micMuted = !micMuted;
  if (micGain) micGain.gain.value = micMuted ? 0 : 1;
  updateButtons();
}

function toggleCamera(): void {
  cameraOn = !cameraOn;
  window.bridge.send('rec:camera-visibility', cameraOn);
  updateButtons();
}

function updateButtons(): void {
  micBtn.classList.toggle('active', micMuted);
  micBtn.querySelector('.lbl').textContent = micMuted ? 'Muted' : 'Mute';
  camBtn.classList.toggle('active', !cameraOn);
  camBtn.querySelector('.lbl').textContent = cameraOn ? 'Camera' : 'Cam Off';
}

function handleShortcut(action: ShortcutAction): void {
  if (action === 'stop') stopRecording();
  else if (action === 'pause') togglePause();
  else if (action === 'mute') toggleMic();
  else if (action === 'camera') toggleCamera();
}

// --- wiring -----------------------------------------------------------------

recordBtn.addEventListener('click', () => {
  setStatus('Choose a source…');
  window.bridge.send('rec:request-record');
});
stopBtn.addEventListener('click', () => stopRecording());
pauseBtn.addEventListener('click', () => togglePause());
micBtn.addEventListener('click', () => toggleMic());
camBtn.addEventListener('click', () => toggleCamera());

window.bridge.on('rec:begin', (payload) => {
  beginRecording(payload as BeginPayload).catch(() => {
    setStatus('Failed to start');
    window.bridge.send('rec:stopped');
  });
});
window.bridge.on('shortcut', (action) => handleShortcut(action as ShortcutAction));

setState('idle');
