import { defineConfig, Plugin } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

// MediaPipe ships UMD scripts that only register `window.SelfieSegmentation`
// / `window.FaceDetection` when loaded via a <script> tag. Vite's ESM bundling
// does NOT run that side-effect in production, so Background Blur / Auto-Frame
// silently fail. This tiny plugin keeps the MediaPipe packages out of the JS
// bundle entirely and serves them as plain static files instead — both via
// Vite's dev server middleware and by copying them into the build output.
function mediapipeAssets(): Plugin {
  const root = resolve(__dirname);
  const SOURCES: Record<string, string> = {
    selfie_segmentation: join(root, 'node_modules/@mediapipe/selfie_segmentation'),
    face_detection: join(root, 'node_modules/@mediapipe/face_detection'),
  };
  const CONTENT_TYPE: Record<string, string> = {
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.binarypb': 'application/octet-stream',
    '.tflite': 'application/octet-stream',
    '.data': 'application/octet-stream',
  };
  function copyDir(src: string, dest: string) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const s = join(src, entry.name);
      const d = join(dest, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else if (entry.isFile()) copyFileSync(s, d);
    }
  }
  return {
    name: 'mediapipe-static-assets',
    configureServer(server) {
      // Dev: serve /mediapipe/<dir>/<file> straight from node_modules.
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/mediapipe\/([^/]+)\/(.+)$/);
        if (!match) return next();
        const [, dir, rest] = match;
        const base = SOURCES[dir];
        if (!base) return next();
        const filePath = join(base, rest);
        if (!existsSync(filePath)) return next();
        res.setHeader('Content-Type', CONTENT_TYPE[extname(filePath)] ?? 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
    writeBundle(options) {
      // Build: copy the whole MediaPipe dirs next to the built HTML.
      const outDir = options.dir;
      if (!outDir) return;
      for (const [dir, src] of Object.entries(SOURCES)) {
        copyDir(src, join(outDir, 'mediapipe', dir));
      }
    },
  };
}

// https://vitejs.dev/config
// Machole's renderer is a multi-page app: the camera overlay plus the
// recording windows (controls, source picker, countdown, area selector).
// Each HTML file is its own entry; Vite keeps their paths so the main
// process can `loadFile` them individually in production.
export default defineConfig({
  plugins: [mediapipeAssets()],
  resolve: {
    // body-segmentation / face-detection themselves do
    // `import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'`.
    // The MediaPipe package only registers that constructor on `window` when
    // its file runs as a <script> tag (see mediapipeAssets() above) — when
    // Rollup bundles it as ESM the named export is undefined. Redirect those
    // imports to thin shims that defer to `window.SelfieSegmentation` /
    // `window.FaceDetection` at construct time.
    alias: {
      '@mediapipe/selfie_segmentation': resolve(__dirname, 'src/shims/selfie_segmentation.ts'),
      '@mediapipe/face_detection': resolve(__dirname, 'src/shims/face_detection.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        permissions: resolve(__dirname, 'permissions.html'),
        controls: resolve(__dirname, 'controls.html'),
        picker: resolve(__dirname, 'picker.html'),
        countdown: resolve(__dirname, 'countdown.html'),
        area: resolve(__dirname, 'area.html'),
        frame: resolve(__dirname, 'frame.html'),
        compressing: resolve(__dirname, 'compressing.html'),
      },
    },
  },
});
