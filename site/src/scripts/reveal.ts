// Scroll reveals ([data-reveal] = delay in ms), number count-up ([data-count]) and the grain board digit roll.
const reveals = new WeakMap<Element, Animation>();
const counted = new WeakSet<Element>();

function countUp(el: HTMLElement) {
  counted.add(el);
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const target = Number(el.dataset.count), t0 = performance.now(), dur = 1600;
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    node.nodeValue = k < 1 ? String(Math.round(target * e)) : String(target);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initReveals() {
  if (!('IntersectionObserver' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board = document.querySelector('[data-board]');
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const t = e.target as HTMLElement;
        reveals.get(t)?.play();
        if (t.dataset.count && !counted.has(t)) countUp(t);
        if (t === board) t.classList.add('is-live');
        io.unobserve(t);
      }),
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  );
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    // anything already on screen stays put; only what is below the fold animates in
    if (reduce || !el.animate) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return;
    const rise = el.dataset.revealKind === 'rise';
    const a = el.animate(
      [{ opacity: 0, transform: rise ? 'translateY(160px)' : 'translateY(32px)' }, { opacity: 1, transform: 'none' }],
      { duration: rise ? 1400 : 1000, delay: Number(el.dataset.reveal) || 0, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' },
    );
    a.pause();
    reveals.set(el, a);
    io.observe(el);
  });
  if (!reduce) document.querySelectorAll('[data-count]').forEach((el) => io.observe(el));
  if (board) io.observe(board);
}
