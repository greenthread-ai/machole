import './permissions.css';

// Onboarding UI. Polls the live permission status so the screen updates as
// the user toggles things in System Settings.

type MediaType = 'camera' | 'microphone' | 'screen';

interface PermState {
  camera: string;
  microphone: string;
  screen: string;
  screenGrantedAtBoot: boolean;
}

const TYPES: MediaType[] = ['camera', 'microphone', 'screen'];

const primaryBtn = document.getElementById('primary-btn') as HTMLButtonElement;
const screenNote = document.getElementById('screen-note') as HTMLElement;

let current: PermState | null = null;

function statusLabel(s: string): string {
  if (s === 'granted') return 'Granted';
  if (s === 'denied' || s === 'restricted') return 'Denied';
  return 'Not set';
}

function render(state: PermState): void {
  current = state;

  for (const type of TYPES) {
    const row = document.querySelector(`.perm[data-type="${type}"]`) as HTMLElement;
    const value = state[type];
    const statusEl = row.querySelector('.perm-status') as HTMLElement;
    const btn = row.querySelector('.perm-btn') as HTMLButtonElement;

    statusEl.textContent = statusLabel(value);
    statusEl.className = `perm-status ${value === 'granted' ? 'ok' : 'pending'}`;

    if (value === 'granted') {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
      // Camera/mic can show the native prompt only while "not set".
      btn.textContent =
        type !== 'screen' && value === 'not-determined' ? 'Allow' : 'Open Settings';
    }
  }

  const allGranted =
    state.camera === 'granted' &&
    state.microphone === 'granted' &&
    state.screen === 'granted';

  // Screen recording only takes effect on the next launch, so if it was not
  // already granted at boot the user must restart rather than continue.
  if (allGranted && state.screenGrantedAtBoot) {
    primaryBtn.textContent = 'Continue';
    primaryBtn.dataset.action = 'continue';
    primaryBtn.disabled = false;
  } else if (allGranted && !state.screenGrantedAtBoot) {
    primaryBtn.textContent = 'Restart Machole';
    primaryBtn.dataset.action = 'restart';
    primaryBtn.disabled = false;
  } else {
    primaryBtn.textContent = 'Continue';
    primaryBtn.dataset.action = 'continue';
    primaryBtn.disabled = true;
  }

  screenNote.style.display = state.screenGrantedAtBoot ? 'none' : 'block';
}

async function refresh(): Promise<void> {
  const state = await window.bridge.invoke<PermState>('perm:get');
  render(state);
}

document.querySelectorAll('.perm-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const row = (btn as HTMLElement).closest('.perm') as HTMLElement;
    const type = row.dataset.type as MediaType;
    const value = current ? current[type] : 'not-determined';
    if (type !== 'screen' && value === 'not-determined') {
      await window.bridge.invoke('perm:request', type);
    } else {
      window.bridge.send('perm:open-settings', type);
    }
    refresh();
  });
});

primaryBtn.addEventListener('click', () => {
  if (primaryBtn.disabled) return;
  if (primaryBtn.dataset.action === 'restart') window.bridge.send('perm:restart');
  else window.bridge.send('perm:continue');
});

document.getElementById('quit-btn').addEventListener('click', () => {
  window.bridge.send('perm:quit');
});

refresh();
setInterval(refresh, 1500);
