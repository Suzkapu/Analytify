# Feature requirements

> Work in progress: these notes describe intended behavior and may change. Empty sections remain undecided.

## Sites
## Playlist view
- look at your all of your Playlists.
- there needs to be an dropdown to select a filter on only my playlists, saved from others, shared with me from
- there should be a count on how many playlists you have
- search for each playlist
- the search needs to be place so it can be used for all the sub-pages as well, same with sorting
### songs page
- all songs that are in the playlist listed
- searchbar needed to search for song titles
- songs should have the name, artist, album if existing
- every song need its picture
#### song onclick()
- when clicking on a song card it should expand that card and tell some additional information about it (everything usefull the spotify api gets us)
### artists page
- list all artists that are in the playlist
- artists are also features on songs so not only the main artist
- features toggle button for features or own songs
- search for artists
- every artists needs his picuture
- needs to be displayed:
	- artist name
	- amount of songs he has in the playlist based on if the features toggle is on or not
#### artists onclick()
- clicking the artists card it should expand the card and list all the songs that the artist contributed to
- the features toggle needs to also apply on the expanded card
### albums page
- needs to list all the albums that are in the playlist
- search bar for album name or artist
- needs to be displayed:
	- cover needs to be shown
	- artist the album belongs to (not the features here)
	- amout of songs that are in the album that you liked
#### albums onclick()
- show the songs that are in the album
- show the amout of song you liked out of the full amout of songs in the album
- other usefull information that we get from the api like the release date, ...
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
- every picture should link to the matching spotify page
- show a loading state while the playlist data is being analysed
- if there is no data for a statistic show that it is unavailable
## Stats
- universal calendar picker to select from
- calendar picker should be able to select a single date to view stats from or select a time frame to compare stats to
- universal time periode picker
	- 4 weeks
	- 6 months
	- 1 year
- search bar for submenus to use
- toggle for searchbar to also search in past rankings
### Songs
- display all 100 top songs
- each card displayed:
	- song name
	- artist
	- current rank
	- move indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- flame icon with burning animation if the song has moved up a lot
			- there is a limit on how many songs can have this
			- only top movers are getting displayed
		- blue dot if the song is new
			- if the song is new this turns the flame blue
				- this goes into the same pool for the flames
#### songs onclick()
- open card and shows graph of past rankings of the song spezific data
### Artists
- display all available top artists for the selected time periode and date
- each card displayed:
	- artist picture
	- artist name
	- current rank
	- move indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- flame icon with burning animation if the artist has moved up a lot
			- there is a limit on how many artists can have this
			- only top movers are getting displayed
		- blue dot if the artist is new
			- if the artist is new this turns the flame blue
				- this goes into the same pool for the flames
- search for artists by name
- when search in past rankings is enabled also show artists that were in past rankings but are not in the selected ranking
#### artists onclick()
- open card and shows graph of past rankings of the artist spezific data
### Genres
- display the top genres for the selected time periode and date
- genres are based on the genres of the top artists for the selected stats
- each card displayed:
	- genre name
	- current rank
	- percentage of the genre in the selected stats as a bar
		- the bars 100% should be the highest genre
			- if the nr 1 genre has 28% that should be the 100% of the bar
			- all the others orientate on that
	- move indication when compare is selected
		- green arrow up when moved up compared to selected stats
		- red arrow down when moved down compared to selected other stats
		- blue dot if the genre is new
- search for genres by name
#### genres onclick()
- open card and shows graph of past rankings and percentage of the genre over time
- show the artists from the selected stats that belong to the genre
## History
- each card displayed:
	- time of listening
	- picture of the song
	- artist
	- song name
## Login Screen #1
- short Explaination on what the project does
- get Started
## Login Screen #2
Endowment Effect:
- let the user select his theme color (green default)
- white/darkmode/system color (system color by default)
- a small preview of:
	- playlists overview
	- genre stats
	- this preview has a vertical to the right tilted line that does the splitting on playlists and genres
	- this needs to react to the themeing changes
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
## Menu
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
		- only shown to administrators (check needs to be server sided)
- each page should have an icon and a name
- highlight the page that is currently selected
- show the analytify logo and name in the menu
- show the user picture and name at the bottom of the menu
	- clicking the user opens the settings
### desktop
- show the menu as a sidebar on the left side
- the sidebar should stay usable when the screen is smaller or the menu has more entries
### mobile
- show the logo and a button to open the menu at the top
- open the menu as a sidebar with the same grouped pages as desktop
- allow closing the menu without selecting a page
- show a floating navigation bar at the bottom for playlists, stats and history
- the bottom navigation should highlight the selected page
- menu buttons need to be usable with touch and keyboard
## Back button
- we need a universal back button that works for every page aligned with the apple/ios way to do this
