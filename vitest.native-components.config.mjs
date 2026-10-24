import {resolve} from 'node:path';
import {playwright} from '@vitest/browser-playwright';

export default {
  test: {
    update: 'none',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      api: {port: 63316, strictPort: true, host: '127.0.0.1'},
      expect: {
        toMatchScreenshot: {
          comparatorOptions: {allowedMismatchedPixels: 0, allowedMismatchedPixelRatio: 0, threshold: 0.1},
          resolveScreenshotPath: ({root, arg, browserName, platform, ext}) =>
            resolve(root, 'e2e/components/__screenshots__/friends-feedback.native.ts', `${arg}-${browserName}-${platform}${ext}`),
        },
      },
      instances: [
        {browser: 'chromium', provider: playwright({launchOptions: {channel: 'chromium'}})},
        {browser: 'firefox'},
        {browser: 'webkit', provider: playwright({launchOptions: process.env.ANALYTIFY_WEBKIT_EXECUTABLE ? {executablePath: process.env.ANALYTIFY_WEBKIT_EXECUTABLE} : {}})},
      ],
    },
  },
};
