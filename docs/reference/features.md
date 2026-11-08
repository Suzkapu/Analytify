# Feature requirements

> Work in progress: these notes describe intended behavior and may change. Empty sections remain undecided.

## Sites
## Playlist view
- look at all of your playlists
- there needs to be a dropdown to filter between my playlists, playlists saved from others, and playlists shared with me (details not finished yet)
- there should be a count on how many playlists you have
- search for a playlist
- the search and sorting need to be placed so they can also be used on all subpages
### songs page
- list all songs that are in the playlist
- search bar needed to search for song titles
- songs should show the name, artist, and album if available
- every song needs its picture
#### song onclick()
- when clicking on a song card, expand it and show additional useful information available from the Spotify API
### artists page
- list all artists that are in the playlist
- include featured artists on songs, not only the main artist
- add a toggle to include featured songs or show only the artist’s own songs
- search for artists
- every artist needs their picture
- needs to be displayed:
	- artist name
	- amount of songs the artist has in the playlist, depending on the features toggle
#### artists onclick()
- clicking an artist card should expand it and list all songs the artist contributed to
- the features toggle needs to also apply on the expanded card
### albums page
- needs to list all the albums that are in the playlist
- search bar for album name or artist
- needs to be displayed:
	- cover needs to be shown
	- artist the album belongs to (not the features here)
	- amount of songs in the album that you liked
#### albums onclick()
- show the songs that are in the album
- show the amount of songs you liked out of the total amount of songs in the album
- other useful information available from the API, such as the release date
### analysis page
- show an overview of the selected playlist or favourite tracks
- display:
	- total amount of songs
	- amount of artists
	- amount of albums
	- total length of the playlist
	- amount of explicit songs
	- average song length
- show the top artists and top albums that appear most often in the playlist
	- show the amount of songs for each artist or album
- show the oldest and newest released song in the playlist
	- display the song name, picture and release date
- show the shortest and longest song in the playlist
	- display the song name, picture and length
- every picture should link to the matching Spotify page
- show a loading state while the playlist data is being analysed
- if there is no data for a statistic show that it is unavailable
## Stats
- universal calendar picker to select from
- calendar picker should be able to select a single date to view stats from or select a time frame to compare stats to
- universal time period picker
	- 4 weeks
	- 6 months
	- 1 year
- search bar for submenus to use
- toggle for search bar to also search in past rankings
### Songs
- display all 100 top songs
- display on each card:
	- song name
	- artist
	- current rank
	- movement indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- flame icon with burning animation if the song has moved up a lot
			- there is a limit on how many songs can have this
			- only display the top movers
		- blue dot if the song is new
			- if the song is new this turns the flame blue
				- this goes into the same pool for the flames
#### songs onclick()
- open the card and show a graph of the song’s past rankings
### Artists
- display all available top artists for the selected time period and date
- display on each card:
	- artist picture
	- artist name
	- current rank
	- movement indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- flame icon with burning animation if the artist has moved up a lot
			- there is a limit on how many artists can have this
			- only display the top movers
		- blue dot if the artist is new
			- if the artist is new this turns the flame blue
				- this goes into the same pool for the flames
- search for artists by name
- when search in past rankings is enabled also show artists that were in past rankings but are not in the selected ranking
#### artists onclick()
- open the card and show a graph of the artist’s past rankings
### Genres
- display the top genres for the selected time period and date
- genres are based on the genres of the top artists for the selected stats
- display on each card:
	- genre name
	- current rank
	- percentage of the genre in the selected stats as a bar
		- the highest genre should fill 100% of the bar
			- if the number 1 genre has 28%, that should fill 100% of the bar
			- all other bars should be relative to that
	- movement indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- blue dot if the genre is new
- search for genres by name
#### genres onclick()
- open the card and show a graph of the genre’s past rankings and percentage over time
- show the artists from the selected stats that belong to the genre
## History
- display on each card:
	- time of listening
	- picture of the song
	- artist
	- song name
## Login Screen #1
- short explanation of what the project does
- get started
## Login Screen #2
Endowment Effect:
- let the user select their theme color (green default)
- light mode, dark mode, or system color (system color by default)
- a small preview of:
	- playlists overview
	- genre stats
	- split the playlist and genre previews with a vertical line tilted to the right
	- the preview needs to react to theme changes
## Login Screen #3
-  agree to terms checkbox
- login button
- register button

## Landing
-
## Compare playlists
-
## Private sharing
-
## Song League
-
## Administration
-
## Friends
-
## Legal & Privacy
-
## User Settings
## Footer
has the "Powered by Spotify"
Legal & Privacy linked

## Layout
### Menu
- the menu should be available on every page and show where you are currently
- group the pages in the menu:
	- Library
		- Playlists
	- Listening
		- Stats
		- History
	- Social
		- Friends
		- Song Leagues
		- Private Sharing
	- Tools
		- Compare playlists
	- Administration
		- only shown to administrators (check needs to be server-side)
- each page should have an icon and a name
- highlight the page that is currently selected
- show the Analytify logo and name in the menu
- show the user picture and name at the bottom of the menu
	- clicking the user opens the settings
#### desktop
- show the menu as a sidebar on the left side
- the sidebar should stay usable when the screen is smaller or the menu has more entries
#### mobile
- show the logo and a button to open the menu at the top
- open the menu as a sidebar with the same grouped pages as desktop
- allow closing the menu without selecting a page
- show a floating navigation bar at the bottom for playlists, stats and history
- the bottom navigation should highlight the selected page
- menu buttons need to be usable with touch and keyboard
### Back button
- we need a universal back button that works for every page aligned with the Apple/iOS way to do this
