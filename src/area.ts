import './area.css';

// Full-screen overlay (one display) for drawing a custom capture rectangle.
// Coordinates are CSS pixels, which equal display-relative DIPs; the main
// process converts them to fractions of the display.

const MIN_SIZE = 24;

const backdrop = document.getElementById('backdrop') as HTMLElement;
const selection = document.getElementById('selection') as HTMLElement;
const dims = document.getElementById('dims') as HTMLElement;

let dragging = false;
let startX = 0;
let startY = 0;
let rect = { x: 0, y: 0, width: 0, height: 0 };

function applyRect(): void {
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
  dims.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

window.addEventListener('mousedown', (e) => {
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  rect = { x: startX, y: startY, width: 0, height: 0 };
  backdrop.classList.add('hidden');
  selection.classList.remove('hidden');
  applyRect();
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  rect.x = Math.min(startX, e.clientX);
  rect.y = Math.min(startY, e.clientY);
  rect.width = Math.abs(e.clientX - startX);
  rect.height = Math.abs(e.clientY - startY);
  applyRect();
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
    window.bridge.send('area:commit', {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  } else {
    // Too small — reset and let the user try again.
    selection.classList.add('hidden');
    backdrop.classList.remove('hidden');
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.bridge.send('area:cancel');
});
