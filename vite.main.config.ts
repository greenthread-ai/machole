import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // True for any properly signed distribution build — either Developer ID
    // (.dmg release) or Mac App Store (.pkg). Unsigned dev runs and ad-hoc
    // local installs build this as false.
    MACHOLE_SIGNED: JSON.stringify(
      Boolean(process.env.APPLE_SIGNING_IDENTITY || process.env.APPLE_MAS_IDENTITY),
    ),
  },
});
