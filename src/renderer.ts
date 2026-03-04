import './index.css';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@mediapipe/selfie_segmentation';
import '@mediapipe/face_detection';

declare global {
  interface Window {
    machole: {
      quitApp: () => void;
      onToggleBlur: (callback: (enabled: boolean) => void) => void;
      onToggleAutoframe: (callback: (enabled: boolean) => void) => void;
      onToggleCloseup: (callback: (enabled: boolean) => void) => void;
      onTogglePulse: (callback: (enabled: boolean) => void) => void;
      onSetTheme: (callback: (colors: string[]) => void) => void;
      onSetSize: (callback: (size: number) => void) => void;
    };
  }
}

let blurEnabled = true;
let autoframeEnabled = true;
let closeupEnabled = false;
let pulseEnabled = true;

window.machole.onToggleBlur((enabled) => { blurEnabled = enabled; });
window.machole.onToggleAutoframe((enabled) => { autoframeEnabled = enabled; });
window.machole.onToggleCloseup((enabled) => { closeupEnabled = enabled; });
window.machole.onTogglePulse((enabled) => { pulseEnabled = enabled; });

const overlay = document.querySelector('.overlay') as HTMLElement;

// Theme handler — update ring gradient and petal colors
window.machole.onSetTheme((colors) => {
  const gradient = `conic-gradient(from var(--angle, 0deg), ${colors.join(', ')})`;
  overlay.style.background = gradient;
  const len = colors.length;
  const root = document.documentElement;
  root.style.setProperty('--petal-color-1', colors[0]);
  root.style.setProperty('--petal-color-2', colors[Math.floor(len / 3)]);
  root.style.setProperty('--petal-color-3', colors[Math.min(Math.floor(len * 2 / 3), len - 1)]);
});

// Size handler
window.machole.onSetSize((size) => {
  document.documentElement.style.setProperty('--size', `${size}px`);
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

async function init() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = stream;
  await video.play();

  // Set up audio analyser
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyserData = new Uint8Array(analyser.fftSize);

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  const canvasSize = Math.min(vw, vh);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  offscreen.width = vw;
  offscreen.height = vh;

  // Initialize crop to full frame
  currentCrop.size = Math.min(vw, vh);
  currentCrop.x = (vw - currentCrop.size) / 2;
  currentCrop.y = (vh - currentCrop.size) / 2;

  const segmenter = await bodySegmentation.createSegmenter(
    bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
    {
      runtime: 'mediapipe',
      modelType: 'landscape',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
    },
  );

  const detector = await faceDetection.createDetector(
    faceDetection.SupportedModels.MediaPipeFaceDetector,
    {
      runtime: 'mediapipe',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection',
    },
  );

  // Hide loader once everything is ready
  document.getElementById('loader').classList.add('hidden');

  const root = document.documentElement;
  const petals = document.querySelectorAll('.petal') as NodeListOf<HTMLElement>;

  async function renderFrame() {
    // Audio pulse — glow petals + subtle ring breath
    if (pulseEnabled) {
      const rawVolume = getVolume();
      const factor = rawVolume > smoothVolume ? 0.3 : 0.05;
      smoothVolume = lerp(smoothVolume, rawVolume, factor);
      const normalizedVolume = clamp(smoothVolume * 5, 0, 1);
      // Subtle ring breath (up to 4px)
      const pulse = normalizedVolume * 4;
      root.style.setProperty('--pulse', `${pulse}px`);
      // Glow petals fade in with volume
      const petalOpacity = String(normalizedVolume * 0.85);
      petals.forEach(p => { p.style.opacity = petalOpacity; });
    } else {
      smoothVolume = 0;
      root.style.setProperty('--pulse', '0px');
      petals.forEach(p => { p.style.opacity = '0'; });
    }

    // Step 1: Render to offscreen canvas (with or without blur)
    if (blurEnabled) {
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
    if (autoframeEnabled) {
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
      const srcX = (vw - canvasSize) / 2;
      const srcY = (vh - canvasSize) / 2;
      ctx.drawImage(offscreen, srcX, srcY, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize);
    }

    requestAnimationFrame(renderFrame);
  }

  renderFrame();
}

init().catch((err) => console.error('Failed to initialize:', err));

document.addEventListener('click', (event) => {
  if (event.shiftKey) {
    window.machole.quitApp();
  }
});
