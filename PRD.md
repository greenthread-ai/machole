# ScreenHole App for macOS

## Overview
ScreenHole is an Electron-based application designed for macOS, providing a unique camera overlay experience. It creates a small, circular video "hole" displaying the user's camera feed, which floats persistently on top of all other windows. This overlay features a soft, animated gradient outline, enhancing the visual presentation.

## Key Features

### Persistent Camera Overlay
Displays a live feed from the user's camera within a compact, always-on-top window.

### Animated Gradient Outline
The overlay is framed by a customizable animated gradient. Users can define the `start`, `mid-point`, and `stop` colors via the application's menu, which then animate smoothly using CSS properties.

### Minimalist User Interface
-   **No Native Window Chrome**: The application window lacks standard macOS window controls (title bar, close/minimize/maximize buttons) for a seamless, integrated feel.
-   **Right-Click Interaction**: All user interaction, including accessing settings and controls, is handled via a context (right-click) menu. (Menu functionality is currently a stub.)
-   **Free Movement**: The overlay can be repositioned anywhere on the screen by simply dragging it with the mouse.

### Built-In Screen Recording
ScreenHole records the screen itself, so QuickTime is no longer needed.
-   **Source selection**: Choose a full screen, a single window, or a drag-selected custom area.
-   **Countdown**: A full-screen 3-2-1 countdown plays before capture begins.
-   **Combined capture**: Screen video, the microphone, and system audio (speakers) are captured and mixed into one file.
-   **Output**: Saved as `.mp4` (H.264) where the OS supports it, otherwise `.webm`, via a Save dialog.
-   **Controls overlay**: An always-on-screen, draggable panel with record / stop / pause / mute / camera controls and their global keyboard shortcuts. It is excluded from the recording itself.

### Immediate Launch & Permissions
Upon launch, ScreenHole starts immediately. It prompts for camera, microphone, and screen-recording permissions as they are first needed.

## Compatibility Notes

### macOS Screen Recorder
It is crucial that ScreenHole functions correctly and is recordable by the native macOS screen recorder. Any potential issues or conflicts with the screen recording functionality must be identified and addressed promptly to ensure smooth content creation workflows.

## Future Enhancements

### Dedicated Recording Desktop
Explore leveraging macOS native functionality to create a separate, dedicated desktop space. This would allow users to select specific application windows to display on this desktop, enabling clean screen recordings without interference from other desktop items, menu bars, or non-essential windows.
