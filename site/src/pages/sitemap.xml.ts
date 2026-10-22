import type { APIRoute } from 'astro';
import { homePath, skReady } from '../i18n';
import { site } from '../site';

export const GET: APIRoute = () => {
  const paths = skReady ? Object.values(homePath) : [homePath.sr];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site.url).href}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
