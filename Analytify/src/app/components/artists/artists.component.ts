import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";

@Component({
  selector: 'app-artists',
  templateUrl: './artists.component.html',
  styleUrls: ['./artists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})

export class ArtistsComponent implements OnInit {
  artists: any[] = [];
  searchText: string = '';
  playlistName: string = '';
  filteredArtists: any[] = [];
  sortAscending: boolean = true;
  playlistId: string = '';
  totalTracks: number = 0;

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    private authService: SpotifyAuthService
  ) {
    this.route.params.subscribe((params) => {
      this.playlistId = params['id'];
      this.loadArtistsFromPlaylist();
    });
  }

  ngOnInit() {
    this.filterArtists();
  }

  loadArtistsFromPlaylist() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storedArtists = localStorage.getItem(`${userId}_${this.playlistId}`);
    if (storedArtists) {
      console.log("from storage");
      this.artists = JSON.parse(storedArtists);
      this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
      this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
      this.filterArtists();
    } else {
      console.log("from api");
      if (this.playlistId === 'fav') {
        this.spotifyDataService.getFavTracks(0, 50).subscribe((tracks: any) => {
          this.playlistName = 'Favourite Tracks';
          this.totalTracks = tracks.total;
          this.getArtistsFromTracks(tracks.items);
          this.setSessionStorage();
        });
      } else {
        this.spotifyDataService.getSinglePlaylist(this.playlistId).subscribe((playlist: any) => {
          console.log(playlist)
          this.playlistName = playlist.name;
          this.totalTracks = playlist.tracks.total;
          this.getArtistsFromTracks(playlist.tracks.items);
          this.setSessionStorage();
        });
      }
    }
  }

  setSessionStorage() {
    this.filterArtists();
    let artists = this.filteredArtists;
    artists.forEach(artist => {
      artist.tracks.forEach((track: any) => {
        delete track.artists;
        delete track.album.album_type;
        delete track.album.artists;
        delete track.album.external_urls;
        delete track.album.href;
        delete track.album.is_playable;
        delete track.album.name;
        delete track.album.release_date;
        delete track.album.release_date_precision;
        delete track.album.total_tracks;
        delete track.album.type;
        delete track.album.uri;
        delete track.available_markets;
        delete track.disc_number;
        delete track.duration_ms;
        delete track.explicit;
        delete track.external_ids;
        delete track.href;
        delete track.is_local;
        delete track.popularity;
        delete track.preview_url;
        delete track.track_number;
        delete track.type;
        delete track.uri;
        delete track.episode;
        delete track.is_playable;
        delete track.track;
      });
      delete artist.type;
    });
    const userId = this.authService.getUserId() || 'anonymous';
    localStorage.setItem(`${userId}_${this.playlistId}`, JSON.stringify(artists));
    localStorage.setItem(`${userId}_${this.playlistId}_Amount`, JSON.stringify(this.totalTracks));
    localStorage.setItem(`${userId}_${this.playlistId}_Name`, JSON.stringify(this.playlistName));
  }

  loadAll(offset: number, totalAmount: number) {
    if (this.playlistId === 'fav') {
      const limit = 50;
      this.spotifyDataService.getFavTracks(offset, limit).subscribe((tracks: any) => {
        this.getArtistsFromTracks(tracks.items);
        if (offset <= totalAmount) {
          this.loadAll(offset + limit, totalAmount);
          console.log(offset + " Songs of " + totalAmount + " loaded");
        }
      });
    } else {
      const limit = 100;
      this.spotifyDataService.getAllTracksFromPlaylist(this.playlistId, offset, limit).subscribe((tracks: any) => {
        this.getArtistsFromTracks(tracks.items);
        if (offset <= totalAmount) {
          this.loadAll(offset + limit, totalAmount);
          console.log(offset + " Songs of " + totalAmount + " loaded");
        }
      });
    }
    this.setSessionStorage();
    this.filterArtists();
  }

  getArtistsFromTracks(items: any[]) {
    try {
      for (let item of items) {
        let track = item.track;
        for (let artist of track.artists) {
          let existingArtist = this.artists.find(a => a.id === artist.id);
          if (!existingArtist) {
            artist.tracks = [track];
            this.artists.push(artist);
          } else {
            let existingTrack = existingArtist.tracks.find((t: { id: any }) => t.id === track.id);
            if (!existingTrack) {
              existingArtist.tracks.push(track);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting artists from tracks:', error);
    }
  }

  filterArtists() {
    if (this.searchText.trim() === '') {
      this.filteredArtists = this.artists;
    } else {
      this.filteredArtists = this.artists.filter(artist =>
        artist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }
  }

  artistDetails(id: string) {
    const tracks = this.artists.find(artist => artist.id === id)?.tracks || [];

    const navigationExtras: NavigationExtras = {
      state: {
        tracks: tracks
      }
    };

    this.router.navigate(['/artistDetails', id], navigationExtras);
  }

  sortArtistsByTracks() {
    if (this.sortAscending) {
      this.filteredArtists.sort((a, b) => b.tracks.length - a.tracks.length);
    } else {
      this.filteredArtists.sort((a, b) => a.tracks.length - b.tracks.length);
    }
    this.sortAscending = !this.sortAscending;
  }
}
