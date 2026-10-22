// Quote form: type tabs, per-type fields, chips, prefill from other sections, submit.
import { scrollToEl } from './scroll';

// Set PUBLIC_QUOTE_ENDPOINT (see .env.example) to POST requests as JSON. Until then nothing is sent: launch blocker.
const ENDPOINT = import.meta.env.PUBLIC_QUOTE_ENDPOINT as string | undefined;

const root = document.querySelector<HTMLElement>('[data-quote]');
const form = root?.querySelector<HTMLFormElement>('[data-quote-form]');
const sent = root?.querySelector<HTMLElement>('[data-quote-sent]');
const tabs = root ? [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')] : [];
const groups = root ? [...root.querySelectorAll<HTMLElement>('[data-group]')] : [];
let tab = 0;

function setTab(i: number) {
  tab = i;
  tabs.forEach((t, k) => {
    t.classList.toggle('on', k === i);
    t.setAttribute('aria-pressed', String(k === i));
  });
  groups.forEach((g, k) => (g.hidden = k !== i));
}

function showForm(on: boolean) {
  if (!form || !sent) return;
  form.hidden = !on;
  sent.hidden = on;
}

function setChip(group: HTMLElement, value: string) {
  const input = group.querySelector<HTMLInputElement>('input[type=hidden]')!;
  input.value = value;
  group.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((c) => {
    const on = c.dataset.chip === value;
    c.classList.toggle('on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

function setValue(name: string, value: string) {
  const chips = form?.querySelector<HTMLElement>(`[data-chips="${name}"]`);
  if (chips) return setChip(chips, value);
  const field = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (field) field.value = value;
}

/** Open the form on a type tab, prefill fields by name (e.g. "b.kol") and scroll to it. */
export function toQuote(tabIndex: number, values: Record<string, string> = {}) {
  setTab(tabIndex);
  showForm(true);
  Object.entries(values).forEach(([k, v]) => setValue(k, v));
  if (root) scrollToEl(root);
}

function collect() {
  const data: Record<string, string> = { vrsta: tabs[tab]?.textContent?.trim() ?? '' };
  const fields = [...form!.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[name]')];
  for (const f of fields) {
    if (f.name === 'website' || f.closest('[data-group][hidden]')) continue;
    if (f instanceof HTMLInputElement && f.type === 'checkbox') data[f.name] = f.checked ? 'da' : 'ne';
    else data[f.name] = f.value;
  }
  return data;
}

export function initQuote() {
  if (!root || !form || !sent) return;
  const error = root.querySelector<HTMLElement>('[data-quote-error]')!;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const trap = form.querySelector<HTMLInputElement>('[name=website]')!;

  tabs.forEach((t, i) => t.addEventListener('click', () => { setTab(i); showForm(true); }));
  form.querySelectorAll<HTMLElement>('[data-chips]').forEach((g) =>
    g.addEventListener('click', (e) => {
      const chip = (e.target as Element).closest<HTMLButtonElement>('[data-chip]');
      if (chip) setChip(g, chip.dataset.chip!);
    }),
  );

  const done = () => {
    showForm(false);
    sent.focus({ preventScroll: true });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (trap.value) return done(); // a bot filled the hidden field
    const data = collect();
    if (!ENDPOINT) {
      console.warn('PUBLIC_QUOTE_ENDPOINT is not set, the quote request was not sent:', data);
      return done();
    }
    submit.disabled = true;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(String(res.status));
      done();
    } catch {
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  root.querySelector('[data-quote-again]')!.addEventListener('click', () => {
    form.reset();
    form.querySelectorAll<HTMLElement>('[data-chips]').forEach((g) => setChip(g, ''));
    showForm(true);
  });
}
