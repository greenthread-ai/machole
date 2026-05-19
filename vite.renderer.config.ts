import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// https://vitejs.dev/config
// Machole's renderer is a multi-page app: the camera overlay plus the
// recording windows (controls, source picker, countdown, area selector).
// Each HTML file is its own entry; Vite keeps their paths so the main
// process can `loadFile` them individually in production.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        controls: resolve(__dirname, 'controls.html'),
        picker: resolve(__dirname, 'picker.html'),
        countdown: resolve(__dirname, 'countdown.html'),
        area: resolve(__dirname, 'area.html'),
      },
    },
  },
});
