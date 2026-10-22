# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:213:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f3e5]:
  - link "Skip to main content" [ref=f3e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f3e7]:
    - generic [ref=f3e8]:
      - text:   
      - generic [ref=f3e9]: Settings
      - generic [ref=f3e11]:
        - button "Open navigation menu" [ref=f3e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e13]: 
          - generic [ref=f3e14]: Menu
        - button "Open account and data settings" [ref=f3e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e16]: 
  - main "Settings content" [ref=f3e17]:
    - generic "Settings" [ref=f3e19]:
      - generic [ref=f3e20]:
        - heading "Settings" [level=1] [ref=f3e24]
        - navigation "Settings sections" [ref=f3e27]:
          - link "Account" [ref=f3e28] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f3e29]: 
          - link "Notifications" [ref=f3e31] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f3e32]: 
            - generic [ref=f3e33]: Alerts
          - link "Updates" [ref=f3e34] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f3e35]: 
          - link "Data" [ref=f3e37] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f3e38]: 
          - link "Navigation" [ref=f3e40] [cursor=pointer]:
            - /url: /new/settings/navigation
            - generic [aria-hidden] [ref=f3e41]: 
        - region [ref=f3e45]:
          - heading "Bottom navigation" [level=2] [ref=f3e46]
          - paragraph [ref=f3e47]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - status [ref=f3e48]: 1 of 5 shortcuts selected
          - generic "Bottom navigation shortcuts" [ref=f3e49]:
            - button "Playlists" [ref=f3e51] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e52]: 
            - button "Stats" [ref=f3e55] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e56]: 
            - button "History" [ref=f3e59] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e60]: 
            - button "Friends" [pressed] [ref=f3e63] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e64]: 
            - button "Song Leagues" [ref=f3e67] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e68]: 
            - button "Private Sharing" [ref=f3e71] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e72]: 
            - button "Compare" [ref=f3e75] [cursor=pointer]:
              - generic [aria-hidden] [ref=f3e76]: 
  - navigation "Primary navigation" [ref=f3e78]:
    - link "Friends" [ref=f3e79] [cursor=pointer]:
      - /url: /new/friends
      - generic [aria-hidden] [ref=f3e80]: 
  - contentinfo [ref=f3e82]:
    - generic [ref=f3e83]: Powered by Spotify
    - generic [ref=f3e84]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f3e85] [cursor=pointer]:
      - /url: /new/legal
```