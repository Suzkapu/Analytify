# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends invitations and responsive geometry (no-preference)
- Location: e2e/design-v2-friends.spec.ts:205:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f2e7]:
    - generic [ref=f2e8]:
      - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f2e10]: Analytify
      - button "Open navigation menu" [ref=f2e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=f2e13]: 
        - generic [ref=f2e14]: Menu
  - main "Your friends content" [active] [ref=f2e15]:
    - generic [ref=f2e19]:
      - generic [ref=f2e21]:
        - heading "Your friends" [level=1] [ref=f2e23]
        - paragraph [ref=f2e24]: Share playlists, invite friends and discover music together.
      - generic [ref=f2e25]:
        - navigation "Friends navigation" [ref=f2e26]:
          - link "Friends" [ref=f2e27] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f2e29] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f2e31] [cursor=pointer]:
          - /url: /new/friends/add
        - article [ref=f2e34]:
          - generic [aria-hidden] [ref=f2e35]: S
          - generic [ref=f2e36]:
            - heading "Suzkapu" [level=2] [ref=f2e37]
            - paragraph [ref=f2e38]: Connected
          - button "Manage friend Suzkapu" [ref=f2e41] [cursor=pointer]
        - paragraph [ref=f2e42]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f2e43]:
    - link "Playlists" [ref=f2e44] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e45]: 
    - link "Stats" [ref=f2e47] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e48]: 
    - link "History" [ref=f2e50] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e51]: 
  - contentinfo [ref=f2e53]:
    - generic [ref=f2e54]: Powered by Spotify
    - generic [ref=f2e55]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e56] [cursor=pointer]:
      - /url: /new/legal
```