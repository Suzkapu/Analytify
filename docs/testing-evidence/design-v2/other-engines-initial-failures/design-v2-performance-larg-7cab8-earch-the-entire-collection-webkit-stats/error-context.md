# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-performance.spec.ts >> large cached playlists render incrementally and search the entire collection
- Location: e2e/design-v2-performance.spec.ts:4:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
      - text: 
      - generic [ref=f1e21]:
        - button "Open More tools" [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button "Open account and data settings" [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Playlist Songs content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e31]:
        - generic [ref=f1e32]:
          - paragraph [ref=f1e33]: Playlist explorer
          - heading "Large playlist" [level=1] [ref=f1e34]
          - paragraph [ref=f1e35]: Browse the artists, songs, and albums in this playlist.
        - generic "Page actions" [ref=f1e36]:
          - link " Back to playlists" [ref=f1e37] [cursor=pointer]:
            - /url: /new/playlists
            - generic [ref=f1e38]: 
            - text: Back to playlists
      - group "Choose playlist view" [ref=f1e41]:
        - button "Artists" [ref=f1e42] [cursor=pointer]
        - button "Songs" [active] [pressed] [ref=f1e43] [cursor=pointer]
        - button "Albums" [ref=f1e44] [cursor=pointer]
      - group "Playlist view controls" [ref=f1e47]:
        - generic [ref=f1e49]:
          - generic [ref=f1e50]: Search songs or artists
          - generic [ref=f1e51]:
            - generic [aria-hidden]: 
            - searchbox "Search songs or artists" [ref=f1e52]
        - generic [ref=f1e53]:
          - text: Sort songs
          - combobox "Sort songs" [ref=f1e54] [cursor=pointer]:
            - option "Recently added" [selected]
            - option "Duration"
            - option "Release Date"
            - option "Alphabetical"
      - region "Songs in playlist" [ref=f1e56]:
        - generic [ref=f1e57]:
          - generic [ref=f1e58]: "1"
          - button "Open Large song 0001 on Spotify" [ref=f1e59] [cursor=pointer]:
            - img "Large song 0001 cover" [ref=f1e60]
          - generic [ref=f1e61]:
            - strong [ref=f1e62]: Large song 0001
            - generic [ref=f1e63]: Test Artist
          - generic [ref=f1e64]: 2:00
        - generic [ref=f1e66]:
          - generic [ref=f1e67]: "2"
          - button "Open Large song 0002 on Spotify" [ref=f1e68] [cursor=pointer]:
            - img "Large song 0002 cover" [ref=f1e69]
          - generic [ref=f1e70]:
            - strong [ref=f1e71]: Large song 0002
            - generic [ref=f1e72]: Test Artist
          - generic [ref=f1e73]: 2:00
        - generic [ref=f1e75]:
          - generic [ref=f1e76]: "3"
          - button "Open Large song 0003 on Spotify" [ref=f1e77] [cursor=pointer]:
            - img "Large song 0003 cover" [ref=f1e78]
          - generic [ref=f1e79]:
            - strong [ref=f1e80]: Large song 0003
            - generic [ref=f1e81]: Test Artist
          - generic [ref=f1e82]: 2:00
        - generic [ref=f1e84]:
          - generic [ref=f1e85]: "4"
          - button "Open Large song 0004 on Spotify" [ref=f1e86] [cursor=pointer]:
            - img "Large song 0004 cover" [ref=f1e87]
          - generic [ref=f1e88]:
            - strong [ref=f1e89]: Large song 0004
            - generic [ref=f1e90]: Test Artist
          - generic [ref=f1e91]: 2:00
        - generic [ref=f1e93]:
          - generic [ref=f1e94]: "5"
          - button "Open Large song 0005 on Spotify" [ref=f1e95] [cursor=pointer]:
            - img "Large song 0005 cover" [ref=f1e96]
          - generic [ref=f1e97]:
            - strong [ref=f1e98]: Large song 0005
            - generic [ref=f1e99]: Test Artist
          - generic [ref=f1e100]: 2:00
        - generic [ref=f1e102]:
          - generic [ref=f1e103]: "6"
          - button "Open Large song 0006 on Spotify" [ref=f1e104] [cursor=pointer]:
            - img "Large song 0006 cover" [ref=f1e105]
          - generic [ref=f1e106]:
            - strong [ref=f1e107]: Large song 0006
            - generic [ref=f1e108]: Test Artist
          - generic [ref=f1e109]: 2:00
        - generic [ref=f1e111]:
          - generic [ref=f1e112]: "7"
          - button "Open Large song 0007 on Spotify" [ref=f1e113] [cursor=pointer]:
            - img "Large song 0007 cover" [ref=f1e114]
          - generic [ref=f1e115]:
            - strong [ref=f1e116]: Large song 0007
            - generic [ref=f1e117]: Test Artist
          - generic [ref=f1e118]: 2:00
        - generic [ref=f1e120]:
          - generic [ref=f1e121]: "8"
          - button "Open Large song 0008 on Spotify" [ref=f1e122] [cursor=pointer]:
            - img "Large song 0008 cover" [ref=f1e123]
          - generic [ref=f1e124]:
            - strong [ref=f1e125]: Large song 0008
            - generic [ref=f1e126]: Test Artist
          - generic [ref=f1e127]: 2:00
        - generic [ref=f1e129]:
          - generic [ref=f1e130]: "9"
          - button "Open Large song 0009 on Spotify" [ref=f1e131] [cursor=pointer]:
            - img "Large song 0009 cover" [ref=f1e132]
          - generic [ref=f1e133]:
            - strong [ref=f1e134]: Large song 0009
            - generic [ref=f1e135]: Test Artist
          - generic [ref=f1e136]: 2:00
        - generic [ref=f1e138]:
          - generic [ref=f1e139]: "10"
          - button "Open Large song 0010 on Spotify" [ref=f1e140] [cursor=pointer]:
            - img "Large song 0010 cover" [ref=f1e141]
          - generic [ref=f1e142]:
            - strong [ref=f1e143]: Large song 0010
            - generic [ref=f1e144]: Test Artist
          - generic [ref=f1e145]: 2:00
        - generic [ref=f1e147]:
          - generic [ref=f1e148]: "11"
          - button "Open Large song 0011 on Spotify" [ref=f1e149] [cursor=pointer]:
            - img "Large song 0011 cover" [ref=f1e150]
          - generic [ref=f1e151]:
            - strong [ref=f1e152]: Large song 0011
            - generic [ref=f1e153]: Test Artist
          - generic [ref=f1e154]: 2:00
        - generic [ref=f1e156]:
          - generic [ref=f1e157]: "12"
          - button "Open Large song 0012 on Spotify" [ref=f1e158] [cursor=pointer]:
            - img "Large song 0012 cover" [ref=f1e159]
          - generic [ref=f1e160]:
            - strong [ref=f1e161]: Large song 0012
            - generic [ref=f1e162]: Test Artist
          - generic [ref=f1e163]: 2:00
        - generic [ref=f1e165]:
          - generic [ref=f1e166]: "13"
          - button "Open Large song 0013 on Spotify" [ref=f1e167] [cursor=pointer]:
            - img "Large song 0013 cover" [ref=f1e168]
          - generic [ref=f1e169]:
            - strong [ref=f1e170]: Large song 0013
            - generic [ref=f1e171]: Test Artist
          - generic [ref=f1e172]: 2:00
        - generic [ref=f1e174]:
          - generic [ref=f1e175]: "14"
          - button "Open Large song 0014 on Spotify" [ref=f1e176] [cursor=pointer]:
            - img "Large song 0014 cover" [ref=f1e177]
          - generic [ref=f1e178]:
            - strong [ref=f1e179]: Large song 0014
            - generic [ref=f1e180]: Test Artist
          - generic [ref=f1e181]: 2:00
        - generic [ref=f1e183]:
          - generic [ref=f1e184]: "15"
          - button "Open Large song 0015 on Spotify" [ref=f1e185] [cursor=pointer]:
            - img "Large song 0015 cover" [ref=f1e186]
          - generic [ref=f1e187]:
            - strong [ref=f1e188]: Large song 0015
            - generic [ref=f1e189]: Test Artist
          - generic [ref=f1e190]: 2:00
        - generic [ref=f1e192]:
          - generic [ref=f1e193]: "16"
          - button "Open Large song 0016 on Spotify" [ref=f1e194] [cursor=pointer]:
            - img "Large song 0016 cover" [ref=f1e195]
          - generic [ref=f1e196]:
            - strong [ref=f1e197]: Large song 0016
            - generic [ref=f1e198]: Test Artist
          - generic [ref=f1e199]: 2:00
        - generic [ref=f1e201]:
          - generic [ref=f1e202]: "17"
          - button "Open Large song 0017 on Spotify" [ref=f1e203] [cursor=pointer]:
            - img "Large song 0017 cover" [ref=f1e204]
          - generic [ref=f1e205]:
            - strong [ref=f1e206]: Large song 0017
            - generic [ref=f1e207]: Test Artist
          - generic [ref=f1e208]: 2:00
        - generic [ref=f1e210]:
          - generic [ref=f1e211]: "18"
          - button "Open Large song 0018 on Spotify" [ref=f1e212] [cursor=pointer]:
            - img "Large song 0018 cover" [ref=f1e213]
          - generic [ref=f1e214]:
            - strong [ref=f1e215]: Large song 0018
            - generic [ref=f1e216]: Test Artist
          - generic [ref=f1e217]: 2:00
        - generic [ref=f1e219]:
          - generic [ref=f1e220]: "19"
          - button "Open Large song 0019 on Spotify" [ref=f1e221] [cursor=pointer]:
            - img "Large song 0019 cover" [ref=f1e222]
          - generic [ref=f1e223]:
            - strong [ref=f1e224]: Large song 0019
            - generic [ref=f1e225]: Test Artist
          - generic [ref=f1e226]: 2:00
        - generic [ref=f1e228]:
          - generic [ref=f1e229]: "20"
          - button "Open Large song 0020 on Spotify" [ref=f1e230] [cursor=pointer]:
            - img "Large song 0020 cover" [ref=f1e231]
          - generic [ref=f1e232]:
            - strong [ref=f1e233]: Large song 0020
            - generic [ref=f1e234]: Test Artist
          - generic [ref=f1e235]: 2:00
        - generic [ref=f1e237]:
          - generic [ref=f1e238]: "21"
          - button "Open Large song 0021 on Spotify" [ref=f1e239] [cursor=pointer]:
            - img "Large song 0021 cover" [ref=f1e240]
          - generic [ref=f1e241]:
            - strong [ref=f1e242]: Large song 0021
            - generic [ref=f1e243]: Test Artist
          - generic [ref=f1e244]: 2:00
        - generic [ref=f1e246]:
          - generic [ref=f1e247]: "22"
          - button "Open Large song 0022 on Spotify" [ref=f1e248] [cursor=pointer]:
            - img "Large song 0022 cover" [ref=f1e249]
          - generic [ref=f1e250]:
            - strong [ref=f1e251]: Large song 0022
            - generic [ref=f1e252]: Test Artist
          - generic [ref=f1e253]: 2:00
        - generic [ref=f1e255]:
          - generic [ref=f1e256]: "23"
          - button "Open Large song 0023 on Spotify" [ref=f1e257] [cursor=pointer]:
            - img "Large song 0023 cover" [ref=f1e258]
          - generic [ref=f1e259]:
            - strong [ref=f1e260]: Large song 0023
            - generic [ref=f1e261]: Test Artist
          - generic [ref=f1e262]: 2:00
        - generic [ref=f1e264]:
          - generic [ref=f1e265]: "24"
          - button "Open Large song 0024 on Spotify" [ref=f1e266] [cursor=pointer]:
            - img "Large song 0024 cover" [ref=f1e267]
          - generic [ref=f1e268]:
            - strong [ref=f1e269]: Large song 0024
            - generic [ref=f1e270]: Test Artist
          - generic [ref=f1e271]: 2:00
        - generic [ref=f1e273]:
          - generic [ref=f1e274]: "25"
          - button "Open Large song 0025 on Spotify" [ref=f1e275] [cursor=pointer]:
            - img "Large song 0025 cover" [ref=f1e276]
          - generic [ref=f1e277]:
            - strong [ref=f1e278]: Large song 0025
            - generic [ref=f1e279]: Test Artist
          - generic [ref=f1e280]: 2:00
        - generic [ref=f1e282]:
          - generic [ref=f1e283]: "26"
          - button "Open Large song 0026 on Spotify" [ref=f1e284] [cursor=pointer]:
            - img "Large song 0026 cover" [ref=f1e285]
          - generic [ref=f1e286]:
            - strong [ref=f1e287]: Large song 0026
            - generic [ref=f1e288]: Test Artist
          - generic [ref=f1e289]: 2:00
        - generic [ref=f1e291]:
          - generic [ref=f1e292]: "27"
          - button "Open Large song 0027 on Spotify" [ref=f1e293] [cursor=pointer]:
            - img "Large song 0027 cover" [ref=f1e294]
          - generic [ref=f1e295]:
            - strong [ref=f1e296]: Large song 0027
            - generic [ref=f1e297]: Test Artist
          - generic [ref=f1e298]: 2:00
        - generic [ref=f1e300]:
          - generic [ref=f1e301]: "28"
          - button "Open Large song 0028 on Spotify" [ref=f1e302] [cursor=pointer]:
            - img "Large song 0028 cover" [ref=f1e303]
          - generic [ref=f1e304]:
            - strong [ref=f1e305]: Large song 0028
            - generic [ref=f1e306]: Test Artist
          - generic [ref=f1e307]: 2:00
        - generic [ref=f1e309]:
          - generic [ref=f1e310]: "29"
          - button "Open Large song 0029 on Spotify" [ref=f1e311] [cursor=pointer]:
            - img "Large song 0029 cover" [ref=f1e312]
          - generic [ref=f1e313]:
            - strong [ref=f1e314]: Large song 0029
            - generic [ref=f1e315]: Test Artist
          - generic [ref=f1e316]: 2:00
        - generic [ref=f1e318]:
          - generic [ref=f1e319]: "30"
          - button "Open Large song 0030 on Spotify" [ref=f1e320] [cursor=pointer]:
            - img "Large song 0030 cover" [ref=f1e321]
          - generic [ref=f1e322]:
            - strong [ref=f1e323]: Large song 0030
            - generic [ref=f1e324]: Test Artist
          - generic [ref=f1e325]: 2:00
        - generic [ref=f1e327]:
          - generic [ref=f1e328]: "31"
          - button "Open Large song 0031 on Spotify" [ref=f1e329] [cursor=pointer]:
            - img "Large song 0031 cover" [ref=f1e330]
          - generic [ref=f1e331]:
            - strong [ref=f1e332]: Large song 0031
            - generic [ref=f1e333]: Test Artist
          - generic [ref=f1e334]: 2:00
        - generic [ref=f1e336]:
          - generic [ref=f1e337]: "32"
          - button "Open Large song 0032 on Spotify" [ref=f1e338] [cursor=pointer]:
            - img "Large song 0032 cover" [ref=f1e339]
          - generic [ref=f1e340]:
            - strong [ref=f1e341]: Large song 0032
            - generic [ref=f1e342]: Test Artist
          - generic [ref=f1e343]: 2:00
        - generic [ref=f1e345]:
          - generic [ref=f1e346]: "33"
          - button "Open Large song 0033 on Spotify" [ref=f1e347] [cursor=pointer]:
            - img "Large song 0033 cover" [ref=f1e348]
          - generic [ref=f1e349]:
            - strong [ref=f1e350]: Large song 0033
            - generic [ref=f1e351]: Test Artist
          - generic [ref=f1e352]: 2:00
        - generic [ref=f1e354]:
          - generic [ref=f1e355]: "34"
          - button "Open Large song 0034 on Spotify" [ref=f1e356] [cursor=pointer]:
            - img "Large song 0034 cover" [ref=f1e357]
          - generic [ref=f1e358]:
            - strong [ref=f1e359]: Large song 0034
            - generic [ref=f1e360]: Test Artist
          - generic [ref=f1e361]: 2:00
        - generic [ref=f1e363]:
          - generic [ref=f1e364]: "35"
          - button "Open Large song 0035 on Spotify" [ref=f1e365] [cursor=pointer]:
            - img "Large song 0035 cover" [ref=f1e366]
          - generic [ref=f1e367]:
            - strong [ref=f1e368]: Large song 0035
            - generic [ref=f1e369]: Test Artist
          - generic [ref=f1e370]: 2:00
        - generic [ref=f1e372]:
          - generic [ref=f1e373]: "36"
          - button "Open Large song 0036 on Spotify" [ref=f1e374] [cursor=pointer]:
            - img "Large song 0036 cover" [ref=f1e375]
          - generic [ref=f1e376]:
            - strong [ref=f1e377]: Large song 0036
            - generic [ref=f1e378]: Test Artist
          - generic [ref=f1e379]: 2:00
        - generic [ref=f1e381]:
          - generic [ref=f1e382]: "37"
          - button "Open Large song 0037 on Spotify" [ref=f1e383] [cursor=pointer]:
            - img "Large song 0037 cover" [ref=f1e384]
          - generic [ref=f1e385]:
            - strong [ref=f1e386]: Large song 0037
            - generic [ref=f1e387]: Test Artist
          - generic [ref=f1e388]: 2:00
        - generic [ref=f1e390]:
          - generic [ref=f1e391]: "38"
          - button "Open Large song 0038 on Spotify" [ref=f1e392] [cursor=pointer]:
            - img "Large song 0038 cover" [ref=f1e393]
          - generic [ref=f1e394]:
            - strong [ref=f1e395]: Large song 0038
            - generic [ref=f1e396]: Test Artist
          - generic [ref=f1e397]: 2:00
        - generic [ref=f1e399]:
          - generic [ref=f1e400]: "39"
          - button "Open Large song 0039 on Spotify" [ref=f1e401] [cursor=pointer]:
            - img "Large song 0039 cover" [ref=f1e402]
          - generic [ref=f1e403]:
            - strong [ref=f1e404]: Large song 0039
            - generic [ref=f1e405]: Test Artist
          - generic [ref=f1e406]: 2:00
        - generic [ref=f1e408]:
          - generic [ref=f1e409]: "40"
          - button "Open Large song 0040 on Spotify" [ref=f1e410] [cursor=pointer]:
            - img "Large song 0040 cover" [ref=f1e411]
          - generic [ref=f1e412]:
            - strong [ref=f1e413]: Large song 0040
            - generic [ref=f1e414]: Test Artist
          - generic [ref=f1e415]: 2:00
        - generic [ref=f1e417]:
          - generic [ref=f1e418]: "41"
          - button "Open Large song 0041 on Spotify" [ref=f1e419] [cursor=pointer]:
            - img "Large song 0041 cover" [ref=f1e420]
          - generic [ref=f1e421]:
            - strong [ref=f1e422]: Large song 0041
            - generic [ref=f1e423]: Test Artist
          - generic [ref=f1e424]: 2:00
        - generic [ref=f1e426]:
          - generic [ref=f1e427]: "42"
          - button "Open Large song 0042 on Spotify" [ref=f1e428] [cursor=pointer]:
            - img "Large song 0042 cover" [ref=f1e429]
          - generic [ref=f1e430]:
            - strong [ref=f1e431]: Large song 0042
            - generic [ref=f1e432]: Test Artist
          - generic [ref=f1e433]: 2:00
        - generic [ref=f1e435]:
          - generic [ref=f1e436]: "43"
          - button "Open Large song 0043 on Spotify" [ref=f1e437] [cursor=pointer]:
            - img "Large song 0043 cover" [ref=f1e438]
          - generic [ref=f1e439]:
            - strong [ref=f1e440]: Large song 0043
            - generic [ref=f1e441]: Test Artist
          - generic [ref=f1e442]: 2:00
        - generic [ref=f1e444]:
          - generic [ref=f1e445]: "44"
          - button "Open Large song 0044 on Spotify" [ref=f1e446] [cursor=pointer]:
            - img "Large song 0044 cover" [ref=f1e447]
          - generic [ref=f1e448]:
            - strong [ref=f1e449]: Large song 0044
            - generic [ref=f1e450]: Test Artist
          - generic [ref=f1e451]: 2:00
        - generic [ref=f1e453]:
          - generic [ref=f1e454]: "45"
          - button "Open Large song 0045 on Spotify" [ref=f1e455] [cursor=pointer]:
            - img "Large song 0045 cover" [ref=f1e456]
          - generic [ref=f1e457]:
            - strong [ref=f1e458]: Large song 0045
            - generic [ref=f1e459]: Test Artist
          - generic [ref=f1e460]: 2:00
        - generic [ref=f1e462]:
          - generic [ref=f1e463]: "46"
          - button "Open Large song 0046 on Spotify" [ref=f1e464] [cursor=pointer]:
            - img "Large song 0046 cover" [ref=f1e465]
          - generic [ref=f1e466]:
            - strong [ref=f1e467]: Large song 0046
            - generic [ref=f1e468]: Test Artist
          - generic [ref=f1e469]: 2:00
        - generic [ref=f1e471]:
          - generic [ref=f1e472]: "47"
          - button "Open Large song 0047 on Spotify" [ref=f1e473] [cursor=pointer]:
            - img "Large song 0047 cover" [ref=f1e474]
          - generic [ref=f1e475]:
            - strong [ref=f1e476]: Large song 0047
            - generic [ref=f1e477]: Test Artist
          - generic [ref=f1e478]: 2:00
        - generic [ref=f1e480]:
          - generic [ref=f1e481]: "48"
          - button "Open Large song 0048 on Spotify" [ref=f1e482] [cursor=pointer]:
            - img "Large song 0048 cover" [ref=f1e483]
          - generic [ref=f1e484]:
            - strong [ref=f1e485]: Large song 0048
            - generic [ref=f1e486]: Test Artist
          - generic [ref=f1e487]: 2:00
        - generic [ref=f1e489]:
          - generic [ref=f1e490]: "49"
          - button "Open Large song 0049 on Spotify" [ref=f1e491] [cursor=pointer]:
            - img "Large song 0049 cover" [ref=f1e492]
          - generic [ref=f1e493]:
            - strong [ref=f1e494]: Large song 0049
            - generic [ref=f1e495]: Test Artist
          - generic [ref=f1e496]: 2:00
        - generic [ref=f1e498]:
          - generic [ref=f1e499]: "50"
          - button "Open Large song 0050 on Spotify" [ref=f1e500] [cursor=pointer]:
            - img "Large song 0050 cover" [ref=f1e501]
          - generic [ref=f1e502]:
            - strong [ref=f1e503]: Large song 0050
            - generic [ref=f1e504]: Test Artist
          - generic [ref=f1e505]: 2:00
        - generic [ref=f1e507]:
          - generic [ref=f1e508]: "51"
          - button "Open Large song 0051 on Spotify" [ref=f1e509] [cursor=pointer]:
            - img "Large song 0051 cover" [ref=f1e510]
          - generic [ref=f1e511]:
            - strong [ref=f1e512]: Large song 0051
            - generic [ref=f1e513]: Test Artist
          - generic [ref=f1e514]: 2:00
        - generic [ref=f1e516]:
          - generic [ref=f1e517]: "52"
          - button "Open Large song 0052 on Spotify" [ref=f1e518] [cursor=pointer]:
            - img "Large song 0052 cover" [ref=f1e519]
          - generic [ref=f1e520]:
            - strong [ref=f1e521]: Large song 0052
            - generic [ref=f1e522]: Test Artist
          - generic [ref=f1e523]: 2:00
        - generic [ref=f1e525]:
          - generic [ref=f1e526]: "53"
          - button "Open Large song 0053 on Spotify" [ref=f1e527] [cursor=pointer]:
            - img "Large song 0053 cover" [ref=f1e528]
          - generic [ref=f1e529]:
            - strong [ref=f1e530]: Large song 0053
            - generic [ref=f1e531]: Test Artist
          - generic [ref=f1e532]: 2:00
        - generic [ref=f1e534]:
          - generic [ref=f1e535]: "54"
          - button "Open Large song 0054 on Spotify" [ref=f1e536] [cursor=pointer]:
            - img "Large song 0054 cover" [ref=f1e537]
          - generic [ref=f1e538]:
            - strong [ref=f1e539]: Large song 0054
            - generic [ref=f1e540]: Test Artist
          - generic [ref=f1e541]: 2:00
        - generic [ref=f1e543]:
          - generic [ref=f1e544]: "55"
          - button "Open Large song 0055 on Spotify" [ref=f1e545] [cursor=pointer]:
            - img "Large song 0055 cover" [ref=f1e546]
          - generic [ref=f1e547]:
            - strong [ref=f1e548]: Large song 0055
            - generic [ref=f1e549]: Test Artist
          - generic [ref=f1e550]: 2:00
        - generic [ref=f1e552]:
          - generic [ref=f1e553]: "56"
          - button "Open Large song 0056 on Spotify" [ref=f1e554] [cursor=pointer]:
            - img "Large song 0056 cover" [ref=f1e555]
          - generic [ref=f1e556]:
            - strong [ref=f1e557]: Large song 0056
            - generic [ref=f1e558]: Test Artist
          - generic [ref=f1e559]: 2:00
        - generic [ref=f1e561]:
          - generic [ref=f1e562]: "57"
          - button "Open Large song 0057 on Spotify" [ref=f1e563] [cursor=pointer]:
            - img "Large song 0057 cover" [ref=f1e564]
          - generic [ref=f1e565]:
            - strong [ref=f1e566]: Large song 0057
            - generic [ref=f1e567]: Test Artist
          - generic [ref=f1e568]: 2:00
        - generic [ref=f1e570]:
          - generic [ref=f1e571]: "58"
          - button "Open Large song 0058 on Spotify" [ref=f1e572] [cursor=pointer]:
            - img "Large song 0058 cover" [ref=f1e573]
          - generic [ref=f1e574]:
            - strong [ref=f1e575]: Large song 0058
            - generic [ref=f1e576]: Test Artist
          - generic [ref=f1e577]: 2:00
        - generic [ref=f1e579]:
          - generic [ref=f1e580]: "59"
          - button "Open Large song 0059 on Spotify" [ref=f1e581] [cursor=pointer]:
            - img "Large song 0059 cover" [ref=f1e582]
          - generic [ref=f1e583]:
            - strong [ref=f1e584]: Large song 0059
            - generic [ref=f1e585]: Test Artist
          - generic [ref=f1e586]: 2:00
        - generic [ref=f1e588]:
          - generic [ref=f1e589]: "60"
          - button "Open Large song 0060 on Spotify" [ref=f1e590] [cursor=pointer]:
            - img "Large song 0060 cover" [ref=f1e591]
          - generic [ref=f1e592]:
            - strong [ref=f1e593]: Large song 0060
            - generic [ref=f1e594]: Test Artist
          - generic [ref=f1e595]: 2:00
        - generic [ref=f1e597]:
          - generic [ref=f1e598]: "61"
          - button "Open Large song 0061 on Spotify" [ref=f1e599] [cursor=pointer]:
            - img "Large song 0061 cover" [ref=f1e600]
          - generic [ref=f1e601]:
            - strong [ref=f1e602]: Large song 0061
            - generic [ref=f1e603]: Test Artist
          - generic [ref=f1e604]: 2:00
        - generic [ref=f1e606]:
          - generic [ref=f1e607]: "62"
          - button "Open Large song 0062 on Spotify" [ref=f1e608] [cursor=pointer]:
            - img "Large song 0062 cover" [ref=f1e609]
          - generic [ref=f1e610]:
            - strong [ref=f1e611]: Large song 0062
            - generic [ref=f1e612]: Test Artist
          - generic [ref=f1e613]: 2:00
        - generic [ref=f1e615]:
          - generic [ref=f1e616]: "63"
          - button "Open Large song 0063 on Spotify" [ref=f1e617] [cursor=pointer]:
            - img "Large song 0063 cover" [ref=f1e618]
          - generic [ref=f1e619]:
            - strong [ref=f1e620]: Large song 0063
            - generic [ref=f1e621]: Test Artist
          - generic [ref=f1e622]: 2:00
        - generic [ref=f1e624]:
          - generic [ref=f1e625]: "64"
          - button "Open Large song 0064 on Spotify" [ref=f1e626] [cursor=pointer]:
            - img "Large song 0064 cover" [ref=f1e627]
          - generic [ref=f1e628]:
            - strong [ref=f1e629]: Large song 0064
            - generic [ref=f1e630]: Test Artist
          - generic [ref=f1e631]: 2:00
        - generic [ref=f1e633]:
          - generic [ref=f1e634]: "65"
          - button "Open Large song 0065 on Spotify" [ref=f1e635] [cursor=pointer]:
            - img "Large song 0065 cover" [ref=f1e636]
          - generic [ref=f1e637]:
            - strong [ref=f1e638]: Large song 0065
            - generic [ref=f1e639]: Test Artist
          - generic [ref=f1e640]: 2:00
        - generic [ref=f1e642]:
          - generic [ref=f1e643]: "66"
          - button "Open Large song 0066 on Spotify" [ref=f1e644] [cursor=pointer]:
            - img "Large song 0066 cover" [ref=f1e645]
          - generic [ref=f1e646]:
            - strong [ref=f1e647]: Large song 0066
            - generic [ref=f1e648]: Test Artist
          - generic [ref=f1e649]: 2:00
        - generic [ref=f1e651]:
          - generic [ref=f1e652]: "67"
          - button "Open Large song 0067 on Spotify" [ref=f1e653] [cursor=pointer]:
            - img "Large song 0067 cover" [ref=f1e654]
          - generic [ref=f1e655]:
            - strong [ref=f1e656]: Large song 0067
            - generic [ref=f1e657]: Test Artist
          - generic [ref=f1e658]: 2:00
        - generic [ref=f1e660]:
          - generic [ref=f1e661]: "68"
          - button "Open Large song 0068 on Spotify" [ref=f1e662] [cursor=pointer]:
            - img "Large song 0068 cover" [ref=f1e663]
          - generic [ref=f1e664]:
            - strong [ref=f1e665]: Large song 0068
            - generic [ref=f1e666]: Test Artist
          - generic [ref=f1e667]: 2:00
        - generic [ref=f1e669]:
          - generic [ref=f1e670]: "69"
          - button "Open Large song 0069 on Spotify" [ref=f1e671] [cursor=pointer]:
            - img "Large song 0069 cover" [ref=f1e672]
          - generic [ref=f1e673]:
            - strong [ref=f1e674]: Large song 0069
            - generic [ref=f1e675]: Test Artist
          - generic [ref=f1e676]: 2:00
        - generic [ref=f1e678]:
          - generic [ref=f1e679]: "70"
          - button "Open Large song 0070 on Spotify" [ref=f1e680] [cursor=pointer]:
            - img "Large song 0070 cover" [ref=f1e681]
          - generic [ref=f1e682]:
            - strong [ref=f1e683]: Large song 0070
            - generic [ref=f1e684]: Test Artist
          - generic [ref=f1e685]: 2:00
        - generic [ref=f1e687]:
          - generic [ref=f1e688]: "71"
          - button "Open Large song 0071 on Spotify" [ref=f1e689] [cursor=pointer]:
            - img "Large song 0071 cover" [ref=f1e690]
          - generic [ref=f1e691]:
            - strong [ref=f1e692]: Large song 0071
            - generic [ref=f1e693]: Test Artist
          - generic [ref=f1e694]: 2:00
        - generic [ref=f1e696]:
          - generic [ref=f1e697]: "72"
          - button "Open Large song 0072 on Spotify" [ref=f1e698] [cursor=pointer]:
            - img "Large song 0072 cover" [ref=f1e699]
          - generic [ref=f1e700]:
            - strong [ref=f1e701]: Large song 0072
            - generic [ref=f1e702]: Test Artist
          - generic [ref=f1e703]: 2:00
        - generic [ref=f1e705]:
          - generic [ref=f1e706]: "73"
          - button "Open Large song 0073 on Spotify" [ref=f1e707] [cursor=pointer]:
            - img "Large song 0073 cover" [ref=f1e708]
          - generic [ref=f1e709]:
            - strong [ref=f1e710]: Large song 0073
            - generic [ref=f1e711]: Test Artist
          - generic [ref=f1e712]: 2:00
        - generic [ref=f1e714]:
          - generic [ref=f1e715]: "74"
          - button "Open Large song 0074 on Spotify" [ref=f1e716] [cursor=pointer]:
            - img "Large song 0074 cover" [ref=f1e717]
          - generic [ref=f1e718]:
            - strong [ref=f1e719]: Large song 0074
            - generic [ref=f1e720]: Test Artist
          - generic [ref=f1e721]: 2:00
        - generic [ref=f1e723]:
          - generic [ref=f1e724]: "75"
          - button "Open Large song 0075 on Spotify" [ref=f1e725] [cursor=pointer]:
            - img "Large song 0075 cover" [ref=f1e726]
          - generic [ref=f1e727]:
            - strong [ref=f1e728]: Large song 0075
            - generic [ref=f1e729]: Test Artist
          - generic [ref=f1e730]: 2:00
        - generic [ref=f1e732]:
          - generic [ref=f1e733]: "76"
          - button "Open Large song 0076 on Spotify" [ref=f1e734] [cursor=pointer]:
            - img "Large song 0076 cover" [ref=f1e735]
          - generic [ref=f1e736]:
            - strong [ref=f1e737]: Large song 0076
            - generic [ref=f1e738]: Test Artist
          - generic [ref=f1e739]: 2:00
        - generic [ref=f1e741]:
          - generic [ref=f1e742]: "77"
          - button "Open Large song 0077 on Spotify" [ref=f1e743] [cursor=pointer]:
            - img "Large song 0077 cover" [ref=f1e744]
          - generic [ref=f1e745]:
            - strong [ref=f1e746]: Large song 0077
            - generic [ref=f1e747]: Test Artist
          - generic [ref=f1e748]: 2:00
        - generic [ref=f1e750]:
          - generic [ref=f1e751]: "78"
          - button "Open Large song 0078 on Spotify" [ref=f1e752] [cursor=pointer]:
            - img "Large song 0078 cover" [ref=f1e753]
          - generic [ref=f1e754]:
            - strong [ref=f1e755]: Large song 0078
            - generic [ref=f1e756]: Test Artist
          - generic [ref=f1e757]: 2:00
        - generic [ref=f1e759]:
          - generic [ref=f1e760]: "79"
          - button "Open Large song 0079 on Spotify" [ref=f1e761] [cursor=pointer]:
            - img "Large song 0079 cover" [ref=f1e762]
          - generic [ref=f1e763]:
            - strong [ref=f1e764]: Large song 0079
            - generic [ref=f1e765]: Test Artist
          - generic [ref=f1e766]: 2:00
        - generic [ref=f1e768]:
          - generic [ref=f1e769]: "80"
          - button "Open Large song 0080 on Spotify" [ref=f1e770] [cursor=pointer]:
            - img "Large song 0080 cover" [ref=f1e771]
          - generic [ref=f1e772]:
            - strong [ref=f1e773]: Large song 0080
            - generic [ref=f1e774]: Test Artist
          - generic [ref=f1e775]: 2:00
        - generic [ref=f1e777]:
          - generic [ref=f1e778]: "81"
          - button "Open Large song 0081 on Spotify" [ref=f1e779] [cursor=pointer]:
            - img "Large song 0081 cover" [ref=f1e780]
          - generic [ref=f1e781]:
            - strong [ref=f1e782]: Large song 0081
            - generic [ref=f1e783]: Test Artist
          - generic [ref=f1e784]: 2:00
        - generic [ref=f1e786]:
          - generic [ref=f1e787]: "82"
          - button "Open Large song 0082 on Spotify" [ref=f1e788] [cursor=pointer]:
            - img "Large song 0082 cover" [ref=f1e789]
          - generic [ref=f1e790]:
            - strong [ref=f1e791]: Large song 0082
            - generic [ref=f1e792]: Test Artist
          - generic [ref=f1e793]: 2:00
        - generic [ref=f1e795]:
          - generic [ref=f1e796]: "83"
          - button "Open Large song 0083 on Spotify" [ref=f1e797] [cursor=pointer]:
            - img "Large song 0083 cover" [ref=f1e798]
          - generic [ref=f1e799]:
            - strong [ref=f1e800]: Large song 0083
            - generic [ref=f1e801]: Test Artist
          - generic [ref=f1e802]: 2:00
        - generic [ref=f1e804]:
          - generic [ref=f1e805]: "84"
          - button "Open Large song 0084 on Spotify" [ref=f1e806] [cursor=pointer]:
            - img "Large song 0084 cover" [ref=f1e807]
          - generic [ref=f1e808]:
            - strong [ref=f1e809]: Large song 0084
            - generic [ref=f1e810]: Test Artist
          - generic [ref=f1e811]: 2:00
        - generic [ref=f1e813]:
          - generic [ref=f1e814]: "85"
          - button "Open Large song 0085 on Spotify" [ref=f1e815] [cursor=pointer]:
            - img "Large song 0085 cover" [ref=f1e816]
          - generic [ref=f1e817]:
            - strong [ref=f1e818]: Large song 0085
            - generic [ref=f1e819]: Test Artist
          - generic [ref=f1e820]: 2:00
        - generic [ref=f1e822]:
          - generic [ref=f1e823]: "86"
          - button "Open Large song 0086 on Spotify" [ref=f1e824] [cursor=pointer]:
            - img "Large song 0086 cover" [ref=f1e825]
          - generic [ref=f1e826]:
            - strong [ref=f1e827]: Large song 0086
            - generic [ref=f1e828]: Test Artist
          - generic [ref=f1e829]: 2:00
        - generic [ref=f1e831]:
          - generic [ref=f1e832]: "87"
          - button "Open Large song 0087 on Spotify" [ref=f1e833] [cursor=pointer]:
            - img "Large song 0087 cover" [ref=f1e834]
          - generic [ref=f1e835]:
            - strong [ref=f1e836]: Large song 0087
            - generic [ref=f1e837]: Test Artist
          - generic [ref=f1e838]: 2:00
        - generic [ref=f1e840]:
          - generic [ref=f1e841]: "88"
          - button "Open Large song 0088 on Spotify" [ref=f1e842] [cursor=pointer]:
            - img "Large song 0088 cover" [ref=f1e843]
          - generic [ref=f1e844]:
            - strong [ref=f1e845]: Large song 0088
            - generic [ref=f1e846]: Test Artist
          - generic [ref=f1e847]: 2:00
        - generic [ref=f1e849]:
          - generic [ref=f1e850]: "89"
          - button "Open Large song 0089 on Spotify" [ref=f1e851] [cursor=pointer]:
            - img "Large song 0089 cover" [ref=f1e852]
          - generic [ref=f1e853]:
            - strong [ref=f1e854]: Large song 0089
            - generic [ref=f1e855]: Test Artist
          - generic [ref=f1e856]: 2:00
        - generic [ref=f1e858]:
          - generic [ref=f1e859]: "90"
          - button "Open Large song 0090 on Spotify" [ref=f1e860] [cursor=pointer]:
            - img "Large song 0090 cover" [ref=f1e861]
          - generic [ref=f1e862]:
            - strong [ref=f1e863]: Large song 0090
            - generic [ref=f1e864]: Test Artist
          - generic [ref=f1e865]: 2:00
        - generic [ref=f1e867]:
          - generic [ref=f1e868]: "91"
          - button "Open Large song 0091 on Spotify" [ref=f1e869] [cursor=pointer]:
            - img "Large song 0091 cover" [ref=f1e870]
          - generic [ref=f1e871]:
            - strong [ref=f1e872]: Large song 0091
            - generic [ref=f1e873]: Test Artist
          - generic [ref=f1e874]: 2:00
        - generic [ref=f1e876]:
          - generic [ref=f1e877]: "92"
          - button "Open Large song 0092 on Spotify" [ref=f1e878] [cursor=pointer]:
            - img "Large song 0092 cover" [ref=f1e879]
          - generic [ref=f1e880]:
            - strong [ref=f1e881]: Large song 0092
            - generic [ref=f1e882]: Test Artist
          - generic [ref=f1e883]: 2:00
        - generic [ref=f1e885]:
          - generic [ref=f1e886]: "93"
          - button "Open Large song 0093 on Spotify" [ref=f1e887] [cursor=pointer]:
            - img "Large song 0093 cover" [ref=f1e888]
          - generic [ref=f1e889]:
            - strong [ref=f1e890]: Large song 0093
            - generic [ref=f1e891]: Test Artist
          - generic [ref=f1e892]: 2:00
        - generic [ref=f1e894]:
          - generic [ref=f1e895]: "94"
          - button "Open Large song 0094 on Spotify" [ref=f1e896] [cursor=pointer]:
            - img "Large song 0094 cover" [ref=f1e897]
          - generic [ref=f1e898]:
            - strong [ref=f1e899]: Large song 0094
            - generic [ref=f1e900]: Test Artist
          - generic [ref=f1e901]: 2:00
        - generic [ref=f1e903]:
          - generic [ref=f1e904]: "95"
          - button "Open Large song 0095 on Spotify" [ref=f1e905] [cursor=pointer]:
            - img "Large song 0095 cover" [ref=f1e906]
          - generic [ref=f1e907]:
            - strong [ref=f1e908]: Large song 0095
            - generic [ref=f1e909]: Test Artist
          - generic [ref=f1e910]: 2:00
        - generic [ref=f1e912]:
          - generic [ref=f1e913]: "96"
          - button "Open Large song 0096 on Spotify" [ref=f1e914] [cursor=pointer]:
            - img "Large song 0096 cover" [ref=f1e915]
          - generic [ref=f1e916]:
            - strong [ref=f1e917]: Large song 0096
            - generic [ref=f1e918]: Test Artist
          - generic [ref=f1e919]: 2:00
        - generic [ref=f1e921]:
          - generic [ref=f1e922]: "97"
          - button "Open Large song 0097 on Spotify" [ref=f1e923] [cursor=pointer]:
            - img "Large song 0097 cover" [ref=f1e924]
          - generic [ref=f1e925]:
            - strong [ref=f1e926]: Large song 0097
            - generic [ref=f1e927]: Test Artist
          - generic [ref=f1e928]: 2:00
        - generic [ref=f1e930]:
          - generic [ref=f1e931]: "98"
          - button "Open Large song 0098 on Spotify" [ref=f1e932] [cursor=pointer]:
            - img "Large song 0098 cover" [ref=f1e933]
          - generic [ref=f1e934]:
            - strong [ref=f1e935]: Large song 0098
            - generic [ref=f1e936]: Test Artist
          - generic [ref=f1e937]: 2:00
        - generic [ref=f1e939]:
          - generic [ref=f1e940]: "99"
          - button "Open Large song 0099 on Spotify" [ref=f1e941] [cursor=pointer]:
            - img "Large song 0099 cover" [ref=f1e942]
          - generic [ref=f1e943]:
            - strong [ref=f1e944]: Large song 0099
            - generic [ref=f1e945]: Test Artist
          - generic [ref=f1e946]: 2:00
        - generic [ref=f1e948]:
          - generic [ref=f1e949]: "100"
          - button "Open Large song 0100 on Spotify" [ref=f1e950] [cursor=pointer]:
            - img "Large song 0100 cover" [ref=f1e951]
          - generic [ref=f1e952]:
            - strong [ref=f1e953]: Large song 0100
            - generic [ref=f1e954]: Test Artist
          - generic [ref=f1e955]: 2:00
  - text:   
  - contentinfo [ref=f1e957]:
    - generic [ref=f1e958]: Powered by Spotify
    - generic [ref=f1e959]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e960] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {expect, test} from './fixtures';
  2   | import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  3   | 
  4   | test('large cached playlists render incrementally and search the entire collection', async ({page}, testInfo) => {
  5   |   await mockSpotify(page);
  6   |   await seedAuthenticatedBrowser(page);
  7   |   await page.evaluate(async () => {
  8   |     await new Promise<void>((resolve, reject) => {
  9   |       const request = indexedDB.open('AnalytifyDB', 4);
  10  |       request.onerror = () => reject(request.error);
  11  |       request.onsuccess = () => {
  12  |         const db = request.result;
  13  |         const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
  14  |         const tracks = Array.from({length: 1000}, (_, index) => ({
  15  |           id: `large-song-${index}`, name: `Large song ${String(index + 1).padStart(4, '0')}`,
  16  |           playlist_index: index, duration_ms: 120000,
  17  |           artists: [{id: 'artist-1', name: 'Test Artist'}],
  18  |           album: {id: 'album-1', name: 'Test Album', images: []},
  19  |           external_urls: {spotify: `https://open.spotify.com/track/large-song-${index}`}
  20  |         }));
  21  |         for (const userId of ['e2e-user', 'e2e-user_dev']) {
  22  |           transaction.objectStore('featureData').put({key: `${userId}_playlist-1`,
  23  |             value: JSON.stringify([{id: 'artist-1', name: 'Test Artist', images: [], tracks}])});
  24  |           const store = transaction.objectStore('appData');
  25  |           store.put({key: `${userId}_playlist-1_lastUpdated`, value: String(Date.now())});
  26  |           store.put({key: `${userId}_playlist-1_Amount`, value: '1000'});
  27  |           store.put({key: `${userId}_playlist-1_CachedTrackCount`, value: '1000'});
  28  |           store.put({key: `${userId}_playlist-1_Name`, value: JSON.stringify('Large playlist')});
  29  |         }
  30  |         transaction.oncomplete = () => {db.close(); resolve();};
  31  |         transaction.onerror = () => reject(transaction.error);
  32  |       };
  33  |     });
  34  |   });
  35  |   await page.goto('/new/songs/playlist-1');
  36  |   await page.getByRole('button', {name: 'Songs', exact: true}).click();
  37  |   const rows = page.locator('.v2-track-row');
  38  |   await expect(rows).toHaveCount(50);
  39  |   const sample = () => page.evaluate(() => ({
  40  |     elements: document.querySelectorAll('*').length,
  41  |     rows: document.querySelectorAll('.v2-track-row').length,
  42  |     artworkWithoutDimensions: [...document.querySelectorAll<HTMLImageElement>('.v2-track-row img')]
  43  |       .filter(image => !image.width || !image.height).length,
  44  |     eagerArtwork: document.querySelectorAll('.v2-track-row img:not([loading="lazy"])').length
  45  |   }));
  46  |   const initial = await sample();
  47  |   expect(initial.artworkWithoutDimensions).toBe(0);
  48  |   expect(initial.eagerArtwork).toBe(0);
  49  |   const distantCopy = rows.nth(49).locator('.v2-track-copy');
  50  |   await expect.poll(() => distantCopy.evaluate(element =>
  51  |     element.checkVisibility({contentVisibilityAuto: true}))).toBe(false);
  52  |   const containment = await rows.nth(49).evaluate(element => ({
  53  |     contentVisibility: getComputedStyle(element).contentVisibility,
  54  |     intrinsicSize: getComputedStyle(element).containIntrinsicSize,
  55  |     height: element.getBoundingClientRect().height
  56  |   }));
  57  |   expect(containment.contentVisibility).toBe('auto');
  58  |   expect(containment.intrinsicSize).not.toBe('none');
  59  |   expect(containment.height).toBeGreaterThan(0);
  60  |   await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  61  |   await expect(rows).toHaveCount(100);
  62  |   await expect.poll(() => distantCopy.evaluate(element =>
> 63  |     element.checkVisibility({contentVisibilityAuto: true}))).toBe(true);
      |                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  64  |   const revealedAction = rows.nth(49).getByRole('button', {name: 'Open Large song 0050 on Spotify'});
  65  |   await revealedAction.focus();
  66  |   await expect(revealedAction).toBeFocused();
  67  |   await page.evaluate(() => window.scrollTo(0, 0));
  68  |   const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  69  |   const samples = [initial, await sample()];
  70  |   for (let iteration = 0; iteration < 3; iteration++) {
  71  |     await search.fill('Large song 1000');
  72  |     await expect(rows).toHaveCount(1);
  73  |     await expect(rows.first()).toContainText('Large song 1000');
  74  |     await search.fill('');
  75  |     await expect(rows).toHaveCount(50);
  76  |     const current = await sample();
  77  |     expect(current).toEqual(initial);
  78  |     samples.push(current);
  79  |   }
  80  |   await testInfo.attach('large-playlist-incremental-rendering.json', {
  81  |     body: JSON.stringify({project: testInfo.project.name, collectionSize: 1000, containment,
  82  |       scope: 'mocked local cache; incremental DOM and full-collection search, not virtualization or field performance', samples}, null, 2),
  83  |     contentType: 'application/json'
  84  |   });
  85  | });
  86  | 
  87  | test('canonical library records navigation and interaction performance evidence', async ({page}, testInfo) => {
  88  |   await mockSpotify(page);
  89  |   await seedAuthenticatedBrowser(page);
  90  |   await page.addInitScript(() => {
  91  |     const metrics = {lcp: 0, cls: 0, shifts: [] as unknown[], longTasks: [] as number[], interactions: [] as number[]};
  92  |     (window as any).__releasePerformance = metrics;
  93  |     for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask', 'event']) {
  94  |       if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
  95  |       new PerformanceObserver(list => {
  96  |         for (const entry of list.getEntries()) {
  97  |           const item = entry as any;
  98  |           if (type === 'largest-contentful-paint') metrics.lcp = entry.startTime;
  99  |           if (type === 'layout-shift' && !item.hadRecentInput) {
  100 |             metrics.cls += item.value;
  101 |             metrics.shifts.push({value: item.value, time: entry.startTime,
  102 |               sources: item.sources?.map((source: any) => ({
  103 |                 node: source.node?.outerHTML?.slice(0, 300),
  104 |                 previousRect: source.previousRect, currentRect: source.currentRect
  105 |               }))});
  106 |           }
  107 |           if (type === 'longtask') metrics.longTasks.push(entry.duration);
  108 |           if (type === 'event' && item.interactionId) metrics.interactions.push(entry.duration);
  109 |         }
  110 |       }).observe(type === 'event' ? {type, buffered: true, durationThreshold: 16} : {type, buffered: true});
  111 |     }
  112 |   });
  113 |   const profiler = await page.context().newCDPSession(page);
  114 |   await profiler.send('Tracing.start', {
  115 |     categories: 'devtools.timeline,blink.user_timing,toplevel,disabled-by-default-devtools.timeline',
  116 |     transferMode: 'ReturnAsStream'
  117 |   });
  118 |   await page.goto('/new/playlists');
  119 |   const search = page.getByRole('searchbox', {name: 'Search your playlists'});
  120 |   await expect(search).toBeVisible();
  121 |   await expect(page.getByText('Test Playlist', {exact: true})).toBeVisible();
  122 |   await page.evaluate(() => performance.mark('library-search-start'));
  123 |   await search.fill('Test');
  124 |   await page.evaluate(() => {
  125 |     performance.mark('library-search-end');
  126 |     performance.measure('library-search', 'library-search-start', 'library-search-end');
  127 |     performance.mark('account-dialog-start');
  128 |   });
  129 |   await page.getByRole('button', {name: 'Open account and data settings'}).click();
  130 |   await page.keyboard.press('Escape');
  131 |   await page.evaluate(() => {
  132 |     performance.mark('account-dialog-end');
  133 |     performance.measure('account-dialog-open-close', 'account-dialog-start', 'account-dialog-end');
  134 |   });
  135 |   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  136 |   const metrics = await page.evaluate(() => (window as any).__releasePerformance);
  137 |   await testInfo.attach('canonical-library-performance.json', {
  138 |     body: JSON.stringify({scope: 'local mocked-data lab sample; not field p75 or a Lighthouse report',
  139 |       project: testInfo.project.name, browser: 'Chromium', metrics}, null, 2),
  140 |     contentType: 'application/json'
  141 |   });
  142 |   const finished = new Promise<{stream: string}>(resolve => profiler.once('Tracing.tracingComplete', resolve));
  143 |   await profiler.send('Tracing.end');
  144 |   const {stream} = await finished;
  145 |   const trace: Buffer[] = [];
  146 |   let eof = false;
  147 |   while (!eof) {
  148 |     const chunk = await profiler.send('IO.read', {handle: stream, size: 262144});
  149 |     trace.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
  150 |     eof = chunk.eof;
  151 |   }
  152 |   await profiler.send('IO.close', {handle: stream});
  153 |   await profiler.detach();
  154 |   const traceBody = Buffer.concat(trace);
  155 |   await testInfo.attach('chrome-performance-trace.json', {
  156 |     body: traceBody, contentType: 'application/json'
  157 |   });
  158 |   const events = JSON.parse(traceBody.toString('utf8')).traceEvents as {name: string}[];
  159 |   expect(events.some(event => event.name === 'library-search')).toBe(true);
  160 |   expect(events.some(event => event.name === 'account-dialog-open-close')).toBe(true);
  161 |   expect(metrics.cls).toBeLessThanOrEqual(0.1);
  162 |   expect(metrics.lcp).toBeGreaterThan(0);
  163 | });
```