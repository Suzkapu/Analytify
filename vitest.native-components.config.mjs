import {resolve} from 'node:path';
import {playwright} from '@vitest/browser-playwright';

export default {
  test: {
    update: 'none',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({contextOptions: {viewport: {width: 1400, height: 3400}}}),
      api: {port: 63316, strictPort: true, host: '127.0.0.1'},
      expect: {
        toMatchScreenshot: {
          comparatorOptions: {allowedMismatchedPixels: 0, allowedMismatchedPixelRatio: 0, threshold: 0.1},
          resolveScreenshotPath: ({root, testFileName, arg, browserName, platform, ext}) =>
            resolve(root, 'e2e/components/__screenshots__', testFileName, `${arg}-${browserName}-${platform}${ext}`),
        },
      },
      instances: [
        {browser: 'chromium', provider: playwright({contextOptions: {viewport: {width: 1400, height: 3400}}, launchOptions: {channel: 'chromium'}})},
        {browser: 'firefox'},
        {browser: 'webkit', provider: playwright({contextOptions: {viewport: {width: 1400, height: 3400}}, launchOptions: process.env.ANALYTIFY_WEBKIT_EXECUTABLE ? {executablePath: process.env.ANALYTIFY_WEBKIT_EXECUTABLE} : {}})},
      ],
    },
  },
};
