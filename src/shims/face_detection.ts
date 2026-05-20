// Shim that Vite resolves `@mediapipe/face_detection` to. See
// `selfie_segmentation.ts` for the rationale.

type MediaPipeCtor = new (options: unknown) => object;

declare global {
  interface Window {
    FaceDetection?: MediaPipeCtor;
  }
}

const FaceDetection = function FaceDetection(this: unknown, options: unknown): object {
  const Real = window.FaceDetection;
  if (!Real) {
    throw new Error(
      'window.FaceDetection is not loaded — ensure face_detection.js is injected before constructing the detector.',
    );
  }
  return new Real(options);
} as unknown as MediaPipeCtor;

export { FaceDetection };
