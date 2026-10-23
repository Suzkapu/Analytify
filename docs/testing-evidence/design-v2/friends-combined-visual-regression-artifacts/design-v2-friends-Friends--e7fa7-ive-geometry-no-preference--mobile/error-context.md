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
  - complementary "Desktop sidebar" [ref=f2e7]:
    - generic [ref=f2e9]:
      - button "Collapse navigation sidebar" [expanded] [ref=f2e10] [cursor=pointer]:
        - generic [ref=f2e11]: Analytify
      - navigation "All destinations" [ref=f2e12]:
        - generic [ref=f2e13]:
          - paragraph [ref=f2e14]: Library
          - link "Playlists" [ref=f2e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f2e16]: 
        - generic [ref=f2e18]:
          - paragraph [ref=f2e19]: Listening
          - link "Stats" [ref=f2e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f2e21]: 
          - link "History" [ref=f2e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f2e24]: 
        - generic [ref=f2e26]:
          - paragraph [ref=f2e27]: Social
          - link "Friends" [ref=f2e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f2e29]: 
          - link "Song Leagues" [ref=f2e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f2e32]: 
          - link "Private Sharing" [ref=f2e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f2e35]: 
        - generic [ref=f2e37]:
          - paragraph [ref=f2e38]: Tools
          - link "Compare playlists" [ref=f2e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f2e40]: 
      - link "Settings" [ref=f2e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f2e44]: B
        - generic [ref=f2e45]:
          - strong [ref=f2e46]: Browser test user
          - generic [ref=f2e47]: Settings
  - text: 
  - main "Your friends content" [active] [ref=f2e48]:
    - generic [ref=f2e52]:
      - generic [ref=f2e54]:
        - heading "Your friends" [level=1] [ref=f2e56]
        - paragraph [ref=f2e57]: Share playlists, invite friends and discover music together.
      - generic [ref=f2e58]:
        - navigation "Friends navigation" [ref=f2e59]:
          - link "Friends" [ref=f2e60] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f2e62] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f2e64] [cursor=pointer]:
          - /url: /new/friends/add
        - article [ref=f2e67]:
          - generic [aria-hidden] [ref=f2e68]: S
          - generic [ref=f2e69]:
            - heading "Suzkapu" [level=2] [ref=f2e70]
            - paragraph [ref=f2e71]: Connected
          - button "Manage friend Suzkapu" [ref=f2e74] [cursor=pointer]
        - paragraph [ref=f2e75]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - text:   
  - contentinfo [ref=f2e76]:
    - generic [ref=f2e77]: Powered by Spotify
    - generic [ref=f2e78]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e79] [cursor=pointer]:
      - /url: /new/legal
```