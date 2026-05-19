import './compressing.css';

// Progress overlay shown while ffmpeg re-encodes the finished recording.
// The main process drives it via `compress:progress` (a 0..1 fraction).
// Until a real fraction arrives — e.g. when the recording duration is
// unknown — the bar runs an indeterminate sweep.

const bar = document.querySelector('.bar') as HTMLElement;
const fill = document.getElementById('fill') as HTMLElement;
const pct = document.getElementById('pct') as HTMLElement;

bar.classList.add('indeterminate');

window.bridge.on('compress:progress', (value) => {
  const fraction = typeof value === 'number' ? value : 0;
  if (fraction <= 0) return;
  bar.classList.remove('indeterminate');
  const clamped = Math.min(1, fraction);
  fill.style.width = `${clamped * 100}%`;
  pct.textContent = `${Math.round(clamped * 100)}%`;
});
