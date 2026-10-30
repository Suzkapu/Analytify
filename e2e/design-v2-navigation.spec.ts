import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
import {writeFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';

// Record ancestor motion as well as tile geometry: a static child can still be
// squeezed by an unintended transition on its shell.
async function navigationRenderState(page: Page) {
  return page.evaluate(() => {
    const measure = () => {
      const shell = document.querySelector('.design-v2')!, sidebar = document.querySelector('.v2-sidebar');
      return {width: innerWidth, mobile: matchMedia('(max-width:760px)').matches,
        shellPadding: getComputedStyle(shell).paddingLeft,
        shellTransition: getComputedStyle(shell).transitionProperty,
        sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
        sidebarTransition: sidebar ? getComputedStyle(sidebar).transitionProperty : 'absent',
        animations: [shell, sidebar].filter((node): node is Element => !!node).flatMap(node =>
          node.getAnimations().map(animation => ({state: animation.playState,
            property: 'transitionProperty' in animation ? String(animation.transitionProperty) : 'animation'}))),
        sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : 'absent'};
    };
    return measure();
  });
}

async function prepareNavigation(page: Page, motion: 'no-preference' | 'reduce') {
  await observeNativeTransitions(page); await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  const unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:54321/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'get_public_site_settings') return route.fulfill({json: {}});
    if (name === 'is_app_admin') return route.fulfill({json: false});
    unexpected.push(route.request().url()); return route.abort('blockedbyclient');
  });
  await seedAuthenticatedBrowser(page);
  return {unexpected, errors};
}

test('Navigation preferences match canonical section typography and responsive layout', async ({page}, info) => {
  const {unexpected, errors} = await prepareNavigation(page, 'reduce');
  await page.goto('/settings/navigation');
  const panel = page.locator('v2-settings-navigation-preferences');
  await expect(panel.getByRole('status')).toHaveText('3 of 5 shortcuts selected');
  const samples = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 867});
    const sample = await panel.evaluate(element => {
      const heading = element.querySelector('h2')!, css = getComputedStyle(heading);
      const bounds = heading.getBoundingClientRect();
      return {width: innerWidth, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight,
        height: bounds.height, overflow: document.documentElement.scrollWidth > innerWidth};
    });
    // Canonical688:41748 uses Section20/600/28 in a24px text box.
    // The reference is external to the implementation's component stylesheet.
    expect(sample).toMatchObject({fontSize: '20px', fontWeight: '600', lineHeight: '28px', height: 24, overflow: false});
    samples.push(sample);
  }
  for (const [name, width] of [['desktop', 1440], ['mobile', 390]] as const) {
    await page.setViewportSize({width, height: 867});
    await panel.screenshot({path: info.outputPath(`candidate-navigation-preferences-${name}.png`), animations: 'disabled', scale: 'css'});
  }
  // Canonical25:29 specifies desktop resize continuity for this mobile-only
  // destination. Component approvals do not add a desktop discovery affordance.
  await page.setViewportSize({width: 1440, height: 867});
  await expect(page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Navigation', exact: true})).toBeHidden();
  await expect(panel).toHaveScreenshot('navigation-preferences-desktop.png', {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  await page.setViewportSize({width: 390, height: 867});
  await expect(page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Navigation', exact: true})).toHaveAttribute('aria-current', 'page');
  await expect(panel).toHaveScreenshot('navigation-preferences-mobile.png', {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  await writeFile(info.outputPath('navigation-section-typography.json'), JSON.stringify({samples, unexpected, errors}, null, 2));
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`Settings account and data actions stay reachable (${motion})`, async ({page}, info) => {
    const {unexpected, errors} = await prepareNavigation(page, motion);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 900});
      await page.goto('/settings/navigation');
      await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
      if (width > 760) {
        await page.getByRole('complementary', {name: 'Desktop sidebar'}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
      } else {
        await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
        await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
      }
      await expect(page).toHaveURL(/\/settings\/account$/);
      const account = page.getByRole('region', {name: 'Account settings'});
      await expect(account.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
      await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
      await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(account.getByRole('link', {name: 'Legal & privacy'})).toHaveAttribute('href', '/legal');
      await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Data', exact: true}).press('Enter');
      await expect(page.getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
      await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
      const dialog = page.getByRole('alertdialog', {name: 'What would you like to clear?'});
      await expect(dialog.getByRole('button', {name: 'Clear this browser and log out'})).toBeVisible();
      await expect(dialog.getByRole('button', {name: 'Delete cloud data and leave shared features'})).toBeVisible();
      await dialog.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', {name: 'Clear data', exact: true})).toBeFocused();
      await expectNoBlockingAxeViolations(page);
    }
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('settings-access.json'), JSON.stringify({motion, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
  test(`Canonical app header, gutters and document footer (${motion})`, async ({page}, info) => {
    const {unexpected, errors} = await prepareNavigation(page, motion);
    await page.goto('/settings/account');
    await expect(page.getByRole('region', {name: 'Account settings'})).toBeVisible();
    const geometry = [];
    for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
      await page.setViewportSize({width, height});
      await page.evaluate(() => window.scrollTo(0, 0));
      const mobile = width <= 760;
      const header = page.locator('.v2-header');
      if (mobile) {
        await expect(header.getByRole('link', {name: 'Analytify playlists'})).toBeVisible();
        await expect(header.getByRole('button', {name: 'Open navigation menu', exact: true})).toBeVisible();
      } else await expect(header).toBeHidden();
      await expect(page.getByRole('button', {name: 'Open account and data settings', exact: true})).toHaveCount(0);
      const sample = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector)!, rect = element.getBoundingClientRect(), css = getComputedStyle(element);
          return {x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height, bottom: rect.bottom + scrollY,
            paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, fontSize: css.fontSize, fontWeight: css.fontWeight,
            lineHeight: css.lineHeight, whiteSpace: css.whiteSpace, background: css.backgroundColor, borderTop: css.borderTopWidth};
        };
        return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight, header: box('.v2-header'), logo: box('.v2-brand img'),
          brand: box('.v2-brand'), menu: box('.v2-tools-button'), heading: box('main h1'), main: box('main'),
          body: box('.v2-page'), tabs: box('.v2-settings-navigation'), profile: box('.v2-settings-profile'), footer: box('.v2-footer'), legal: box('.v2-footer a'), caption: box('.v2-footer > span'),
          shield: getComputedStyle(document.querySelector('.v2-footer .v2-footer-shield')!).display,
          shieldSlot: box('.v2-footer .v2-footer-shield'), shieldImage: box('.v2-footer .v2-footer-shield img'),
          shieldAsset: (() => {const img = document.querySelector('.v2-footer .v2-footer-shield img') as HTMLImageElement;
            return {loaded: img.complete && img.naturalWidth === 20 && img.naturalHeight === 20, src: img.getAttribute('src'), alt: img.alt};})()};
      });
      expect(sample.scrollWidth).toBeLessThanOrEqual(width);
      expect(sample.heading.x).toBe(mobile ? 16 : 256 + 32);
      expect(sample.heading.y).toBe(mobile ? 72 + 16 : 32);
      expect(sample.profile.y - sample.tabs.bottom).toBe(mobile ? 12 : 16);
      expect(sample.footer.y).toBeGreaterThanOrEqual(sample.body.bottom + 16);
      expect(sample.footer.bottom).toBe(sample.documentHeight - (mobile ? 86 : 0));
      expect(sample.footer).toMatchObject({background: 'rgba(0, 0, 0, 0)', borderTop: '0px', paddingLeft: mobile ? '16px' : '40px', paddingRight: mobile ? '16px' : '40px'});
      expect(sample.caption).toMatchObject({fontSize: '14px', lineHeight: '20px', fontWeight: '400', height: 20});
      expect(sample.legal).toMatchObject({width: mobile ? 129 : 160, height: 48, fontSize: '14px', lineHeight: '20px', fontWeight: '600', whiteSpace: 'nowrap'});
      if (!mobile && width >= 1024) expect(sample.footer.height).toBe(48);
      if (mobile) {
        expect(sample.header).toMatchObject({height: 72, y: 0});
        expect(sample.logo).toMatchObject({width: 32, height: 32, x: 16});
        expect(sample.brand).toMatchObject({fontSize: '20px', lineHeight: '28px', fontWeight: '600'});
        expect(sample.menu).toMatchObject({width: 100, height: 48});
        expect(sample.shield).toBe('none');
      } else {
        expect(sample.shield).not.toBe('none');
        expect(sample.shieldSlot).toMatchObject({width: 18, height: 18});
        expect(sample.shieldImage).toMatchObject({width: 20, height: 20});
        expect(sample.shieldAsset).toEqual({loaded: true, src: 'assets/design-v2/footer-shield.svg', alt: ''});
      }
      geometry.push(sample);
    }
    await page.setViewportSize({width: 1440, height: 1000});
    await page.screenshot({path: info.outputPath('shell-desktop.png'), fullPage: true, animations: 'disabled'});
    // Component baselines were individually inspected against canonical Figma;
    // the review ledger records their hashes. Full-page parity remains open.
    // Match candidate capture's native device scale explicitly; screenshot assertions otherwise default to CSS pixels.
    const visual = {animations: 'disabled' as const, scale: 'device' as const, style: '.ambient-dots {transform:none !important;}'};
    if (motion === 'reduce') {
      // Capture every candidate before any assertion so an intentional backdrop
      // change can be reviewed per component without automatic baseline updates.
      await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-desktop.png')});
      await page.setViewportSize({width: 390, height: 900});
      await page.locator('.v2-header').screenshot({...visual, path: info.outputPath('candidate-header-mobile.png')});
      await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-mobile.png')});
      await page.setViewportSize({width: 1440, height: 1000});
      await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-desktop.png', visual);
    }
    await page.setViewportSize({width: 390, height: 900});
    await page.screenshot({path: info.outputPath('shell-mobile.png'), fullPage: true, animations: 'disabled'});
    if (motion === 'reduce') {
      await expect(page.locator('.v2-header')).toHaveScreenshot('shell-header-mobile.png', visual);
      await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-mobile.png', visual);
    }
    const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
    await menu.focus(); await expect(menu).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
    await menu.press('Space');
    await expect(page.getByRole('dialog', {name: 'Navigation menu', exact: true})).toBeVisible();
    await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    await page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true}).focus();
    await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toBeFocused();
    await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
    await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('border-color', 'rgb(53, 231, 131)');
    await expectNoBlockingAxeViolations(page); await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('shell-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
  test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
    const {unexpected, errors} = await prepareNavigation(page, motion);
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/settings/navigation');
    await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
    const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
    if (motion === 'reduce') {
      await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
      await expect(sidebar).toHaveCSS('transition-property', 'none');
    }
    const geometry = [];
    for (const width of [761, 1024, 1440, 1920]) {
      for (const height of [480, 900]) {
        await page.setViewportSize({width, height});
        for (const compact of [false, true]) {
          const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
          if (await toggle.count()) await toggle.press('Enter');
          const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
          await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
          const responsiveFrame = await navigationRenderState(page);
          // All destinations stay accessible in both modes; collect them in one
          // browser round trip at each size rather than eight separate queries.
          expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
            link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
            'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
          ]);
          const sample = await sidebar.evaluate(element => {
            const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
            const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
            const group = element.querySelector('.navigation-groups')!;
            const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
            const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
            const surface = getComputedStyle(panel, '::before');
            return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
              profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
              iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
              listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
              surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
              contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
              overflow: document.documentElement.scrollWidth - innerWidth};
          });
          expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
          expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
          expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
          expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
          expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
          expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
          expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
          geometry.push({...sample, compact, responsiveFrame});
        }
      }
    }
    await page.setViewportSize({width: 1440, height: 900});
    await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
    await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
    await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
    await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
    await expectNoBlockingAxeViolations(page);
    await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
    await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
    const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
    await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width: 1440, height: 900});
    await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
  test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
    await page.addInitScript(() => {
      const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
        writes: [] as {key: string; value: unknown}[]};
      Object.assign(window, {analytifyPreferenceFaults: faults});
      const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
        if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
          faults.readFailures--; faults.failedReads++;
          throw new DOMException('Synthetic device read failure', 'UnknownError');
        }
        return get.call(this, key);
      };
      IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const entry = value as {key?: unknown; value?: unknown};
        if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
          faults.writes.push({key: entry.key, value: entry.value});
          if (faults.writeFailures > 0) {
            faults.writeFailures--; faults.failedWrites++;
            throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
          }
        }
        return key === undefined ? put.call(this, value) : put.call(this, value, key);
      };
    });
    const {unexpected, errors} = await prepareNavigation(page, motion);
    await page.setViewportSize({width: 600, height: 900});
    await page.goto('/settings/navigation');
    const panel = page.locator('v2-settings-navigation-preferences');
    const choices = panel.locator('.shortcut-choice');
    const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
    const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
    const geometry = [];
    const measureFeedback = async () => {
      const sample = await panel.locator('v2-inline-status section').evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = (selector: string) => {
          const node = element.querySelector(selector)!, box = node.getBoundingClientRect(), css = getComputedStyle(node);
          return {width: box.width, height: box.height, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight};
        };
        return {viewport: innerWidth, width: rect.width, height: rect.height, right: rect.right,
          title: style('strong'), description: style('p'), action: style('button'), icon: style('.pi-sync')};
      });
      expect(sample.right).toBeLessThanOrEqual(sample.viewport);
      expect(sample.title).toMatchObject({fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
      expect(sample.description).toMatchObject({fontSize: '14px', fontWeight: '400', lineHeight: '20px'});
      // Canonical16px inner padding and1px borders leave254px at320; the action caps at260.
      expect(sample.action).toMatchObject({width: Math.min(260, sample.width - 34), height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
      expect(sample.icon).toMatchObject({width: 18, height: 18, fontSize: '18px'});
      if (sample.viewport === 600) expect(sample).toMatchObject({width: 568, height: 138});
      geometry.push(sample);
    };
    await expect(panel.getByRole('alert')).toContainText('Navigation preferences could not be loaded');
    await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
    await measureFeedback();
    await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
    await page.setViewportSize({width: 600, height: 900});
    await expect(choices).toHaveCount(7);
    for (const button of await choices.all()) await expect(button).toBeDisabled();
    await expect(bar).toHaveCount(0);
    await expectNoBlockingAxeViolations(page);
    await panel.screenshot({path: info.outputPath('navigation-read-error.png'), animations: 'disabled'});
    await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect(count).toHaveText('3 of 5 shortcuts selected');
    const friends = panel.getByRole('button', {name: 'Friends', exact: true});
    await expect(friends).toBeEnabled(); await friends.press('Enter');
    await expect(panel.getByRole('alert')).toContainText('Navigation changes could not be saved');
    await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
    await measureFeedback();
    await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
    await page.setViewportSize({width: 600, height: 900});
    await expect(count).toHaveText('3 of 5 shortcuts selected');
    await expect(friends).toHaveAttribute('aria-pressed', 'false');
    await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
    await expectNoBlockingAxeViolations(page);
    await panel.screenshot({path: info.outputPath('navigation-write-error.png'), animations: 'disabled'});
    await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect(friends).toBeEnabled();
    await expect(friends).toHaveAttribute('aria-pressed', 'true');
    await expect(count).toHaveText('4 of 5 shortcuts selected');
    await expect(panel.getByRole('alert')).toHaveCount(0);
    const faults = await page.evaluate(() => (window as unknown as {analytifyPreferenceFaults: {
      failedReads: number; failedWrites: number; writes: {key: string; value: unknown}[]
    }}).analytifyPreferenceFaults);
    expect(faults.failedReads).toBe(1); expect(faults.failedWrites).toBe(1);
    expect(faults.writes).toHaveLength(2); expect(faults.writes[1]).toEqual(faults.writes[0]);
    expect(faults.writes[1].value).toBe('["playlists","stats","history","friends"]');
    const saved = await page.evaluate(() => new Promise<{key: string; value: string}[]>((resolve, reject) => {
      const open = indexedDB.open('AnalytifyDB', 4);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, entries: {key: string; value: string}[] = [];
        const tx = db.transaction(['appData', 'featureData'], 'readonly');
        for (const store of ['appData', 'featureData']) {
          const read = tx.objectStore(store).getAll();
          read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
        }
        tx.onabort = () => {db.close(); reject(tx.error);};
        tx.oncomplete = () => {db.close(); resolve(entries);};
      };
    }));
    expect(saved).toEqual([faults.writes[1]]);
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, geometry, faults, saved, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
  test(`Device shortcut limits, responsive geometry and five-choice persistence (${motion})`, async ({page}, info) => {
    const {unexpected, errors} = await prepareNavigation(page, motion);
    await page.goto('/settings/navigation');
    const panel = page.locator('v2-settings-navigation-preferences');
    const choice = (name: string) => panel.getByRole('button', {name, exact: true});
    const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
    const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
    await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
    await expect(count).toHaveText('3 of 5 shortcuts selected');
    await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
    await choice('Friends').press('Enter');
    await expect(count).toHaveText('4 of 5 shortcuts selected');
    await expect(choice('Song Leagues')).toBeEnabled();
    await choice('Song Leagues').press('Enter');
    await expect(count).toHaveText('5 of 5 shortcuts selected');
    await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
    await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/friends');
    await expect(choice('Private Sharing')).toBeEnabled();
    await choice('Private Sharing').press('Enter');
    await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
    await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
    const geometry = [];
    for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
      await page.setViewportSize({width, height});
      const responsiveFrame = await navigationRenderState(page);
      const sample = await panel.evaluate(element => {
        const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
          const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
          const icon = button.querySelector('i')!, label = button.querySelector('span')!;
          return {label: label.textContent, left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize,
            iconHeight: icon.getBoundingClientRect().height, labelHeight: label.getBoundingClientRect().height,
            padding: css.padding, gap: css.gap, lineHeight: css.lineHeight, width: rect.width,
            transition: css.transitionDuration, transitionProperty: css.transitionProperty};
        });
        const nav = document.querySelector('.v2-mobile-nav')!;
        const rect = nav.getBoundingClientRect();
        return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
          bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
            rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
      });
      expect(sample.scrollWidth).toBeLessThanOrEqual(width);
      for (const button of sample.buttons) {
        expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
        expect(button.height, JSON.stringify({viewport: {width: sample.width, height: sample.height}, button})).toBe(48); expect(button.fontSize).toBe('12px');
        if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
      }
      expect(sample.bar.visible).toBe(width <= 760);
      if (sample.bar.visible) {
        await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
        expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
        expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
      }
      geometry.push({...sample, responsiveFrame});
    }
    await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
    await expectNoBlockingAxeViolations(page);
    await page.reload();
    await expect(count).toHaveText('5 of 5 shortcuts selected');
    await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('navigation-choice-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
  test(`Empty shortcut persistence, reachable menu and focus recovery (${motion})`, async ({page}, info) => {
    const {unexpected, errors} = await prepareNavigation(page, motion);
    await page.goto('/settings/navigation');
    const panel = page.locator('v2-settings-navigation-preferences');
    const choice = (name: string) => panel.getByRole('button', {name, exact: true});
    const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
    const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
    await expect(count).toHaveText('3 of 5 shortcuts selected');
    await choice('Friends').press('Enter');
    await expect(choice('Song Leagues')).toBeEnabled();
    await choice('Song Leagues').press('Enter');
    await expect(count).toHaveText('5 of 5 shortcuts selected');
    await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
    for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
      // Selection updates optimistically; keyboard activation must wait for the
      // prior write to commit and re-enable the next user action.
      await expect(choice(label)).toBeEnabled();
      await choice(label).press('Enter');
      await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
      await expect(choice(label)).toBeEnabled();
    }
    await expect(count).toHaveText('0 of 5 shortcuts selected');
    await expect(bar).toHaveCount(0);
    await page.setViewportSize({width: 390, height: 900});
    await expect(page.locator('.design-v2')).toHaveCSS('padding-bottom', '0px');
    await page.reload();
    await expect(count).toHaveText('0 of 5 shortcuts selected');
    await expect(bar).toHaveCount(0);
    await page.setViewportSize({width: 390, height: 900});
    const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
    await menu.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
    await expect(dialog).toBeVisible();
    await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
      await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
    }
    const drawerGeometry = [];
    for (const width of [320, 390, 600, 768, 1024, 1440]) {
      for (const height of [480, 900]) {
        await page.setViewportSize({width, height});
        const sample = await dialog.evaluate(element => {
          const box = element.getBoundingClientRect();
          const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
          const groups = element.querySelector('.navigation-groups')!;
          return {width: innerWidth, height: innerHeight, x: box.x, y: box.y, drawerWidth: box.width,
            drawerHeight: box.height, profileBottom: profile.bottom, profileHeight: profile.height,
            listBottom: groups.getBoundingClientRect().bottom, listHeight: groups.clientHeight,
            listScroll: groups.scrollHeight, overflow: getComputedStyle(groups).overflowY,
            animation: getComputedStyle(element).animationName};
        });
        expect(sample.x).toBe(0); expect(sample.y).toBe(0);
        expect(sample.drawerWidth).toBe(Math.min(width, 320)); expect(sample.drawerHeight).toBe(height);
        expect(sample.profileBottom).toBe(height - 17); expect(sample.profileHeight).toBe(72);
        expect(sample.listBottom).toBeLessThanOrEqual(sample.profileBottom - 72 - 16);
        expect(sample.overflow).toBe('auto');
        if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
        if (motion === 'reduce') expect(sample.animation).toBe('none');
        drawerGeometry.push(sample);
      }
    }
    await page.setViewportSize({width: 390, height: 900});
    await dialog.getByRole('link', {name: 'Settings', exact: true}).focus();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Close navigation menu', exact: true})).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', {name: 'Settings', exact: true})).toBeFocused();
    await expectNoBlockingAxeViolations(page);
    await dialog.screenshot({path: info.outputPath('navigation-drawer.png'), animations: 'disabled'});
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
    await choice('Friends').press('Enter');
    await expect(count).toHaveText('1 of 5 shortcuts selected');
    await expect(choice('Friends')).toBeEnabled();
    await expect(panel.getByText('Saving navigation preferences', {exact: true})).toHaveCount(0);
    await expect(page.locator('.design-v2')).toHaveCSS('padding-bottom', '86px');
    await page.reload();
    await expect(count).toHaveText('1 of 5 shortcuts selected');
    await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
    await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
    await page.evaluate(() => document.fonts.ready);
    await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
    await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, drawerGeometry, unexpected, errors}, null, 2));
    expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  });
}
