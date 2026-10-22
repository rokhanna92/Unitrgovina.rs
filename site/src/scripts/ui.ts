// Small interactive islands: menu, services accordion, gallery, locations, dates.
const pad = (n: number) => String(n).padStart(2, '0');

export function initMenu() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (!header || !btn || !menu) return;
  const set = (open: boolean) => {
    menu.hidden = !open;
    header.classList.toggle('is-menu', open);
    btn.textContent = (open ? btn.dataset.close : btn.dataset.open) ?? '';
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.toggleAttribute('data-menu-open', open);
  };
  btn.addEventListener('click', () => set(menu.hasAttribute('hidden')));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      set(false);
      btn.focus();
    }
  });
  // the overlay only exists on phones
  window.matchMedia('(min-width: 900px)').addEventListener('change', (m) => {
    if (m.matches) set(false);
  });
}

export function initServices() {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-svc]')];
  const parts = rows.map((row) => {
    const btn = row.querySelector('button')!;
    return { row, btn, panel: document.getElementById(btn.getAttribute('aria-controls')!)! };
  });
  parts.forEach(({ row, btn }, i) =>
    btn.addEventListener('click', () => {
      const open = row.classList.contains('open');
      parts.forEach((p, j) => {
        const on = j === i && !open;
        p.row.classList.toggle('open', on);
        p.btn.setAttribute('aria-expanded', String(on));
        p.panel.inert = !on;
      });
    }),
  );
}

export function initGallery() {
  const root = document.querySelector<HTMLElement>('[data-gallery]');
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>('[data-gal-item]')];
  const now = root.querySelector<HTMLElement>('[data-gal-now]')!;
  const track = root.querySelector<HTMLElement>('[data-gal-track]')!;
  const n = items.length;
  let gal = 0, inView = false, hover = false;
  const show = (i: number) => {
    if (i === gal) return;
    gal = i;
    items.forEach((it, k) => {
      it.classList.toggle('on', k === gal);
      it.classList.toggle('near', Math.abs(gal - k) === 1);
    });
    now.textContent = pad(gal + 1);
  };
  root.querySelector('[data-gal-prev]')!.addEventListener('click', () => show((gal + n - 1) % n));
  root.querySelector('[data-gal-next]')!.addEventListener('click', () => show((gal + 1) % n));
  items.forEach((it, i) => {
    it.addEventListener('mouseenter', () => show(i));
    it.querySelector('[data-gal-hit]')!.addEventListener('click', () => show(i));
  });
  track.addEventListener('mouseenter', () => (hover = true));
  track.addEventListener('mouseleave', () => (hover = false));
  new IntersectionObserver((e) => (inView = e[0].isIntersecting), { threshold: 0.3 }).observe(track);
  // autoplay; off for reduced motion
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.setInterval(() => {
      if (inView && !hover) show((gal + 1) % n);
    }, 5200);
  }
}

export function initLocations() {
  const root = document.querySelector<HTMLElement>('[data-locations]');
  if (!root) return;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-loc]')];
  const frame = root.querySelector<HTMLIFrameElement>('[data-map-frame]')!;
  const label = root.querySelector<HTMLElement>('[data-map-label]')!;
  cards.forEach((card) =>
    card.addEventListener('click', () => {
      if (card.classList.contains('on')) return;
      cards.forEach((c) => c.classList.toggle('on', c === card));
      frame.src = card.dataset.map!;
      label.textContent = card.dataset.label!;
    }),
  );
}

// Dates rendered at build time, refreshed to today in the browser.
export function initDates() {
  const d = new Date();
  document.querySelectorAll('[data-today]').forEach((el) => (el.textContent = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`));
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(d.getFullYear())));
}
