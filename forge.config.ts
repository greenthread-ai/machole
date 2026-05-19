import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Code signing + notarization only run when the Apple credentials are present
// in the environment (i.e. in CI on a published release). Local `npm start`
// and `npm run package` have no credentials and stay unsigned.
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const notarizeApiKey = process.env.APPLE_API_KEY_PATH;
const isSigning = Boolean(signingIdentity);

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'ai.greenthread.machole',
    // macOS shows these strings in the camera/microphone permission prompts.
    extendInfo: {
      NSCameraUsageDescription:
        'Machole displays your camera feed in the on-screen overlay.',
      NSMicrophoneUsageDescription:
        'Machole uses your microphone to drive the audio pulse animation.',
    },
    osxSign: isSigning
      ? {
          identity: signingIdentity,
          optionsForFile: () => ({
            entitlements: 'build/entitlements.plist',
          }),
        }
      : undefined,
    osxNotarize:
      isSigning && notarizeApiKey
        ? {
            appleApiKey: notarizeApiKey,
            appleApiKeyId: process.env.APPLE_API_KEY_ID as string,
            appleApiIssuer: process.env.APPLE_API_ISSUER_ID as string,
          }
        : undefined,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
