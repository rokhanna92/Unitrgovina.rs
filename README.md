# Handoff: Unitrgovina website

## Overview
A premium single-page website for Unitrgovina (Padina, Kovačica, Serbia), a supplier of ready-mix concrete, washed aggregates, building materials, grain buy-up and heating fuel. One three.js scene runs behind the page as a story told by scrolling, "Od reke do temelja" (from the river to the foundation): stones in the river, screening, washed fractions, sieve lab, mixer truck, foundation. Content sections then slide over it.

## About the design files
The files in `design/` are **design references made in HTML**. They show the intended look and behaviour, but they are not production code to copy as is. Rebuild them in a real stack. No codebase exists yet, so the suggested stack is **Astro or Next.js (static export) + TypeScript + plain CSS or CSS modules + three.js**. The site is mostly static content with one heavy WebGL scene, so ship as little JS as possible.

`design/strata.js` (three.js scene, ~52 KB) is close to production quality. Port it as a TypeScript module instead of rewriting it.

To view the reference, serve the folder (`npx serve design`) and open `Unitrgovina.dc.html`. `support.js` is only the prototype runtime. Do not port it.

## Fidelity
**High fidelity.** Final colours, type, spacing, copy and motion. Match them pixel for pixel.

## Page structure (top to bottom)
Section labels and ids as they appear in the reference:
1. **Header**: wordmark UNITRGOVINA on the left; desktop links on the right (no numbers); phone gets a full-screen menu (numbered items). Background darkens on scroll.
2. **Hero**: "Građevinski materijal / Padina, Kovačica" (Archivo, large, tight), CTA buttons, price/info card (solid `rgba(20,20,17,.94)`, no backdrop blur).
3. **Lanac 01–06**: the scroll story, six steps pinned over the 3D canvas. Each step has a label, a heading and a short text. Scroll progress drives `strata.setProgress()`.
4. **Brojevi**: black numbers band, square corners, parallaxes up over the 3D scene ("Godina osnivanja" etc.).
5. **Usluge** `#usluge`: accordion of six services (Beton, Agregati, Građevinski materijal, Gradnja, Poljoprivreda, Ogrev). The label column has a fixed width so titles and descriptions line up. The "+" turns 45° when a row is open, and the row height animates via `grid-template-rows: 0fr → 1fr`.
6. **Beton** `#beton`: MB10–MB50, pumps 28/36/42 m, lab and certificates.
7. **Agregati** `#agregati`: filter chips by task (Sve, Beton, Malter i košuljica, Drenaža, Dvorište i staze, Podloga za put, Stabilizacija tla), a list of seven fractions with a photo per fraction, and a size-range bar. Order sends you to the quote form with the fraction preselected.
8. **Galerija** `#galerija`: project cards with category, title and subtitle.
9. **Žito za zid** `#zito`: grain-for-materials programme with daily prices.
10. **Ogrev** `#ogrev`: wood, coal, pellets, with delivery.
11. **O nama** `#o-nama`: company story.
12. **Lokacije** `#lokacije`: location switcher (Padina, Samoš, Jarkovac separation). The map is an OpenStreetMap embed and is **static**: `pointer-events:none`, no zoom or drag, so the page scrolls over it.
13. **Ponuda** `#ponuda`: multi-step quote form.
14. **Footer**: giant UNITRGOVINA word with extra space below it (`clamp(40px,7vh,80px)` desktop, 132px mobile).

All copy is in the reference file. Keep it verbatim (Serbian Latin). The data arrays (services, fractions, gallery, locations, prices) are in the logic class at the bottom of `Unitrgovina.dc.html`: `SVC`, `FR`, `TASKS`, `G` etc. Move them into JSON/content files.

## Design tokens
Colours:
- `#0E0E0C` page background / ink on light
- `#F1EEE7` primary text on dark / light section background
- `#E3A83F` accent amber (hover `#EDB956`)
- `#171714`, `#1A1A17`, `#2E2C28` raised dark surfaces
- `#A3A097` muted text on dark; `#5C5850` muted text on light; `#5A5751` secondary
- `#CFCBC2`, `#D9D3C6`, `#E7E2D7` light neutrals and lines
- `#2B2416`, `#3A3020` warm dark (amber-tinted panels)
- `#58B67F` status green ("open now" / live price)
- Lines: `rgba(14,14,12,.22)` on light, `rgba(241,238,231,.4)` on dark

Type (Google Fonts):
- **Archivo** (variable wdth 62–125, wght 300–900): headings, display numbers, footer wordmark
- **Instrument Sans** (400–700): body and UI
- **Geist Mono** (400/500): labels, units, small caps metadata
- Headings use `clamp()` sizes, chosen so each section fits on one screen from phone to 32" monitor. Copy the exact clamps from the reference.

Shape: square corners on the dark bands and buttons, as in the reference. Selection colour is amber on `#0E0E0C`.

## Interactions and motion
- **Smooth scroll**: wheel and keyboard (arrows, PgUp/PgDn, Space, Home/End) feed one eased target-follow loop. Native touch scroll stays untouched. Turn it off for `prefers-reduced-motion`.
- **Scroll handling**: one rAF-throttled handler. It reads layout once per frame and writes only `transform`/`opacity`. Never use layout-affecting properties during scroll.
- **3D scene** (`createStrata(canvas, overlay, opts)`):
  - stones drift over time, not tied to scroll, so they don't twitch
  - three stone shapes (pebble, cobble, crushed), with procedural blotchy textures
  - sand is a low heap of fine grains; each fraction has its own colour
  - detailed mixer truck; sieve test with three sieves and a tray
  - **performance**: fixed pixel budget (~2.3 MP, 1.1 MP in lite mode). A 4K TV renders like a laptop. No MSAA on big screens. Lite mode is forced on TV browsers. Adaptive quality with hysteresis, and shadows update less often as a last fallback.
- **Parallax**: the numbers band and the "Godina osnivanja" row slide up over the fixed canvas.
- Accordion and fraction picker: 300–450 ms ease-out transitions. Arrows, "+" signs and circles are exact centred icons.

## Responsive
Breakpoints in the reference: mobile < 760px, tablet, desktop ≥ 1100px. It must work on phones, tablets, an HP Spectre (high-DPI laptop), 28"/32" monitors and TVs. Test that every section fits on one screen.

## Assets still needed (from the client)
- Real photos for the seven fraction frames (`frakcija-f1, f2, f3, f4, ib, mix, dk`), plus the service and gallery photos. The `image-slot` placeholders name what each one should show.
- Slovak versions of the menu and hero lines, checked by a native speaker
- Confirmed grain prices and map coordinates for each location
- Logo files, if a real logo exists (the wordmark is currently plain set type)

## Files
- `design/Unitrgovina.dc.html`: full page reference (template + data + scroll logic)
- `design/strata.js`: three.js scene. Port it.
- `design/image-slot.js`, `design/support.js`: prototype runtime only
- `docs/original-brief.md`: client brief
- `PROMPT.md`: prompt to paste into Claude Code
