import '@fontsource/share-tech-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/vt323/400.css';
import './ui/styles.css';

const params = new URLSearchParams(location.search);

function showLoader(): void {
  const el = document.createElement('div');
  el.id = 'loader';
  el.className = 'loader';
  el.innerHTML = '<div>◤ KA-III</div><div class="bar"><i></i></div><div class="label">INITIALISIERE</div>';
  document.body.append(el);
}

async function boot(): Promise<void> {
  if (import.meta.env.DEV && params.has('lab')) {
    const { runArtLab } = await import('./dev/artlab');
    runArtLab(document.getElementById('ui-root')!);
    return;
  }
  showLoader();
  const { GameApp } = await import('./game/app');
  const app = new GameApp();
  if (params.has('e2e') || params.has('debug')) {
    (window as unknown as { __ka3: unknown }).__ka3 = app;
  }
  app.start();
}

void boot();
