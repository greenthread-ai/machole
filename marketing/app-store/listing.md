# App Store Connect Listing — ScreenHole

Everything to copy-paste into App Store Connect. Anything in `[TBD]` is something only you can decide / supply.

---

## App Information (set once)

| Field | Value |
|---|---|
| Name | `ScreenHole` |
| Bundle ID | `ai.greenthread.machole` |
| SKU | `machole-001` |
| Primary Language | English (U.S.) |
| Primary Category | Photo & Video |
| Secondary Category | Productivity |
| Age Rating | 4+ |
| Content Rights | I have all the necessary rights to the content I'm submitting (yes) |

### Age Rating questionnaire

Answer "None" / "No" to every item. ScreenHole contains no objectionable content, mature themes, gambling, ads, social features, in-app purchases, web browsing, or user-generated content. Final rating should be **4+**.

---

## Pricing & Availability

| Field | Value |
|---|---|
| Price | `[TBD — Free or paid tier]` |
| Available in | All Countries / Regions |
| Available date | Immediately on approval |

---

## App Privacy (set once)

| Field | Value |
|---|---|
| Privacy Policy URL | `https://greenthread-ai.github.io/machole/privacy.html` |
| Data collection | None |
| Tracking | No |

### "Data Types" questionnaire

Pick **"No, we do not collect data from this app"**.

ScreenHole runs entirely on the user's Mac. The camera, microphone, and screen capture streams are processed locally; recordings are written to a path the user chooses. There is no network call from the app at runtime. No accounts, no analytics, no telemetry, no crash reports.

---

## Encryption

The Info.plist now contains `ITSAppUsesNonExemptEncryption: false` (see `forge.config.ts`), so App Store Connect should skip the encryption questionnaire on every build. If it still asks:

| Question | Answer |
|---|---|
| Uses encryption? | Yes |
| Exempt from export documentation? | Yes — only standard encryption included in macOS (HTTPS / TLS) |
| Proprietary encryption? | No |

---

## Version 1.0.0 — English (U.S.)

### Subtitle (max 30 chars)

```
Screen recorder with you in it
```

### Promotional Text (max 170 — editable without re-review)

```
Capture your screen, your microphone, system audio, and your face — together. Always-on camera overlay, on-device blur and auto-frame, global keyboard shortcuts.
```

### Keywords (max 100 chars, comma-separated, NO spaces after commas)

```
screen recorder,camera overlay,screencast,record,tutorial,demo,video,face cam,mic,system audio
```

(98 chars — leaves headroom.)

### Description (max 4000 chars)

```
ScreenHole records your screen with your face baked in.

A small circular camera overlay floats on top of every other window, so when you record a tutorial, demo, or async update, your viewers see what you're doing AND who's doing it. No post-production, no awkward picture-in-picture, no fighting with OBS — just press record.


RECORD SCREEN, WINDOW, OR AREA

Choose a full display, a single application window, or drag-select any rectangle of your screen. Your microphone and the system audio playing through your speakers are mixed automatically into the same file. A subtle animated border traces the recorded region so you always know what's captured.


ALWAYS-ON CAMERA OVERLAY

A circular video tile that floats above every app, framed by an animated gradient ring you can theme to match your work. Drag it anywhere. Right-click for:

• Five gradient themes — Rainbow, Sunset, Ocean, Neon, Forest
• Three sizes — Small, Medium, Large
• Pick which camera to use
• Audio-reactive pulse on the ring


ON-DEVICE INTELLIGENCE

Three optional layers, all running locally on your Mac — nothing sent to the cloud:

• Background Blur — bokeh-style backdrop blur so your room doesn't distract
• Auto-Frame — keeps your face centered as you move
• Close-Up — tighter crop for a more intimate framing


CONTROLS YOU CAN ACTUALLY USE MID-RECORDING

A persistent controls panel shows your recording state and your microphone choice. While recording you can:

• ⌘⇧R — Start / stop recording
• ⌘⇧P — Pause / resume
• ⌘⇧M — Mute the microphone
• ⌘⇧E — Hide / show your camera

The controls panel is excluded from the recording itself, so it never appears in your output.


PRIVACY-FIRST

• No accounts, no sign-in
• No analytics, no telemetry, no crash reporting
• No video, audio, or recordings leave your Mac
• Recordings save to wherever you choose


BUILT FOR MACOS

• Universal binary — Apple Silicon and Intel
• Sandboxed for the Mac App Store
• Designed for macOS Sonoma and later


PERFECT FOR

• Developers recording walkthroughs and code reviews
• Designers showing process and prototypes
• Educators making lessons and explainers
• Product teams shipping async video updates
• Anyone who wants to put a face on their screen recordings without the hassle
```

### What's New in This Version (max 4000 chars)

```
First public release of ScreenHole.

• Record full screen, a single window, or a custom area
• Mix microphone and system audio into your recording automatically
• Always-on circular camera overlay with five gradient themes
• Background blur, auto-frame, and close-up framing, all on-device
• Global shortcuts: ⌘⇧R record / ⌘⇧P pause / ⌘⇧M mute / ⌘⇧E camera
• Save as .mp4
```

### Support URL

```
https://greenthread-ai.github.io/machole/support.html
```

### Marketing URL (optional)

```
https://greenthread-ai.github.io/machole/
```

### Copyright

```
© 2026 The IT Dept Pty Ltd
```

---

## App Review Information

### Contact

| Field | Value |
|---|---|
| First Name | Nick |
| Last Name | Pratley |
| Phone | `[TBD]` |
| Email | hello@theitdept.au |

### Sign-In Required

**No.** ScreenHole does not require an account.

### Notes for Reviewer

```
ScreenHole is a local screen-recording app with an always-on camera overlay. It does not communicate with any servers — there are no accounts, sign-in, or network calls.

To test the recording flow:

1. Launch the app. A circular camera overlay appears in the bottom-right of the screen; a small controls panel appears in the bottom-left. (Grant Camera and Microphone access when prompted; Screen Recording is requested on the first capture and macOS may ask the app to be restarted to apply the grant.)
2. Click "Start Recording" on the controls panel — a picker window opens.
3. Choose a screen, a window, or "Select an Area" to drag-select a rectangle.
4. A 3-2-1 countdown plays, then capture begins. The controls panel timer starts running and a red border outlines the recorded region.
5. Click Stop (or press ⌘⇧R) — a Save dialog appears. Choose any location and save the .mp4.

Background Blur, Auto-Frame, and Close-Up are toggled via the camera overlay's right-click menu. They use MediaPipe ML models that are shipped inside the .app bundle — no network is required.

The .mp4 produced by the sandboxed build is the screen video plus a mix of microphone audio and system audio (loopback). Quality is uncompressed; future versions will add on-device compression.
```

---

## Build (every version)

| Field | Value |
|---|---|
| Build | Latest from the App Store workflow (CFBundleVersion comes from the CI run number — always unique) |
| Version Number | `1.0.0` (or whatever you set when running the workflow) |

The build is uploaded automatically when you publish a GitHub Release, or by running `Actions → App Store → Run workflow` manually.

---

## Screenshots

See [`screenshots/README.md`](./screenshots/README.md) — open each HTML page in a browser at 1440×900 and capture with macOS `⌘⇧4 → Space` (which renders 2880×1800 retina, Apple's preferred macOS screenshot size).
