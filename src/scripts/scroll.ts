// The page's single scroll loop and the eased wheel/keyboard scrolling.
// The loop reads layout once per frame (two rects) and writes only transform and opacity.
import type { Strata } from '../scene/strata';

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];

let scene: Strata | null = null;
let lastY = NaN;
let railStep = -1;
let past: boolean | null = null;
let scrolled: boolean | null = null;

const el = {
  chain: q('[data-chain]'),
  stage: q('[data-stage]'),
  dim: q('[data-stage-dim]'),
  hero: q('[data-hero-inner]'),
  rail: q('[data-rail]'),
  railFill: q('[data-rail-fill]'),
  railItems: qa('[data-rail-item]'),
  steps: qa('[data-step]'),
  end: q('[data-end]'),
  word: q('[data-word]'),
  header: q('[data-header]'),
  toTop: q('[data-to-top]'),
};

export function attachScene(s: Strata) {
  scene = s;
  update(true);
}

function paintRail(step: number) {
  el.railItems.forEach((item, i) => {
    const k = i + 1;
    item.classList.toggle('is-on', step === k);
    item.classList.toggle('is-done', step > k);
  });
}

export function update(force = false) {
  const chain = el.chain;
  if (!chain) return;
  const y = window.scrollY;
  if (!force && y === lastY) return;
  lastY = y;

  // reads
  const vh = window.innerHeight;
  const r = chain.getBoundingClientRect();
  const er = el.end && el.word ? el.end.getBoundingClientRect() : null;

  // writes
  const p = Math.max(0, Math.min(6, -r.top / vh));
  if (scene) {
    scene.setProgress(p);
    scene.setActive(r.bottom > -50);
  }
  el.steps.forEach((n, i) => {
    const d = p - (i + 1);
    n.style.opacity = String(Math.max(0, 1 - Math.abs(d) * 1.7));
    n.style.transform = 'translateY(' + (-d * 36).toFixed(1) + 'px)';
  });
  if (el.hero) {
    el.hero.style.opacity = String(Math.max(0, 1 - p * 1.6));
    el.hero.style.transform = 'translateY(' + (-p * 80).toFixed(1) + 'px)';
  }
  if (el.rail) el.rail.style.opacity = String(Math.min(1, Math.max(0, (p - 0.55) * 2.5)));
  if (el.railFill) el.railFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (p - 1) / 5)).toFixed(4) + ')';
  // parallax hand-off: the scene sinks and dims while the next section slides over it
  const over = Math.max(0, vh - r.bottom), ko = Math.min(1, over / vh);
  if (el.stage) el.stage.style.transform = over > 0 ? 'translate3d(0,' + (over * 0.6).toFixed(1) + 'px,0) scale(' + (1 - ko * 0.06).toFixed(4) + ')' : 'none';
  if (el.dim) el.dim.style.opacity = (ko * 0.8).toFixed(3);
  if (er && el.word) {
    const t = Math.max(0, Math.min(1, (vh - er.top) / Math.max(1, er.height))), e = 1 - Math.pow(1 - t, 3);
    el.word.style.transform = 'translate3d(0,' + ((1 - e) * 70).toFixed(2) + '%,0)';
    el.word.style.opacity = (0.15 + 0.85 * e).toFixed(3);
  }

  const step = Math.round(p);
  if (step !== railStep) {
    railStep = step;
    paintRail(step);
  }
  const isPast = r.bottom < vh * 0.4;
  if (isPast !== past) {
    past = isPast;
    el.toTop?.classList.toggle('is-shown', isPast);
  }
  const isScrolled = y > 40;
  if (isScrolled !== scrolled) {
    scrolled = isScrolled;
    el.header?.classList.toggle('is-scrolled', isScrolled);
  }
}

// ---------- eased scrolling (wheel + keyboard; touch keeps native momentum) ----------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ss = { cur: window.scrollY, target: window.scrollY, on: false, last: 0 };
let ssRaf = 0;
let animRaf = 0;
const maxY = () => document.documentElement.scrollHeight - window.innerHeight;
const menuOpen = () => document.documentElement.hasAttribute('data-menu-open');

function ssTick(now: number) {
  const dt = Math.min(0.05, (now - ss.last) / 1000);
  ss.last = now;
  ss.cur += (ss.target - ss.cur) * (1 - Math.exp(-dt * 9));
  if (Math.abs(ss.target - ss.cur) < 0.25) {
    ss.cur = ss.target;
    ss.on = false;
  }
  window.scrollTo(0, ss.cur);
  update();
  if (ss.on) ssRaf = requestAnimationFrame(ssTick);
}

function push(d: number) {
  if (!ss.on) ss.cur = ss.target = window.scrollY;
  ss.target = Math.max(0, Math.min(maxY(), ss.target + d));
  if (!ss.on) {
    ss.on = true;
    ss.last = performance.now();
    ssRaf = requestAnimationFrame(ssTick);
  }
}

function stopAnim() {
  if (animRaf) {
    cancelAnimationFrame(animRaf);
    animRaf = 0;
  }
}

export function animTo(y: number) {
  if (ssRaf) cancelAnimationFrame(ssRaf);
  stopAnim();
  const to = Math.max(0, Math.min(maxY(), y)), from = window.scrollY, dist = to - from;
  if (reduceMotion || Math.abs(dist) < 2) {
    window.scrollTo(0, to);
    return;
  }
  const dur = Math.min(1700, 650 + Math.abs(dist) * 0.09), t0 = performance.now();
  const ez = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
  ss.on = false;
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    window.scrollTo(0, from + dist * ez(k));
    ss.cur = ss.target = window.scrollY;
    update();
    animRaf = k < 1 ? requestAnimationFrame(tick) : 0;
  };
  animRaf = requestAnimationFrame(tick);
}

export const scrollToEl = (target: Element) => animTo(target.getBoundingClientRect().top + window.scrollY);

function onWheel(e: WheelEvent) {
  if (reduceMotion || e.ctrlKey || menuOpen() || e.defaultPrevented) return;
  const t = e.target as Element | null;
  if (t?.closest?.('textarea,select,iframe,[data-native-scroll]')) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  stopAnim();
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 32;
  else if (e.deltaMode === 2) d *= window.innerHeight;
  push(d);
}

function onKey(e: KeyboardEvent) {
  if (reduceMotion || menuOpen() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target as Element | null;
  if (t?.closest?.('input,textarea,select,[contenteditable],[data-native-scroll]')) return;
  const vh = window.innerHeight;
  let d = 0;
  switch (e.key) {
    case 'ArrowDown': d = 140; break;
    case 'ArrowUp': d = -140; break;
    case 'PageDown': d = vh * 0.85; break;
    case 'PageUp': d = -vh * 0.85; break;
    case ' ':
      if (t?.closest?.('a,button')) return;
      d = (e.shiftKey ? -1 : 1) * vh * 0.85;
      break;
    case 'Home': e.preventDefault(); animTo(0); return;
    case 'End': e.preventDefault(); animTo(maxY()); return;
    default: return;
  }
  e.preventDefault();
  stopAnim();
  push(d);
}

function onAnchor(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href')!.slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  animTo(id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY);
}

export function initScroll() {
  let raf = 0;
  window.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
  }, { passive: true });
  window.addEventListener('resize', () => update(true));
  window.addEventListener('pointermove', (e) => scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1), { passive: true });
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  document.addEventListener('click', onAnchor);
  el.toTop?.addEventListener('click', () => animTo(0));
  update(true);
}
