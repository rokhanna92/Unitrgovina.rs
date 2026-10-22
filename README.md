# Unitrgovina site

Astro (static output) + TypeScript + plain CSS. One page per language: `/` (sr-Latn) and `/sk/`.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # astro check + static build into dist/
npm run preview
```

## Where things live

| What | Where |
| --- | --- |
| Design tokens, base rules | `src/styles/global.css` |
| Sections | `src/components/*.astro`, composed in `src/components/Home.astro` |
| Copy (Serbian, Slovak overrides) | `src/i18n/sr.ts`, `src/i18n/sk.ts` |
| Data lists (services, fractions, gallery, prices, locations, quote form, seasons) | `src/content/*.json` |
| Scroll engine, islands | `src/scripts/` |
| 3D scene (lazy-loaded after first paint) | `src/scene/strata.ts` |
| Photos | `src/assets/photos/` (see the README there) |

## Before launch

- Set `PUBLIC_QUOTE_ENDPOINT` (see `.env.example`). Without it the quote form shows its success screen but sends nothing.
- Confirm grain prices in `src/content/prices.json`, addresses and hours (JSON-LD in `src/layouts/Base.astro`).
- Real photos into `src/assets/photos/`.
- Slovak: translate `src/i18n/sk.ts`, have a native speaker check it, then set `skReady = true` in `src/i18n/index.ts` (removes noindex, adds hreflang and the sitemap entry).
- Privacy policy page: the form links to it (`href="#"` for now).
