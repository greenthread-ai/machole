// Shim that Vite resolves `@mediapipe/selfie_segmentation` to. The real
// MediaPipe package is a UMD whose constructor is only registered on
// `window.SelfieSegmentation` when loaded via a <script> tag; ESM bundling
// runs the file in module scope and never sets the global. The body-
// segmentation library does `import { SelfieSegmentation } from '@mediapipe
// /selfie_segmentation'` itself, so we redirect that import to this shim and
// hand it a constructor that defers to the live `window.SelfieSegmentation`.

type MediaPipeCtor = new (options: unknown) => object;

declare global {
  interface Window {
    SelfieSegmentation?: MediaPipeCtor;
  }
}

const SelfieSegmentation = function SelfieSegmentation(
  this: unknown,
  options: unknown,
): object {
  const Real = window.SelfieSegmentation;
  if (!Real) {
    throw new Error(
      'window.SelfieSegmentation is not loaded — ensure selfie_segmentation.js is injected before constructing the segmenter.',
    );
  }
  return new Real(options);
} as unknown as MediaPipeCtor;

export { SelfieSegmentation };
