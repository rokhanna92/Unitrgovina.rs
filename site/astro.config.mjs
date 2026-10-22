import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.unitrgovina.rs',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'sr',
    locales: ['sr', 'sk'],
    routing: { prefixDefaultLocale: false },
  },
});
