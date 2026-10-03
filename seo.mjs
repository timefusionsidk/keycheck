// Post-build: adds canonical URL, og:url, sitemap.xml and the robots Sitemap line when VITE_SITE_URL is set.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const site = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
if (!site) {
  console.log('VITE_SITE_URL not set: skipping canonical URL and sitemap.');
  process.exit(0);
}
const paths = ['/', '/privacy', '/terms', '/contact'];
writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
);
appendFileSync('dist/robots.txt', `\nSitemap: ${site}/sitemap.xml\n`);
const html = readFileSync('dist/index.html', 'utf8').replace(
  '</head>',
  `<link rel="canonical" href="${site}/" /><meta property="og:url" content="${site}/" /></head>`,
);
writeFileSync('dist/index.html', html);
