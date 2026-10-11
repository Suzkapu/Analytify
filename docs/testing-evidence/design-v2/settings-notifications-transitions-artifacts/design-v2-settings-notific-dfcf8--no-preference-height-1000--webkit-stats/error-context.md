# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-notifications.spec.ts >> Notifications save independently of this device (no-preference, height 1000)
- Location: e2e/design-v2-settings-notifications.spec.ts:8:9

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
  - main "Settings content" [active] [ref=f1e27]:
    - generic "Settings" [ref=f1e29]:
      - generic [ref=f1e30]:
        - generic [ref=f1e32]:
          - heading "Settings" [level=1] [ref=f1e34]
          - paragraph [ref=f1e35]: Manage your account, notifications, updates and saved data.
        - navigation "Settings sections" [ref=f1e38]:
          - link "Account" [ref=f1e39] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e40]: 
          - link "Notifications" [ref=f1e42] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e43]: 
          - link "Updates" [ref=f1e45] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e46]: 
          - link "Data" [ref=f1e48] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e49]: 
          - text: 
        - region "Notification settings" [ref=f1e53]:
          - generic [ref=f1e54]:
            - strong [ref=f1e55]: Notifications are unavailable
            - paragraph [ref=f1e56]: Use a supported browser or install Analytify on this device.
          - link "How to install app" [ref=f1e58] [cursor=pointer]:
            - /url: /new/settings/install
            - generic [aria-hidden] [ref=f1e60]: 
          - generic [ref=f1e62] [cursor=pointer]:
            - generic [ref=f1e63]:
              - strong [ref=f1e64]: Song League pick window
              - generic [ref=f1e65]: Remind me when weekly picks open.
            - switch "Song League pick window" [checked] [ref=f1e67]
          - generic [ref=f1e69] [cursor=pointer]:
            - generic [ref=f1e70]:
              - strong [ref=f1e71]: New Song League pick
              - generic [ref=f1e72]: Notify me when someone submits a song.
            - switch "New Song League pick" [ref=f1e74]
          - generic [ref=f1e76] [cursor=pointer]:
            - generic [ref=f1e77]:
              - strong [ref=f1e78]: Stats access requests
              - generic [ref=f1e79]: Notify me when someone asks to view my stats.
            - switch "Stats access requests" [checked] [ref=f1e81]
          - paragraph [ref=f1e82]: Category preferences save automatically. Device permission is separate.
          - status [ref=f1e83]
  - text:   
  - contentinfo [ref=f1e84]:
    - generic [ref=f1e85]: Powered by Spotify
    - generic [ref=f1e86]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e87] [cursor=pointer]:
      - /url: /new/legal
```