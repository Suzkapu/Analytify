# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-account-data.spec.ts >> Settings Account and Data preserve consent across live resizing (no-preference, height 1000)
- Location: e2e/design-v2-settings-account-data.spec.ts:7:7

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
  - main "Settings content" [ref=f1e27]:
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
        - region [ref=f1e53]:
          - heading "Data & privacy" [level=2] [ref=f1e54]
          - paragraph [ref=f1e55]: Manage your saved data, cloud backup and privacy.
          - generic [ref=f1e56] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e57]: 
            - generic [ref=f1e58]:
              - strong [ref=f1e59]: Cloud Backup
              - generic [ref=f1e60]: Selected snapshots and encrypted scheduled access
            - switch "Cloud Backup" [ref=f1e61]
          - button "Manage cloud backup" [ref=f1e62] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e63]: 
            - generic [aria-hidden] [ref=f1e65]: 
          - button "Clear data" [active] [ref=f1e66] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e67]: 
            - text: Clear data
  - text:   
  - contentinfo [ref=f1e68]:
    - generic [ref=f1e69]: Powered by Spotify
    - generic [ref=f1e70]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e71] [cursor=pointer]:
      - /url: /new/legal
```