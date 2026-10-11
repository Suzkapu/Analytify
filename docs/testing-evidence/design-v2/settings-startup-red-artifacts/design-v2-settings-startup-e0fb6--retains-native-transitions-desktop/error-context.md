# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-startup.spec.ts >> first Login renders directly and later Legal navigation retains native transitions
- Location: e2e/design-v2-settings-startup.spec.ts:6:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1
```

# Page snapshot

```yaml
- generic [ref=e5]:
  - link "Skip to main content" [ref=e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=e7]:
    - link "Analytify playlists" [ref=e9] [cursor=pointer]:
      - /url: /new/playlists
      - generic [ref=e10]: Analytify
  - main "Sign in content" [ref=e11]:
    - region [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]: Your Spotify library
        - heading "Explore your playlists." [level=1] [ref=e17]
        - paragraph [ref=e18]: Browse, search, share, and organize your Spotify playlists.
        - list "Analytify features" [ref=e19]:
          - listitem [ref=e20]:
            - generic [aria-hidden] [ref=e21]: 
            - generic [ref=e22]:
              - strong [ref=e23]: Your Spotify library
              - text: with fast playlist and song search
          - listitem [ref=e24]:
            - generic [aria-hidden] [ref=e25]: 
            - generic [ref=e26]:
              - strong [ref=e27]: Useful playlist tools
              - text: for summaries, merging, and sharing
          - listitem [ref=e28]:
            - generic [aria-hidden] [ref=e29]: 
            - generic [ref=e30]:
              - strong [ref=e31]: Stored on this device
              - text: unless a feature needs the cloud
      - article [ref=e32]:
        - generic [ref=e33]:
          - link "Analytify home" [ref=e34] [cursor=pointer]:
            - /url: /new/
            - generic [ref=e35]: Analytify
          - generic [ref=e36]: Welcome to Analytify
          - heading "Connect your Spotify account" [level=2] [ref=e37]
          - paragraph [ref=e38]: Sign in to load your Spotify library and playlists.
          - paragraph [ref=e39]: Spotify will be asked for your profile, saved songs, playlists, top songs and artists, and recently played songs. Analytify requests playlist write access only for playlist copies you choose to create. It never reads your password or payment details.
        - generic [ref=e40]:
          - generic [ref=e41] [cursor=pointer]:
            - checkbox "I agree to the Terms and acknowledge the Privacy Notice." [ref=e42]
            - generic [ref=e43]:
              - text: I agree to the
              - link "Terms" [ref=e44]:
                - /url: /new/legal#terms
              - text: and acknowledge the
              - link "Privacy Notice" [ref=e45]:
                - /url: /new/legal#privacy
              - text: .
          - group [ref=e46]:
            - generic "Terms version" [ref=e47] [cursor=pointer]
          - button "Continue with Spotify" [disabled] [ref=e48]
          - button "Advanced options" [ref=e52] [cursor=pointer]:
            - generic [aria-hidden] [ref=e54]: 
        - paragraph [ref=e55]:
          - generic [aria-hidden] [ref=e56]: 
          - text: Analytify never asks for your Spotify Client Secret. Personal-app sessions stay local unless you explicitly enable cloud features.
  - contentinfo [ref=e57]:
    - generic [ref=e58]: Powered by Spotify
    - generic [ref=e59]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=e60] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify} from './helpers/authenticated-browser';
  3  | import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
  4  | import {writeFile} from 'node:fs/promises';
  5  | 
  6  | test('first Login renders directly and later Legal navigation retains native transitions', async ({page}, info) => {
  7  |   await observeNativeTransitions(page); await mockSpotify(page);
  8  |   await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  9  |   const errors: string[] = [];
  10 |   page.on('pageerror', error => errors.push(error.message));
  11 |   page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  12 |   await page.goto('/new/login'); await expect(page.locator('app-login-page')).toBeVisible();
  13 |   const starts = () => page.evaluate(() => (window as Window & {analytifyNativeTransitionProbe: {starts: number}}).analytifyNativeTransitionProbe.starts);
> 14 |   expect(await starts()).toBe(0);
     |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  15 |   await expectNativeTransitionsSettled(page);
  16 |   await page.getByRole('link', {name: 'Terms', exact: true}).press('Enter');
  17 |   await expect(page).toHaveURL(/\/new\/legal#terms$/);
  18 |   await expect(page.getByRole('main', {name: 'Legal content'})).toBeVisible();
  19 |   await expectNativeTransitionsSettled(page); expect(await starts()).toBeGreaterThan(0);
  20 |   expect(errors).toEqual([]);
  21 |   await writeFile(info.outputPath('startup-navigation.json'), JSON.stringify({initialStarts: 0, laterStarts: await starts(), errors}, null, 2));
  22 | });
  23 | 
```