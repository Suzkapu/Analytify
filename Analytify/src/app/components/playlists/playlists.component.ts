import {Component, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";

@Component({
  selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';

  constructor(private route: ActivatedRoute, private router: Router, private spotifyDataService: SpotifyDataService) {
    this.route.params.subscribe(() => {
      this.loadPlaylists();
    });
  }

  loadPlaylists() {
    // Überprüfen, ob Daten bereits in der Session gespeichert sind
    const storedPlaylists = sessionStorage.getItem('playlists');

    if (storedPlaylists) {
      console.log("from storage")
      // Wenn Daten vorhanden sind, sie verwenden
      this.playlists = JSON.parse(storedPlaylists);
      this.filterPlaylists();
    } else {
      console.log("from api")
      // Andernfalls Daten von der API abrufen
      this.spotifyDataService.getUserPlaylists().subscribe((playlists: any) => {
        this.playlists = [...playlists.items];
        const favPlaylist = {
          name: 'Favourite Tracks',
          id: 'fav',
          images: {
            0: {
              url: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
            },
          },
        };
        this.playlists = [favPlaylist, ...this.playlists];

        // Playlists in der Session speichern
        sessionStorage.setItem('playlists', JSON.stringify(this.playlists));

        this.filterPlaylists();
      });
    }
  }

  filterPlaylists() {
    if (this.searchText.trim() === '') {
      this.filteredPlaylists = this.playlists;
    } else {
      this.filteredPlaylists = this.playlists.filter(playlist =>
        playlist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }
  }

  viewArtists(playlistId: string) {
    this.router.navigate(['/artists', playlistId]);
  }
}
