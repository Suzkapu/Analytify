export function validateProductionIndex(html, assetExists) {
  if (!/<meta\b[^>]*\bname=["']viewport["'][^>]*\bcontent=["'][^"']*width=device-width[^"']*["']/i.test(html)) {
    throw new Error('Production index is missing a device-width viewport declaration.');
  }

  const stylesheetLinks = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)]
    .map(match => match[0]);
  if (stylesheetLinks.length === 0) {
    throw new Error('Production index does not contain a stylesheet link.');
  }

  for (const link of stylesheetLinks) {
    if (/\bmedia=["']print["']/i.test(link) || /\bonload=/i.test(link)) {
      throw new Error(`Production stylesheet activation depends on inline JavaScript blocked by CSP: ${link}`);
    }
    const href = link.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !assetExists(href.replace(/^\//, ''))) {
      throw new Error(`Production stylesheet is missing from the build artifact: ${href || '(no href)'}`);
    }
  }

  return stylesheetLinks.length;
}

export function validateInitialModulePreloads(html, assetExists) {
  const links = [...html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi)];
  if (!links.length) throw new Error('Production index is missing initial module preload hints.');
  const assets = links.map(([link]) => link.match(/\bhref=["']([^"']+)["']/i)?.[1]);
  for (const asset of assets) {
    if (!asset || !/^chunk-[\w-]+\.js$/.test(asset) || !assetExists(asset)) {
      throw new Error(`Invalid initial module preload asset: ${asset || '(no href)'}`);
    }
  }
  if (new Set(assets).size !== assets.length) throw new Error('Duplicate initial module preload hints.');
  return assets.length;
}
