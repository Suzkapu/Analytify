# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends native workflow and responsive recovery (no-preference)
- Location: e2e/design-v2-friends.spec.ts:7:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f3e5]:
  - link "Skip to main content" [ref=f3e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f3e7]:
    - generic [ref=f3e8]:
      - link "Analytify playlists" [ref=f3e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f3e10]: Analytify
      - navigation "Main navigation" [ref=f3e11]:
        - link "Playlists" [ref=f3e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f3e13]: 
        - link "Stats" [ref=f3e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f3e16]: 
        - link "History" [ref=f3e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f3e19]: 
      - text: 
      - generic [ref=f3e21]:
        - button "Open More tools" [ref=f3e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e23]: 
          - generic [ref=f3e24]: More
        - button "Open account and data settings" [active] [ref=f3e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e26]: 
  - main "Friend invitation content" [ref=f3e27]:
    - generic [ref=f3e31]:
      - generic [ref=f3e33]:
        - generic [ref=f3e34]:
          - heading "Friend invitation" [level=1] [ref=f3e35]
          - button "Back" [ref=f3e36] [cursor=pointer]
        - paragraph [ref=f3e37]: Review who invited you before adding them as a friend.
      - generic [ref=f3e38]:
        - navigation "Friends navigation" [ref=f3e39]:
          - link "Friends" [ref=f3e40] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f3e42] [cursor=pointer]:
            - /url: /new/friends/invitations
            - generic [aria-hidden] [ref=f3e43]: 
            - text: Invitations
        - link "Add friend" [ref=f3e44] [cursor=pointer]:
          - /url: /new/friends/add
        - alert [ref=f3e47]:
          - heading "Confirm your Spotify account" [level=3] [ref=f3e48]
          - paragraph [ref=f3e49]: Connect your verified Spotify account before viewing friends or answering invitations.
  - contentinfo [ref=f3e50]:
    - generic [ref=f3e51]: Powered by Spotify
    - generic [ref=f3e52]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f3e53] [cursor=pointer]:
      - /url: /new/legal
```