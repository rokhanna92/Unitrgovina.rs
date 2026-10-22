// Beton calculator and pump picker, fraction picker, season banner.
import { calcConcrete, fmtNum, type CalcKey, type CalcValues } from './concrete';
import { seasonFor } from './season-data';
import { toQuote } from './quote';
import type { Season } from '../content';

export function initBeton() {
  const root = document.querySelector<HTMLElement>('[data-beton]');
  if (!root) return;
  const words = JSON.parse(root.dataset.words!) as { tura: string; ture: string; mixers: string };
  const inputs = [...root.querySelectorAll<HTMLInputElement>('[data-calc]')];
  const v = Object.fromEntries(inputs.map((i) => [i.dataset.calc, parseFloat(i.value)])) as CalcValues;
  const bars = root.querySelector<HTMLElement>('[data-bars]')!;
  let pump = root.querySelector<HTMLElement>('[data-pump].on')?.dataset.pump ?? '36 m';
  let volStr = '';

  const render = () => {
    const r = calcConcrete(v, words);
    volStr = r.volStr;
    root.querySelectorAll('[data-vol]').forEach((el) => (el.textContent = r.volStr));
    root.querySelector('[data-trips]')!.textContent = r.tripsStr;
    // keep existing bars so their width transitions, like the reference
    while (bars.children.length > r.bars.length) bars.lastElementChild!.remove();
    while (bars.children.length < r.bars.length) {
      const b = document.createElement('span');
      b.className = 'bar';
      b.appendChild(document.createElement('span')).style.width = '0%';
      bars.appendChild(b);
    }
    r.bars.forEach((w, k) => ((bars.children[k].firstElementChild as HTMLElement).style.width = w));
  };

  inputs.forEach((input) =>
    input.addEventListener('input', () => {
      const k = input.dataset.calc as CalcKey;
      v[k] = parseFloat(input.value);
      root.querySelector(`[data-shown="${k}"]`)!.textContent = fmtNum(v[k]);
      render();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-pump]').forEach((b) =>
    b.addEventListener('click', () => {
      pump = b.dataset.pump!;
      root.querySelectorAll<HTMLElement>('[data-pump]').forEach((x) => x.classList.toggle('on', x.dataset.pump === pump));
    }),
  );
  root.querySelector('[data-calc-quote]')!.addEventListener('click', () => toQuote(0, { 'b.kol': volStr, 'b.pumpa': pump }));
  root.querySelector('[data-floor-quote]')!.addEventListener('click', () => toQuote(4, { 'p.vr': 'Industrijski pod' }));
  render();
}

export function initAgregati() {
  const root = document.querySelector<HTMLElement>('[data-agregati]');
  if (!root) return;
  const tasks = [...root.querySelectorAll<HTMLButtonElement>('[data-task]')];
  const rows = [...root.querySelectorAll<HTMLButtonElement>('[data-frac]')];
  const shots = [...root.querySelectorAll<HTMLElement>('[data-shot]')];
  const data = rows.map((r) => ({
    tags: JSON.parse(r.dataset.tags!) as string[],
    title: r.dataset.title!,
    use: r.dataset.use!,
    badge: r.dataset.badge!,
    short: r.dataset.short!,
    form: r.dataset.form!,
    range: r.dataset.range ? r.dataset.range.split(',') : null,
  }));
  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  const tagsEl = $('[data-cur-tags]');
  const tagClass = tagsEl.firstElementChild?.className ?? 'tag';
  let frac = tasks[0]?.dataset.task ?? 'Sve';
  let fsel: number | null = null;
  let cur = 0;

  const match = (i: number) => frac === tasks[0]?.dataset.task || data[i].tags.includes(frac);
  const render = () => {
    let sel = fsel ?? 0;
    if (!match(sel)) sel = Math.max(0, data.findIndex((_, i) => match(i)));
    rows.forEach((r, i) => {
      r.classList.toggle('on', i === sel);
      r.classList.toggle('dim', !match(i));
      r.setAttribute('aria-selected', String(i === sel));
    });
    if (sel === cur) return;
    cur = sel;
    const c = data[sel];
    shots.forEach((s, i) => s.classList.toggle('on', i === sel));
    $('[data-cur-badge]').textContent = c.badge;
    $('[data-cur-title]').textContent = c.title;
    $('[data-cur-use]').textContent = c.use;
    $('[data-cur-short]').textContent = c.short;
    $('[data-cur-range]').hidden = !c.range;
    if (c.range) {
      const fill = $('[data-cur-fill]');
      fill.style.left = c.range[0] + '%';
      fill.style.width = c.range[1] + '%';
    }
    tagsEl.replaceChildren(
      ...c.tags.map((t) => {
        const s = document.createElement('span');
        s.className = tagClass;
        s.textContent = t;
        return s;
      }),
    );
  };

  tasks.forEach((t) =>
    t.addEventListener('click', () => {
      frac = t.dataset.task!;
      fsel = null;
      tasks.forEach((x) => {
        x.classList.toggle('on', x === t);
        x.setAttribute('aria-pressed', String(x === t));
      });
      render();
    }),
  );
  rows.forEach((r, i) => {
    const choose = () => {
      if (fsel !== i) {
        fsel = i;
        render();
      }
    };
    r.addEventListener('click', choose);
    r.addEventListener('mouseenter', choose);
  });
  $('[data-cur-order]').addEventListener('click', () => toQuote(1, { 'a.fr': data[cur].form }));
}

export function initSeason() {
  const root = document.querySelector<HTMLElement>('[data-season]');
  if (!root) return;
  const s = seasonFor(JSON.parse(root.dataset.seasons!) as Season[], new Date().getMonth());
  root.querySelector('[data-season-label]')!.textContent = s.label;
  root.querySelector('[data-season-text]')!.textContent = s.text;
  root.querySelector('[data-season-btn-label]')!.textContent = s.btn;
  root.querySelector('[data-season-btn]')!.addEventListener('click', () => {
    if (s.href) {
      const el = document.getElementById(s.href);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
    } else toQuote(s.tab ?? 0);
  });
}
