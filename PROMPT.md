Paste this into Claude Code (VS Code), opened at this folder:

---

Build the production Unitrgovina website from the design in this folder.

1. Read `README.md` and `docs/original-brief.md`, then study `design/Unitrgovina.dc.html` and `design/strata.js` closely. The HTML file is a high-fidelity design reference. It is not production code. Serve it with `npx serve design` to see it running.
2. Set up the site in `site/` with Astro + TypeScript, static output. Use plain CSS with custom properties for the tokens in README. Install three.js from npm (pin 0.160).
3. Port `strata.js` to `site/src/scene/strata.ts` with no visual changes. Keep the pixel budget, TV lite mode, adaptive quality and time-based stone drift. Load the scene lazily, after first paint.
4. Rebuild every section in order as Astro components: Header, Hero, Lanac 01–06, Brojevi, Usluge, Beton, Agregati, Galerija, Žito za zid, Ogrev, O nama, Lokacije, Ponuda, Footer. Copy the text verbatim. Match exact colours, fonts, `clamp()` sizes, spacing and transitions from the reference.
5. Move the data (services, fractions, tasks, gallery, locations, prices) into `site/src/content/*.json`.
6. Use small islands of vanilla TS for the interactive parts: smooth wheel and keyboard scroll (off for reduced motion and touch), one rAF scroll handler that writes only transform/opacity, the services accordion, the fraction filter and picker, the location switcher with a static non-interactive map, and the multi-step quote form with validation.
7. Replace `image-slot` placeholders with `<img>`/`<picture>` (AVIF/WebP, lazy, with width and height). Use clearly named placeholder files until the real photos arrive.
8. Set up i18n so Serbian (sr-Latn) is the default and Slovak (sk) can be added. Leave the Slovak strings as TODOs.
9. Add SEO meta, Open Graph, LocalBusiness JSON-LD for each location, a favicon, and sitemap.
10. Check it at 375, 768, 1280, 1440, 2560 and 3840 px wide: each section should fit on one screen, with no layout shift and smooth 60 fps scrolling. Aim for Lighthouse ≥ 90 on mobile.

Work in small commits. Before you start, tell me your plan and list anything in the design that is unclear.
