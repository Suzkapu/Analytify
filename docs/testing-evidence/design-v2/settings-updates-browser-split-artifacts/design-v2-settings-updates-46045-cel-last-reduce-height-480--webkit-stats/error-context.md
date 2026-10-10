# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates popup resizing, blur and Cancel-last (reduce, height 480)
- Location: e2e/design-v2-settings-updates.spec.ts:114:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e8]:
      - link [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation [ref=f1e11]:
        - link [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: Playlists
        - link [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
          - generic [ref=f1e17]: Stats
        - link [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
          - generic [ref=f1e20]: History
      - generic [ref=f1e21]:
        - button [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Automatic updates content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - generic [ref=f1e33]:
          - heading [level=1] [ref=f1e34]: Listening history
          - button [ref=f1e35] [cursor=pointer]: Back
        - paragraph [ref=f1e36]: Edit this optional update. Required feature updates stay on.
      - region "Automatic update preference" [ref=f1e38]:
        - generic [ref=f1e40] [cursor=pointer]:
          - generic [ref=f1e41]:
            - strong [ref=f1e42]: Automatic updates
            - generic [ref=f1e43]: Update listening history in the background.
          - switch [ref=f1e45]
        - button [aria-hidden] [ref=f1e46] [cursor=pointer]:
          - strong [ref=f1e47]: Every
          - generic [ref=f1e48]: "2"
        - button [aria-hidden] [ref=f1e49] [cursor=pointer]:
          - strong [ref=f1e50]: Unit
          - generic [ref=f1e51]: hours
        - status [ref=f1e53]:
          - strong [ref=f1e54]: "Minimum interval: 1 hour"
          - paragraph [ref=f1e55]: Choose an interval of 1 hour or longer.
        - button [aria-hidden] [ref=f1e56] [cursor=pointer]: Save changes
        - paragraph [aria-hidden] [ref=f1e57]: Changes apply only after Save changes. Leaving through Back, Menu or any other navigation discards unsaved changes.
        - dialog [ref=f1e61]:
          - heading "Unit" [level=2] [ref=f1e62]
          - paragraph [ref=f1e63]: Choose the unit for your interval. This changes only your unsaved draft.
          - button "minutes" [active] [ref=f1e64] [cursor=pointer]
          - button "hours" [ref=f1e65] [cursor=pointer]
          - button "days" [ref=f1e66] [cursor=pointer]
          - button "Cancel" [ref=f1e67] [cursor=pointer]
  - text:   
  - contentinfo [aria-hidden] [ref=f1e68]:
    - generic [ref=f1e69]: Powered by Spotify
    - generic [ref=f1e70]: Artwork and metadata belong to their owners.
    - link [ref=f1e71] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```