# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Desktop sidebar keeps geometry and mobile independence (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:42:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - complementary "Desktop sidebar" [ref=f1e7]:
    - generic [ref=f1e9]:
      - button "Collapse navigation sidebar" [expanded] [active] [ref=f1e10] [cursor=pointer]:
        - generic [ref=f1e11]: Analytify
      - navigation "All destinations" [ref=f1e12]:
        - generic [ref=f1e13]:
          - paragraph [ref=f1e14]: Library
          - link "Playlists" [ref=f1e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f1e16]: 
        - generic [ref=f1e18]:
          - paragraph [ref=f1e19]: Listening
          - link "Stats" [ref=f1e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f1e21]: 
          - link "History" [ref=f1e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f1e24]: 
        - generic [ref=f1e26]:
          - paragraph [ref=f1e27]: Social
          - link "Friends" [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Song Leagues" [ref=f1e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f1e32]: 
          - link "Private Sharing" [ref=f1e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f1e35]: 
        - generic [ref=f1e37]:
          - paragraph [ref=f1e38]: Tools
          - link "Compare playlists" [ref=f1e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f1e40]: 
      - link "Settings" [ref=f1e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f1e44]: B
        - generic [ref=f1e45]:
          - strong [ref=f1e46]: Browser test user
          - generic [ref=f1e47]: Settings
  - banner [ref=f1e48]:
    - generic [ref=f1e49]:
      - link "Analytify playlists" [ref=f1e50] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e51]: Analytify
      - text:   
      - generic [ref=f1e52]:
        - button "Open navigation menu" [ref=f1e53] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e54]: 
          - generic [ref=f1e55]: Menu
        - button "Open account and data settings" [ref=f1e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e57]: 
  - main "Settings content" [ref=f1e58]:
    - generic "Settings" [ref=f1e60]:
      - generic [ref=f1e61]:
        - generic [ref=f1e63]:
          - heading "Settings" [level=1] [ref=f1e65]
          - paragraph [ref=f1e66]: Manage your account, notifications, updates and saved data.
        - navigation "Settings sections" [ref=f1e69]:
          - link "Account" [ref=f1e70] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e71]: 
          - link "Notifications" [ref=f1e73] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e74]: 
          - link "Updates" [ref=f1e76] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e77]: 
          - link "Data" [ref=f1e79] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e80]: 
          - text: 
        - region [ref=f1e84]:
          - heading "Bottom navigation" [level=2] [ref=f1e85]
          - paragraph [ref=f1e86]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - status [ref=f1e87]: 3 of 5 shortcuts selected
          - generic "Bottom navigation shortcuts" [ref=f1e88]:
            - button "Playlists" [pressed] [ref=f1e90] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e91]: 
            - button "Stats" [pressed] [ref=f1e94] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e95]: 
            - button "History" [pressed] [ref=f1e98] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e99]: 
            - button "Friends" [ref=f1e102] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e103]: 
            - button "Song Leagues" [ref=f1e106] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e107]: 
            - button "Private Sharing" [ref=f1e110] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e111]: 
            - button "Compare" [ref=f1e114] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e115]: 
  - text:   
  - contentinfo [ref=f1e117]:
    - generic [ref=f1e118]: Powered by Spotify
    - generic [ref=f1e119]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e120] [cursor=pointer]:
      - /url: /new/legal
```