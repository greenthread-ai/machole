import './index.css';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
// IMPORTANT: do NOT `import '@mediapipe/...'` here. Those packages are UMD
// scripts that only register their constructors on `window` when loaded via
// a <script> tag — Vite's ESM bundling does not run that side-effect in
// production, which is why Background Blur / Auto-Frame silently fail in
// the App Store build. Instead we load the files copied next to the page
// (see vite-plugin-static-copy in vite.renderer.config.ts) at runtime.

function loadMediaPipeScript(globalName: string, dir: string, file: string): Promise<void> {
  if ((window as unknown as Record<string, unknown>)[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(`mediapipe/${dir}/${file}`, document.baseURI).href;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${file}`));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    machole: {
      quitApp: () => void;
      sendCameraList: (devices: { id: string; label: string }[]) => void;
      setActiveCamera: (deviceId: string) => void;
      onToggleBlur: (callback: (enabled: boolean) => void) => void;
      onToggleAutoframe: (callback: (enabled: boolean) => void) => void;
      onToggleCloseup: (callback: (enabled: boolean) => void) => void;
      onTogglePulse: (callback: (enabled: boolean) => void) => void;
      onSetTheme: (callback: (colors: string[]) => void) => void;
      onSetSize: (callback: (size: number) => void) => void;
      onSetCamera: (callback: (deviceId: string) => void) => void;
      onRequestCameraList: (callback: () => void) => void;
      onRecordingState: (callback: (active: boolean) => void) => void;
    };
  }
  // `requestVideoFrameCallback` ships in current Chromium but isn't in the
  // older lib.dom.d.ts this project's TypeScript version uses.
  interface HTMLVideoElement {
    requestVideoFrameCallback(callback: (now: DOMHighResTimeStamp) => void): number;
  }
}

let blurEnabled = true;
let autoframeEnabled = true;
let closeupEnabled = false;
let pulseEnabled = true;
// Set by `recording-main` while a recording is live. The render loop uses
// this to halve its MediaPipe inference rate so it doesn't starve the screen
// capture pipeline of GPU cycles. Viewers can't perceive the difference —
// the screen recorder is capturing the bubble at its own framerate anyway.
let recordingActive = false;

window.machole.onToggleBlur((enabled) => { blurEnabled = enabled; });
window.machole.onToggleAutoframe((enabled) => { autoframeEnabled = enabled; });
window.machole.onToggleCloseup((enabled) => { closeupEnabled = enabled; });
window.machole.onTogglePulse((enabled) => { pulseEnabled = enabled; });
window.machole.onRecordingState((active) => { recordingActive = active; });

const overlay = document.querySelector('.overlay') as HTMLElement;

// Frequency visualizer canvas
const vizCanvas = document.getElementById('visualizer') as HTMLCanvasElement;
const vizCtx = vizCanvas.getContext('2d');
let themeColors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b'];
let freqData: Uint8Array | null = null;

function sizeVisualizer(size: number) {
  const vizSize = size + 40; // extend beyond overlay ring
  vizCanvas.width = vizSize * 2;  // 2x for retina
  vizCanvas.height = vizSize * 2;
  vizCanvas.style.width = `${vizSize}px`;
  vizCanvas.style.height = `${vizSize}px`;
}

// Theme handler — update ring gradient and store colors for visualizer
window.machole.onSetTheme((colors) => {
  const gradient = `conic-gradient(from var(--angle, 0deg), ${colors.join(', ')})`;
  overlay.style.background = gradient;
  themeColors = colors;
});

// Size handler
window.machole.onSetSize((size) => {
  currentSize = size;
  document.documentElement.style.setProperty('--size', `${size}px`);
  sizeVisualizer(size);
});

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.getElementById('output') as HTMLCanvasElement;

// Offscreen canvas for intermediate rendering (blur then crop)
const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d');

// Smooth crop state
const currentCrop = { x: 0, y: 0, size: 0 };
let cropInitialized = false;
const LERP_FACTOR = 0.08;
const FACE_PADDING_NORMAL = 3.5;
const FACE_PADDING_CLOSEUP = 2.0;

// Audio pulse state
let smoothVolume = 0;
let analyser: AnalyserNode | null = null;
let analyserData: Uint8Array | null = null;
let currentSize = 200;
let audioStream: MediaStream | null = null;

function drawFrequencyBars() {
  const w = vizCanvas.width;
  const h = vizCanvas.height;
  vizCtx.clearRect(0, 0, w, h);

  if (!freqData) return;

  const cx = w / 2;
  const cy = h / 2;
  // Ring radius in canvas pixels (2x retina)
  const ringRadius = (currentSize / 2) * 2;
  const barCount = 80;
  const barWidth = 2;  // thin bars in canvas pixels
  const maxBarHeight = 20 * 2; // max extension outward (retina)

  vizCtx.save();

  for (let i = 0; i < barCount; i++) {
    // Map bar index to lower frequency range (voice/office audio sits here)
    const binIndex = Math.floor((i / barCount) * (freqData.length * 0.35)) + 2;
    const magnitude = freqData[binIndex] / 255;

    if (magnitude < 0.05) continue; // skip silent bars

    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const barHeight = magnitude * maxBarHeight;

    // Color from theme via angle position
    const colorIndex = (i / barCount) * (themeColors.length - 1);
    const ci = Math.floor(colorIndex);
    const color = themeColors[Math.min(ci, themeColors.length - 1)];

    const startR = ringRadius + 4; // small gap from ring edge
    const endR = startR + barHeight;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    vizCtx.beginPath();
    vizCtx.moveTo(cx + cosA * startR, cy + sinA * startR);
    vizCtx.lineTo(cx + cosA * endR, cy + sinA * endR);
    vizCtx.strokeStyle = color;
    vizCtx.lineWidth = barWidth;
    vizCtx.lineCap = 'round';
    vizCtx.shadowColor = color;
    vizCtx.shadowBlur = 8;
    vizCtx.globalAlpha = 0.6 + magnitude * 0.4;
    vizCtx.stroke();
  }

  vizCtx.restore();
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getVolume(): number {
  if (!analyser || !analyserData) return 0;
  analyser.getByteTimeDomainData(analyserData);
  let sum = 0;
  for (let i = 0; i < analyserData.length; i++) {
    const val = (analyserData[i] - 128) / 128;
    sum += val * val;
  }
  return Math.sqrt(sum / analyserData.length);
}

let selectedCameraId = '';

async function getCameraDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

// Resolve once the <video> actually has frame dimensions, or reject after a
// timeout. Some virtual and Continuity (iPhone) cameras connect but never
// deliver frames; without this guard they feed the WebGL models a zero-size
// texture and spam GL_INVALID_FRAMEBUFFER_OPERATION errors.
function waitForVideoReady(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
      } else if (performance.now() - start > timeoutMs) {
        reject(new Error('Camera produced no video frames'));
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
  });
}

async function startCamera(deviceId?: string): Promise<MediaStream> {
  // Stop existing video tracks
  if (video.srcObject instanceof MediaStream) {
    video.srcObject.getVideoTracks().forEach((t) => t.stop());
  }

  const videoConstraint = deviceId ? { deviceId: { exact: deviceId } } : true;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraint,
  });
  video.srcObject = stream;
  await video.play();

  // getUserMedia / play() can resolve before a device actually streams.
  // Reject here so startCameraWithFallback can move on to another camera.
  try {
    await waitForVideoReady();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }

  const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (activeId) {
    selectedCameraId = activeId;
    window.machole.setActiveCamera(activeId);
  }
  return stream;
}

async function startCameraWithFallback(deviceId?: string): Promise<void> {
  if (!deviceId) {
    await startCamera();
    return;
  }

  try {
    await startCamera(deviceId);
  } catch {
    const cameras = await getCameraDevices();
    for (const camera of cameras) {
      if (!camera.deviceId || camera.deviceId === deviceId) {
        continue;
      }
      try {
        await startCamera(camera.deviceId);
        return;
      } catch {
        // Try next camera.
      }
    }
    await startCamera();
  }
}

async function setupAudioAnalyser() {
  if (audioStream instanceof MediaStream) {
    audioStream.getAudioTracks().forEach((t) => t.stop());
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserData = new Uint8Array(analyser.fftSize);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  } catch {
    // Mic access is optional; pulse will be disabled when unavailable.
    analyser = null;
    analyserData = null;
    freqData = null;
  }
}

function updateVideoDimensions() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const canvasSize = Math.min(vw, vh);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  offscreen.width = vw;
  offscreen.height = vh;
  currentCrop.size = Math.min(vw, vh);
  currentCrop.x = (vw - currentCrop.size) / 2;
  currentCrop.y = (vh - currentCrop.size) / 2;
  cropInitialized = false;
}

async function enumerateAndSendCameras() {
  const cameras = (await getCameraDevices())
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  window.machole.sendCameraList(cameras);
}

window.machole.onRequestCameraList(() => {
  enumerateAndSendCameras().catch((err) => console.error('Failed to refresh cameras:', err));
});

// Camera switch handler
window.machole.onSetCamera((deviceId) => {
  if (deviceId && deviceId !== selectedCameraId) {
    selectedCameraId = deviceId;
    startCameraWithFallback(deviceId)
      .then(() => updateVideoDimensions())
      .catch((err) => console.error('Failed to switch camera:', err));
  }
});

async function init() {
  await enumerateAndSendCameras();

  try {
    await startCameraWithFallback(selectedCameraId || undefined);
  } catch (err) {
    // No camera could deliver frames. The render loop still starts below
    // and recovers automatically once a working camera is selected.
    console.error('No working camera available:', err);
  }

  // Enumerate again after permission so labels are available
  await enumerateAndSendCameras();

  // Hide loader as soon as camera is live
  document.getElementById('loader').classList.add('hidden');

  // Set up optional audio analyser for pulse effect
  await setupAudioAnalyser();

  let segmenter: bodySegmentation.BodySegmenter | null = null;
  let detector: faceDetection.FaceDetector | null = null;

  try {
    await loadMediaPipeScript(
      'SelfieSegmentation',
      'selfie_segmentation',
      'selfie_segmentation.js',
    );
    segmenter = await bodySegmentation.createSegmenter(
      bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
      {
        runtime: 'mediapipe',
        modelType: 'landscape',
        solutionPath: new URL('mediapipe/selfie_segmentation', document.baseURI).href,
      },
    );
  } catch (err) {
    console.error('Background Blur disabled — segmenter failed to load:', err);
    blurEnabled = false;
  }

  try {
    await loadMediaPipeScript('FaceDetection', 'face_detection', 'face_detection.js');
    detector = await faceDetection.createDetector(
      faceDetection.SupportedModels.MediaPipeFaceDetector,
      {
        runtime: 'mediapipe',
        solutionPath: new URL('mediapipe/face_detection', document.baseURI).href,
      },
    );
  } catch (err) {
    console.error('Auto-Frame / Close-Up disabled — face detector failed to load:', err);
    autoframeEnabled = false;
  }

  const root = document.documentElement;

  // Initialize visualizer size
  sizeVisualizer(currentSize);

  async function renderFrame() {
    // Skip processing until the camera is actually delivering frames —
    // feeding a zero-size video to the WebGL models throws framebuffer
    // errors. Reading the size each frame also lets the overlay recover
    // when the camera is swapped.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0 || video.readyState < 2) {
      // No frame yet — onVideoFrame will retry on the next rVFC tick.
      return;
    }
    if (offscreen.width !== vw || offscreen.height !== vh) {
      updateVideoDimensions();
    }

    // Audio pulse — frequency bars + subtle ring breath
    if (pulseEnabled && analyser && freqData) {
      const rawVolume = getVolume();
      const factor = rawVolume > smoothVolume ? 0.3 : 0.05;
      smoothVolume = lerp(smoothVolume, rawVolume, factor);
      const normalizedVolume = clamp(smoothVolume * 5, 0, 1);
      // Subtle ring breath (up to 2px)
      const pulse = normalizedVolume * 2;
      root.style.setProperty('--pulse', `${pulse}px`);

      // Draw frequency bars
      analyser.getByteFrequencyData(freqData);
      drawFrequencyBars();
    } else {
      smoothVolume = 0;
      root.style.setProperty('--pulse', '0px');
      vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
    }

    // Step 1: Render to offscreen canvas (with or without blur)
    if (blurEnabled && segmenter) {
      const segmentation = await segmenter.segmentPeople(video);
      await bodySegmentation.drawBokehEffect(
        offscreen,
        video,
        segmentation,
        0.6,  // foregroundThreshold
        7,    // backgroundBlurAmount
        3,    // edgeBlurAmount
        true, // flipHorizontal
      );
    } else {
      offCtx.save();
      offCtx.translate(vw, 0);
      offCtx.scale(-1, 1);
      offCtx.drawImage(video, 0, 0, vw, vh);
      offCtx.restore();
    }

    // Step 2: Auto-frame (detect face, compute crop, draw cropped region)
    if (autoframeEnabled && detector) {
      const faces = await detector.estimateFaces(video);

      if (faces.length > 0) {
        const box = faces[0].box;
        const faceCenterX = vw - (box.xMin + box.width / 2);
        const faceCenterY = box.yMin + box.height / 2;
        const faceSize = Math.max(box.width, box.height);

        const padding = closeupEnabled ? FACE_PADDING_CLOSEUP : FACE_PADDING_NORMAL;
        const targetSize = clamp(faceSize * padding, 100, Math.min(vw, vh));
        const targetX = clamp(faceCenterX - targetSize / 2, 0, vw - targetSize);
        // Offset crop downward so eyes land near upper third
        const targetY = clamp(faceCenterY - targetSize / 2 + targetSize * 0.38, 0, vh - targetSize);

        if (!cropInitialized) {
          currentCrop.x = targetX;
          currentCrop.y = targetY;
          currentCrop.size = targetSize;
          cropInitialized = true;
        } else {
          currentCrop.x = lerp(currentCrop.x, targetX, LERP_FACTOR);
          currentCrop.y = lerp(currentCrop.y, targetY, LERP_FACTOR);
          currentCrop.size = lerp(currentCrop.size, targetSize, LERP_FACTOR);
        }
      }

      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        offscreen,
        currentCrop.x, currentCrop.y, currentCrop.size, currentCrop.size,
        0, 0, canvas.width, canvas.height,
      );
    } else {
      const ctx = canvas.getContext('2d');
      // Center-crop the video to a square
      const squareSize = Math.min(vw, vh);
      const srcX = (vw - squareSize) / 2;
      const srcY = (vh - squareSize) / 2;
      ctx.drawImage(offscreen, srcX, srcY, squareSize, squareSize, 0, 0, squareSize, squareSize);
    }

  }

  // Drive the render loop off actual camera frames via `requestVideoFrameCallback`
  // rather than the display refresh rate. rVFC fires once per delivered camera
  // frame, so the heavy MediaPipe inferences run ~30/sec instead of 60–120/sec
  // — matching the camera's real framerate, not the monitor's.
  let frameCount = 0;
  function onVideoFrame() {
    frameCount += 1;
    // While recording, process every other frame (~15 fps). The screen
    // recorder captures the bubble at its own framerate, so viewers can't
    // perceive a faster cadence anyway — but at full rate the ML inferences
    // contend with the screen capture pipeline and the encoder drops frames.
    if (recordingActive && frameCount % 2 === 1) {
      video.requestVideoFrameCallback(onVideoFrame);
      return;
    }
    void renderFrame().finally(() => {
      video.requestVideoFrameCallback(onVideoFrame);
    });
  }
  video.requestVideoFrameCallback(onVideoFrame);
}

init().catch((err) => {
  console.error('Failed to initialize:', err);
  document.getElementById('loader').classList.add('hidden');
});

document.addEventListener('click', (event) => {
  if (event.shiftKey) {
    window.machole.quitApp();
  }
});
