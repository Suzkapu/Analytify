# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> cloud failure 503 preserves local history and recovers with one scoped retry, motion no-preference
- Location: e2e/design-v2-stats-history.spec.ts:153:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f2e7]:
    - generic [ref=f2e8]:
      - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f2e10]: Analytify
      - navigation "Main navigation" [ref=f2e11]:
        - link "Playlists" [ref=f2e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f2e13]: 
        - link "Stats" [ref=f2e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f2e16]: 
        - link "History" [ref=f2e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f2e19]: 
      - generic [ref=f2e21]:
        - button "Open More tools" [ref=f2e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e23]: 
          - generic [ref=f2e24]: More
        - button "Open account and data settings" [ref=f2e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e26]: 
  - main "Your Top Listening content" [ref=f2e27]:
    - generic [ref=f2e30]:
      - generic [ref=f2e32]:
        - paragraph [ref=f2e33]: Personal listening
        - heading "Your top listening" [level=1] [ref=f2e34]
        - paragraph [ref=f2e35]: See top songs, artists, and genres, and how their rankings change.
      - group "Ranking category" [ref=f2e38]:
        - button "Songs" [pressed] [ref=f2e39] [cursor=pointer]
        - button "Artists" [ref=f2e40] [cursor=pointer]
        - button "Genres" [ref=f2e41] [cursor=pointer]
      - group "Statistics controls" [ref=f2e44]:
        - group "Ranking period" [ref=f2e46]:
          - button "4 weeks" [pressed] [ref=f2e47] [cursor=pointer]
          - button "6 months" [ref=f2e48] [cursor=pointer]
          - button "1 year" [ref=f2e49] [cursor=pointer]
      - generic [ref=f2e50]:
        - group "Search rankings" [ref=f2e52]:
          - generic [ref=f2e54]:
            - generic [ref=f2e55]: Search songs or artists
            - generic [ref=f2e56]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f2e57]
          - button "Compare dates" [expanded] [ref=f2e58] [cursor=pointer]
          - button "Search past" [ref=f2e60] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e61]: 
            - text: Search past
        - region "Ranking date comparison" [ref=f2e62]:
          - button "Ranking date" [ref=f2e64] [cursor=pointer]:
            - generic [ref=f2e66]: Oct 4, 2026
          - button "Compare with" [ref=f2e68] [cursor=pointer]:
            - generic [ref=f2e70]: Sep 28, 2026
        - generic [ref=f2e71]:
          - generic [ref=f2e72]:
            - group "Rank 1. Unchanged" [ref=f2e73]:
              - generic [aria-hidden] [ref=f2e74]: "1"
              - generic [aria-hidden] [ref=f2e75]: —
            - button "Open Other 0 on Spotify" [disabled] [ref=f2e76]:
              - img "Other 0 cover" [ref=f2e77]
            - strong [ref=f2e79]: Other 0
            - button "View position history for Other 0" [ref=f2e80] [cursor=pointer]: History
          - generic [ref=f2e81]:
            - group "Rank 2. Unchanged" [ref=f2e82]:
              - generic [aria-hidden] [ref=f2e83]: "2"
              - generic [aria-hidden] [ref=f2e84]: —
            - button "Open Other 1 on Spotify" [disabled] [ref=f2e85]:
              - img "Other 1 cover" [ref=f2e86]
            - strong [ref=f2e88]: Other 1
            - button "View position history for Other 1" [ref=f2e89] [cursor=pointer]: History
          - generic [ref=f2e90]:
            - group "Rank 3. ↑ 57 places" [ref=f2e91]:
              - img "Hot mover" [ref=f2e93]
              - generic [aria-hidden] [ref=f2e95]: "3"
              - generic [aria-hidden] [ref=f2e96]: ↑ 57
            - button "Open Midnight Drive on Spotify" [disabled] [ref=f2e97]:
              - img "Midnight Drive cover" [ref=f2e98]
            - generic [ref=f2e99]:
              - strong [ref=f2e100]: Midnight Drive
              - generic [ref=f2e101]: Example Artist
            - button "View position history for Midnight Drive" [active] [ref=f2e102] [cursor=pointer]: History
        - button " Create playlist" [ref=f2e103] [cursor=pointer]:
          - generic [ref=f2e104]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f2e105]:
    - generic [ref=f2e106]: Powered by Spotify
    - generic [ref=f2e107]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e108] [cursor=pointer]:
      - /url: /new/legal
```