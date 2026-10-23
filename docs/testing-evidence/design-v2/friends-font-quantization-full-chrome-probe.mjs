import {chromium} from 'playwright';
import {readFileSync, writeFileSync} from 'node:fs';
const font = readFileSync('node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2').toString('base64');
const samples = [];
for (const hinting of ['full-chrome-default']) {
  const browser = await chromium.launch({channel:'chromium'});
  try {
    for (const deviceScaleFactor of [1, 2.625]) {
      const page = await browser.newPage({deviceScaleFactor});
      await page.setContent(`<style>@font-face{font-family:Probe;src:url(data:font/woff2;base64,${font});font-weight:100 900}p{width:222px;font:400 16px/24px Probe;margin:0}</style><p>Disables this invitation’s private link and QR code. Existing friendships are unchanged.</p>`);
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        ctx.font = '400 16px Probe';
        const text = 'Disables this invitation’s private';
        return {text, width:ctx.measureText(text).width, glyphs:[...new Set(text)].map(char => ({char,width:ctx.measureText(char).width})), bodyHeight:document.querySelector('p').getBoundingClientRect().height, fontsStatus:document.fonts.status, devicePixelRatio, fontLoaded:document.fonts.check('400 16px Probe'), userAgent:navigator.userAgent};
      });
      samples.push({hinting,deviceScaleFactor,...metrics}); await page.close();
    }
  } finally {await browser.close();}
}
writeFileSync('docs/testing-evidence/design-v2/friends-font-quantization-full-chrome-result.json', JSON.stringify({scope:'Isolated local bundled WOFF2 font metrics only; no application server/network/data.',browser:'Playwright Chromium153.0.8010.12 full Chrome modern headless revision1243',samples},null,2)+'\n');
console.log(JSON.stringify(samples.map(({hinting,deviceScaleFactor,width,bodyHeight,glyphs})=>({hinting,deviceScaleFactor,width,bodyHeight,fractionalGlyphCount:glyphs.filter(x=>x.width%1!==0).length})),null,2));
