import './countdown.css';

// A 3-2-1-GO cue shown full-screen before recording starts. This window is
// content-protected, so it never appears in the recording itself.

const STEP_MS = 850;
const countEl = document.getElementById('count') as HTMLElement;

let value = 3;

function show(text: string, isGo: boolean): void {
  countEl.textContent = text;
  countEl.classList.toggle('go', isGo);
  // Restart the pop animation.
  countEl.classList.remove('pop');
  void countEl.offsetWidth;
  countEl.classList.add('pop');
}

function tick(): void {
  if (value > 0) {
    show(String(value), false);
    value -= 1;
    setTimeout(tick, STEP_MS);
    return;
  }
  show('GO', true);
  setTimeout(() => window.bridge.send('countdown:done'), 450);
}

tick();
