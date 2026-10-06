import {test as base, expect} from '@playwright/test';

/** All browser workflows run offline except for the local application server. */
export const test = base.extend<{isolatedNetwork: void}>({
  isolatedNetwork: [async ({context}, use) => {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue();
      // Page-specific service mocks take precedence. Any unmocked remote request
      // fails closed, including requests to the development build's cloud URL.
      return route.abort('blockedbyclient');
    });
    await use();
  }, {auto: true}]
});
export {expect};
