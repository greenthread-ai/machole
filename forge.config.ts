import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerPKG } from '@electron-forge/maker-pkg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Machole has two macOS distribution paths, both driven by environment
// variables so local `npm run dev` / `npm run build` stay unsigned:
//
//  1. Developer ID (.dmg, notarized) — set APPLE_SIGNING_IDENTITY. Used by
//     the Release workflow.
//  2. Mac App Store (.pkg, sandboxed) — set APPLE_MAS_IDENTITY. Used by the
//     App Store workflow, built with `--platform=mas`.
//
// MAS mode takes precedence when both happen to be set.
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const notarizeApiKey = process.env.APPLE_API_KEY_PATH;

// Mac App Store credentials.
const masIdentity = process.env.APPLE_MAS_IDENTITY;
const masInstallerIdentity = process.env.APPLE_MAS_INSTALLER_IDENTITY;
const masProvisioningProfile = process.env.APPLE_PROVISIONING_PROFILE;
const isMas = Boolean(masIdentity);

const isSigning = Boolean(signingIdentity) && !isMas;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'ai.greenthread.machole',
    // Required for App Store listings; harmless for other builds.
    appCategoryType: 'public.app-category.productivity',
    // macOS picks up build/icon.icns; regenerate with `npm run icon`.
    icon: 'build/icon',
    // CFBundleVersion. CI sets this to a unique, increasing build number so
    // App Store Connect never rejects a re-upload as a duplicate; locally it
    // falls back to the app version from package.json.
    buildVersion: process.env.MACHOLE_BUILD_VERSION || undefined,
    // macOS shows these strings in the camera/microphone permission prompts.
    extendInfo: {
      NSCameraUsageDescription:
        'Machole displays your camera feed in the on-screen overlay.',
      NSMicrophoneUsageDescription:
        'Machole records your microphone and drives the audio pulse animation.',
      // Pre-answer App Store Connect's encryption questionnaire. Machole uses
      // only standard encryption included in macOS (HTTPS / TLS), which is
      // exempt under U.S. EAR Category 5, Part 2 §740.17(b)(1).
      ITSAppUsesNonExemptEncryption: false,
      // Run as a menu bar (agent) app: no Dock icon, lives in the menu bar
      // extra. Machole's standard macOS presence is the Tray created in
      // main.ts — required for App Store Guideline 4.
      LSUIElement: true,
    },
    // The menu bar template icon is loaded at runtime via process.resourcesPath
    // (see main.ts); ship both the 1x and @2x variants.
    extraResource: ['build/trayTemplate.png', 'build/trayTemplate@2x.png'],
    osxSign: isMas
      ? {
          identity: masIdentity,
          provisioningProfile: masProvisioningProfile,
          // The main .app gets the sandbox + device entitlements; helper and
          // child bundles inherit the sandbox.
          optionsForFile: (filePath: string) => ({
            entitlements:
              filePath.endsWith('.app') && !filePath.includes('Helper')
                ? 'build/entitlements.mas.plist'
                : 'build/entitlements.mas.inherit.plist',
          }),
        }
      : isSigning
        ? {
            identity: signingIdentity,
            optionsForFile: () => ({
              entitlements: 'build/entitlements.plist',
            }),
          }
        : undefined,
    // App Store builds are reviewed by Apple, not notarized.
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
  // App Store builds produce a single signed installer .pkg; every other
  // build keeps the existing .dmg / .zip / Windows / Linux makers.
  makers: isMas
    ? [new MakerPKG({ identity: masInstallerIdentity })]
    : [
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
        {
          // Generic IPC bridge shared by the recording windows.
          entry: 'src/overlay-preload.ts',
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
