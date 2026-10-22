import { initScroll, attachScene } from './scroll';
import { initReveals } from './reveal';
import { initMenu, initServices, initGallery, initLocations, initDates } from './ui';
import { initBeton, initAgregati, initSeason } from './sections';
import { initQuote } from './quote';

initScroll();
initMenu();
initServices();
initBeton();
initAgregati();
initGallery();
initSeason();
initLocations();
initQuote();
initDates();
// same 80 ms grace as the reference, so the first layout has settled
setTimeout(initReveals, 80);

// The 3D scene loads after the page has loaded and the main thread is idle.
function loadScene() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas) return;
  import('../scene/strata')
    .then(({ createStrata }) => createStrata(canvas, document.querySelector<HTMLElement>('[data-scene-labels]'), { quality: 'full' }))
    .then(attachScene)
    .catch((e) => console.warn('3D scena nije učitana', e));
}
const whenIdle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
if (document.readyState === 'complete') whenIdle(loadScene);
else window.addEventListener('load', () => whenIdle(loadScene), { once: true });
