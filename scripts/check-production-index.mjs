import {existsSync, readFileSync} from 'node:fs';

const indexPath = 'dist/spoti-front/index.html';
const html = readFileSync(indexPath, 'utf8');
const stylesheetLinks = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)].map(match => match[0]);

if (!/<meta\b[^>]*\bname=["']viewport["'][^>]*\bcontent=["'][^"']*width=device-width[^"']*["']/i.test(html)) {
  throw new Error('Production index is missing a device-width viewport declaration.');
}

if (stylesheetLinks.length === 0) {
  throw new Error('Production index does not contain a stylesheet link.');
}

for (const link of stylesheetLinks) {
  if (/\bmedia=["']print["']/i.test(link) || /\bonload=/i.test(link)) {
    throw new Error(`Production stylesheet activation depends on inline JavaScript blocked by CSP: ${link}`);
  }
  const href = link.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (!href || !existsSync(`dist/spoti-front/${href.replace(/^\//, '')}`)) {
    throw new Error(`Production stylesheet is missing from the build artifact: ${href || '(no href)'}`);
  }
}

console.log(`Production index check passed (${stylesheetLinks.length} directly active stylesheet link).`);
