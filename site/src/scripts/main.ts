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

// The scene needs a real GPU. Software WebGL (headless browsers, VMs, GPU-less machines) draws it at a few
// frames per second and blocks the main thread, so those visitors get the static stage instead.
function hasGpu() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

// The 3D scene loads after the page has loaded and the main thread is idle.
function loadScene() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!canvas || !hasGpu()) return;
  import('../scene/strata')
    .then(({ createStrata }) => createStrata(canvas, document.querySelector<HTMLElement>('[data-scene-labels]'), { quality: 'full' }))
    .then(attachScene)
    .catch((e) => console.warn('3D scena nije učitana', e));
}
const whenIdle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
if (document.readyState === 'complete') whenIdle(loadScene);
else window.addEventListener('load', () => whenIdle(loadScene), { once: true });
