import './picker.css';
import type { CaptureSource } from './recording-types';

// The source picker: a grid of screens and windows, plus "Select an Area".
// Selecting anything hands the choice back to the main process, which runs
// the countdown and tells the controls window to begin recording.

const screensGrid = document.getElementById('screens') as HTMLElement;
const windowsGrid = document.getElementById('windows') as HTMLElement;
const loadingEl = document.getElementById('loading') as HTMLElement;

function cancel(): void {
  window.bridge.send('rec:cancel-picker');
}

function buildCard(source: CaptureSource): HTMLButtonElement {
  const card = document.createElement('button');
  card.className = 'source-card';

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.src = source.thumbnail;
  card.appendChild(thumb);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (source.appIcon) {
    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.src = source.appIcon;
    meta.appendChild(icon);
  }
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = source.name;
  title.title = source.name;
  meta.appendChild(title);
  card.appendChild(meta);

  card.addEventListener('click', () => {
    window.bridge.send('rec:start-with-source', source);
  });
  return card;
}

function renderEmpty(grid: HTMLElement, text: string): void {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  grid.appendChild(empty);
}

async function loadSources(): Promise<void> {
  loadingEl.style.display = 'block';
  screensGrid.innerHTML = '';
  windowsGrid.innerHTML = '';

  let sources: CaptureSource[] = [];
  try {
    sources = await window.bridge.invoke<CaptureSource[]>('rec:get-sources');
  } catch {
    sources = [];
  }
  loadingEl.style.display = 'none';

  const screens = sources.filter((s) => s.type === 'screen');
  const windows = sources.filter((s) => s.type === 'window');

  if (screens.length) screens.forEach((s) => screensGrid.appendChild(buildCard(s)));
  else renderEmpty(screensGrid, 'No screens found.');

  if (windows.length) windows.forEach((s) => windowsGrid.appendChild(buildCard(s)));
  else renderEmpty(windowsGrid, 'No shareable windows found.');
}

document.getElementById('area-card').addEventListener('click', () => {
  window.bridge.send('rec:start-with-area');
});
document.getElementById('refresh-btn').addEventListener('click', () => {
  loadSources();
});
document.getElementById('close-btn').addEventListener('click', cancel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancel();
});

loadSources();
