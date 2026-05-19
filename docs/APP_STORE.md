# Releasing Machole to the Mac App Store

Machole has two macOS distribution paths:

- **Direct download** — a notarized `.dmg` signed with a *Developer ID*
  certificate. See [`RELEASING.md`](./RELEASING.md).
- **Mac App Store** — a sandboxed, App-Store-signed `.pkg` built with the
  `mas` Electron variant and uploaded to App Store Connect. That is what this
  document covers.

The App Store build is produced by the
[`appstore.yml`](../.github/workflows/appstore.yml) workflow. It is **manual**
— run it from **Actions → App Store → Run workflow** — because App Store
submissions are deliberate.

---

## How it differs from the Developer ID build

| | Developer ID (`.dmg`) | App Store (`.pkg`) |
|---|---|---|
| Electron variant | `darwin` | `mas` |
| Sandbox | no | **yes** (`com.apple.security.app-sandbox`) |
| Signing cert | Developer ID Application | Apple Distribution (or 3rd Party Mac Developer Application) |
| Installer cert | — | 3rd Party Mac Developer Installer |
| Provisioning profile | — | required, embedded in the app |
| Apple check | notarization | App Store review |
| `forge.config.ts` trigger | `APPLE_SIGNING_IDENTITY` | `APPLE_MAS_IDENTITY` |

Entitlements live in [`build/entitlements.mas.plist`](../build/entitlements.mas.plist)
(main app) and [`build/entitlements.mas.inherit.plist`](../build/entitlements.mas.inherit.plist)
(helper / child processes).

---

## 1. Prerequisites

- An **Apple Developer Program** membership.
- An **app record** for bundle id `ai.greenthread.machole` created in
  [App Store Connect](https://appstoreconnect.apple.com/) (My Apps → +).
- Admin access to the GitHub repository (to add secrets).

---

## 2. Certificates

Create both certificates at
<https://developer.apple.com/account/resources/certificates> (or via Xcode →
Settings → Accounts → Manage Certificates):

1. **Apple Distribution** — signs the `.app`.
   (An older **3rd Party Mac Developer Application** cert also works.)
2. **Mac Installer Distribution** — signs the `.pkg`. Its common name is
   `3rd Party Mac Developer Installer: …`.

Export **both** from Keychain Access (My Certificates → select both →
Export…) into a single `mas-cert.p12` with a password.

Record the exact common names — they become `APPLE_MAS_IDENTITY` and
`APPLE_MAS_INSTALLER_IDENTITY`.

## 3. Provisioning profile

At <https://developer.apple.com/account/resources/profiles>, create a
**Mac App Store** distribution profile for the `ai.greenthread.machole` App ID
and download the `.provisionprofile`.

## 4. App Store Connect API key

Used to upload the build. The same key as the Developer ID pipeline can be
reused — see step 3 of [`RELEASING.md`](./RELEASING.md). You need the `.p8`,
its Key ID, and the Issuer ID.

---

## 5. GitHub repository secrets

**Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `MACOS_MAS_CERT_P12_BASE64` | base64 of `mas-cert.p12` (both certs) |
| `MACOS_MAS_CERT_PASSWORD` | password for that `.p12` |
| `APPLE_MAS_IDENTITY` | e.g. `Apple Distribution: Acme Inc (AB12CD34EF)` |
| `APPLE_MAS_INSTALLER_IDENTITY` | e.g. `3rd Party Mac Developer Installer: Acme Inc (AB12CD34EF)` |
| `APPLE_TEAM_ID` | your 10-character Team ID |
| `APPLE_PROVISIONING_PROFILE_BASE64` | base64 of the `.provisionprofile` |
| `APPLE_API_KEY_P8` | base64 of the API key `.p8` |
| `APPLE_API_KEY_ID` | the API Key ID |
| `APPLE_API_ISSUER_ID` | the API Issuer ID |

```bash
base64 -i mas-cert.p12 | pbcopy
base64 -i machole.provisionprofile | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

The workflow substitutes `APPLE_TEAM_ID` into the `TEAMID` placeholder in
`build/entitlements.mas.plist` at build time.

---

## 6. Build & submit

1. **Actions → App Store → Run workflow.**
2. Enter the **version** (e.g. `1.2.0`) and leave **submit** ticked to upload
   to App Store Connect. Untick it to only build the `.pkg` (downloadable as a
   workflow artifact) without uploading.
3. When it finishes, the build appears in App Store Connect under your app's
   **TestFlight / macOS Builds**. From there, attach it to a version and submit
   for review.

---

## Caveats — read before relying on this

The pipeline is in place, but App Store distribution of a screen recorder has
real constraints that need verification on a live submission:

- **ffmpeg compression is disabled under the sandbox.** `src/ffmpeg.ts` execs a
  *system* `ffmpeg`, which a sandboxed app cannot launch. Machole already falls
  back to saving the recording uncompressed when ffmpeg is unavailable, so
  recordings are never lost — but App Store builds get no compression. To
  restore it, an `ffmpeg` binary would need to be bundled inside the app and
  signed.
- **Screen recording review.** Capturing the screen plus system audio is
  allowed, but Apple review will expect a clear in-app explanation of why.
- **Entitlements may need iteration.** The exact entitlement set cannot be
  verified without a signing identity; the first real submission may surface
  adjustments (this is expected for Electron MAS builds).
