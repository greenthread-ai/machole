import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // True only when the build was code-signed with a real Developer ID
    // (APPLE_SIGNING_IDENTITY is set, as in CI releases). Unsigned dev runs
    // and ad-hoc local installs build this as false.
    MACHOLE_SIGNED: JSON.stringify(Boolean(process.env.APPLE_SIGNING_IDENTITY)),
  },
});
