import './frame.css';

// A full-display, click-through, content-protected window that draws a
// border around the region currently being recorded.

interface FrameConfig {
  mode: 'screen' | 'window' | 'area';
  rect: { x: number; y: number; width: number; height: number } | null;
}

const frame = document.getElementById('frame') as HTMLElement;
const badgeText = document.getElementById('badge-text') as HTMLElement;

window.bridge.on('frame:config', (raw) => {
  const cfg = raw as FrameConfig;
  if (cfg.mode === 'area' && cfg.rect) {
    // Border hugs the selected rectangle.
    frame.style.left = `${cfg.rect.x}px`;
    frame.style.top = `${cfg.rect.y}px`;
    frame.style.width = `${cfg.rect.width}px`;
    frame.style.height = `${cfg.rect.height}px`;
  } else {
    // Screen / window mode: border runs along the display edges.
    frame.style.inset = '0';
  }
  frame.style.visibility = 'visible';
});

window.bridge.on('frame:state', (raw) => {
  const paused = raw === 'paused';
  frame.classList.toggle('paused', paused);
  badgeText.textContent = paused ? 'PAUSED' : 'REC';
});
