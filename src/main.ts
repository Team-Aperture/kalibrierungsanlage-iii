import '@fontsource/share-tech-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/vt323/400.css';
import './ui/styles.css';
import { installFavicon } from './art/brand';
import { loadSave } from './state/save';
import { loadSettings } from './state/settings';
import { showBootScreen } from './ui/boot';
import { setBrandMotion } from './ui/brand';

const params = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  if (import.meta.env.DEV && params.has('lab')) {
    const { runArtLab } = await import('./dev/artlab');
    runArtLab(document.getElementById('ui-root')!);
    return;
  }
  installFavicon();
  const settings = loadSettings();
  setBrandMotion(settings.reducedMotion);
  const save = loadSave();
  const bootScreen = showBootScreen({ reduced: settings.reducedMotion, signal: save.ok && save.data.chapterComplete });
  const { GameApp } = await import('./game/app');
  const app = new GameApp();
  app.bootScreen = bootScreen;
  if (params.has('e2e') || params.has('debug')) {
    (window as unknown as { __ka3: unknown }).__ka3 = app;
  }
  app.start();
}

void boot();
