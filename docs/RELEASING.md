# Releasing Machole

Machole is built and released by the [`release.yml`](../.github/workflows/release.yml)
GitHub Action. When you **publish a GitHub Release**, the Action builds a
universal (Apple Silicon + Intel) macOS app, signs it with your Apple
**Developer ID** certificate, notarizes it with Apple, and attaches the `.dmg`
to that release.

This document is the one-time setup for the signing credentials.

---

## 1. Prerequisites

- An **Apple Developer Program** membership ($99/yr) — <https://developer.apple.com/programs/>.
- Admin access to the GitHub repository (to add secrets).
- A Mac with Xcode or the Xcode command line tools (to create/export certificates).

---

## 2. Create the signing certificate

You need a **Developer ID Application** certificate. This is the identity used
for apps distributed *outside* the App Store.

1. Open **Xcode → Settings → Accounts**, sign in with your Apple ID.
2. Select your team → **Manage Certificates…** → **+** → **Developer ID Application**.
   (Or create it manually at <https://developer.apple.com/account/resources/certificates>.)
3. The certificate is now installed in your login keychain.

### Export it as a `.p12`

1. Open **Keychain Access** → **login** keychain → **My Certificates**.
2. Find **Developer ID Application: \<Your Name/Org\> (TEAMID)**.
3. Right-click → **Export…** → save as `cert.p12`.
4. Set an export password — you will need it as a GitHub secret.

Note the full certificate name (including the `(TEAMID)` suffix) — that string
is the `APPLE_SIGNING_IDENTITY` secret.

---

## 3. Create an App Store Connect API key (for notarization)

Notarization uses an App Store Connect API key instead of a password.

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>.
2. Under **Team Keys**, click **+** to generate a key.
   - Name: `machole-ci`
   - Access role: **Developer** is sufficient for notarization.
3. **Download the `.p8` file** — Apple only lets you download it once.
4. Record the **Key ID** (next to the key) and the **Issuer ID** (top of the page).

---

## 4. Add the GitHub repository secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | Value |
|---|---|
| `MACOS_CERT_P12_BASE64` | base64 of your `cert.p12` |
| `MACOS_CERT_PASSWORD` | the password you set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Acme Inc (AB12CD34EF)` |
| `APPLE_API_KEY_P8` | base64 of the `.p8` file |
| `APPLE_API_KEY_ID` | the Key ID from step 3 |
| `APPLE_API_ISSUER_ID` | the Issuer ID from step 3 |

Generate the base64 values on your Mac (the `.` keeps it as a single line):

```bash
base64 -i cert.p12 | pbcopy          # paste into MACOS_CERT_P12_BASE64
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # paste into APPLE_API_KEY_P8
```

> If no signing secrets are configured the workflow still runs — it just
> produces an **unsigned** `.dmg`. That is useful for forks/testing but such a
> build will be blocked by Gatekeeper on other Macs.

---

## 5. Cut a release

1. Make sure `main` has the changes you want to ship.
2. On GitHub: **Releases → Draft a new release**.
3. **Choose a tag**: create a new tag named `vX.Y.Z` (e.g. `v1.2.0`).
   The workflow derives the app version from this tag.
4. Write release notes and click **Publish release**.
5. The **Release** workflow starts automatically. When it finishes (~15–25 min,
   most of it Apple-side notarization) the signed `.dmg` is attached to the release.

Verify a downloaded build:

```bash
spctl --assess --type open --context context:primary-signature -vvv Machole.dmg
codesign --verify --deep --strict --verbose=2 /Applications/machole.app
```

---

## Troubleshooting

- **Notarization fails / `Invalid`** — run `xcrun notarytool log <submission-id>`
  with the API key locally to see which file Apple rejected. Usually a missing
  hardened-runtime flag or an unsigned nested binary.
- **`errSecInternalComponent` during signing** — the keychain partition list
  step failed; re-check `MACOS_CERT_PASSWORD`.
- **Universal build + asar integrity** — Machole ships with the
  `EnableEmbeddedAsarIntegrityValidation` fuse on. If a universal build ever
  fails to launch with an integrity error, that fuse is the first thing to test
  toggling in `forge.config.ts`.
- **App Store** — this pipeline targets direct download only. Mac App Store
  distribution (a sandboxed, App-Store-signed `.pkg`) is a separate pipeline —
  see [`APP_STORE.md`](./APP_STORE.md).
