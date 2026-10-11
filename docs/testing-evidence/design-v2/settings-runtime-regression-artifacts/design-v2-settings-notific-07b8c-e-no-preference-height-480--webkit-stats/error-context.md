# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-notifications.spec.ts >> Notifications save independently of this device (no-preference, height 480)
- Location: e2e/design-v2-settings-notifications.spec.ts:7:9

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation "Main navigation" [ref=f1e11]:
        - link "Playlists" [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
        - link "Stats" [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
        - link "History" [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
      - generic [ref=f1e21]:
        - button "Open More tools" [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button "Open account and data settings" [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Install Analytify content" [active] [ref=f1e27]:
    - generic "Install Analytify" [ref=f1e29]:
      - generic [ref=f1e30]:
        - generic [ref=f1e33]:
          - heading "Install Analytify" [level=1] [ref=f1e34]
          - button "Back" [ref=f1e35] [cursor=pointer]
        - region "Installation and notification guidance" [ref=f1e37]:
          - heading "Install Analytify" [level=2] [ref=f1e38]
          - paragraph [ref=f1e39]: Open your browser menu and choose Install app. On iPhone, use Share → Add to Home Screen. Installation options depend on your browser.
          - article [ref=f1e40]:
            - heading "Notifications enabled on this device" [level=2] [ref=f1e41]
            - paragraph [ref=f1e42]: You can receive updates here.
            - generic [ref=f1e43]: Connected
          - article [ref=f1e44]:
            - heading "Notification permission required" [level=2] [ref=f1e45]
            - paragraph [ref=f1e46]: Choose Enable notifications in Settings, then allow notifications when your browser asks.
            - generic [ref=f1e47]: Pending
          - article [ref=f1e48]:
            - heading "Notifications are blocked" [level=2] [ref=f1e49]
            - paragraph [ref=f1e50]: Allow notifications in your browser settings, then return here.
            - generic [ref=f1e51]: Disabled
          - article [ref=f1e52]:
            - heading "Notifications are unavailable" [level=2] [ref=f1e53]
            - paragraph [ref=f1e54]: Use a supported browser or install Analytify on this device.
            - generic [ref=f1e55]: Unavailable
          - article [ref=f1e56]:
            - heading "Finish setting up this device" [level=2] [ref=f1e57]
            - paragraph [ref=f1e58]: Your preferences are saved. Enable notifications here to receive them on this device.
            - generic [ref=f1e59]: Pending
  - text:   
  - contentinfo [ref=f1e60]:
    - generic [ref=f1e61]: Powered by Spotify
    - generic [ref=f1e62]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e63] [cursor=pointer]:
      - /url: /new/legal
```