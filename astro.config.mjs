import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.unitrgovina.rs',
  trailingSlash: 'always',
  // one page, ~9 KB of CSS gzipped: inline it so first paint doesn't wait on a stylesheet request
  build: { inlineStylesheets: 'always' },
  i18n: {
    defaultLocale: 'sr',
    locales: ['sr', 'sk'],
    routing: { prefixDefaultLocale: false },
  },
});
