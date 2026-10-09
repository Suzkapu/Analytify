# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-composition.spec.ts >> Stats content composition preserves shared workflows (no-preference)
- Location: e2e/design-v2-stats-composition.spec.ts:9:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 320
Received: 288
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 320
Received: 288
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 390
Received: 358
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 390
Received: 358
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 760
Received: 728
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 760
Received: 728
```

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
      - generic [ref=f3e21]:
        - button "Open More tools" [ref=f3e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e23]: 
          - generic [ref=f3e24]: More
        - button "Open account and data settings" [ref=f3e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e26]: 
  - main "Your Top Listening content" [ref=f3e27]:
    - generic [ref=f3e30]:
      - generic [ref=f3e32]:
        - heading "Your top listening" [level=1] [ref=f3e34]
        - paragraph [ref=f3e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f3e36]:
        - region "Statistics controls" [ref=f3e37]:
          - generic [ref=f3e38]:
            - paragraph [ref=f3e39]: Period
            - group "Ranking period" [ref=f3e40]:
              - button "4 weeks" [pressed] [ref=f3e41] [cursor=pointer]
              - button "6 months" [ref=f3e43] [cursor=pointer]
              - button "1 year" [ref=f3e45] [cursor=pointer]
          - generic [ref=f3e47]:
            - paragraph [ref=f3e48]: Category
            - group "Ranking category" [ref=f3e49]:
              - button "Songs" [pressed] [ref=f3e50] [cursor=pointer]
              - button "Artists" [ref=f3e53] [cursor=pointer]
              - button "Genres" [ref=f3e56] [cursor=pointer]
        - group "Search rankings" [ref=f3e60]:
          - generic [ref=f3e62]:
            - generic [ref=f3e63]: Search songs or artists
            - generic [ref=f3e64]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f3e65]
          - button "Compare dates" [ref=f3e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f3e69] [cursor=pointer]
        - region "Rankings" [ref=f3e73]:
          - heading "Top songs" [level=2] [ref=f3e74]
          - generic [ref=f3e76]:
            - group "Rank 1. Unchanged" [ref=f3e77]:
              - generic [aria-hidden] [ref=f3e78]: "1"
              - generic [aria-hidden] [ref=f3e79]: —
            - button "Open Test Song on Spotify" [disabled] [ref=f3e80]:
              - img "Test Song cover" [ref=f3e81]
            - generic [ref=f3e82]:
              - strong [ref=f3e83]: Test Song
              - generic [ref=f3e84]: Test Artist
            - button "View position history for Test Song" [ref=f3e85] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f3e87] [cursor=pointer]:
            - generic [aria-hidden] [ref=f3e88]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f3e89]:
    - generic [ref=f3e90]: Powered by Spotify
    - generic [ref=f3e91]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f3e92] [cursor=pointer]:
      - /url: /new/legal
```