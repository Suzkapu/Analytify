import {Component, OnDestroy, OnInit} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ImageHealingService} from "../../services/image-healing/image-healing.service";

@Component({
  selector: 'app-artist-details',
  templateUrl: './artist-details.component.html',
  styleUrls: ['./artist-details.component.scss'],
})
export class ArtistDetailsComponent implements OnInit, OnDestroy {
  artist: any = {};
  tracks: any[] = [];
  allTags: any;
  selectedTag: any;
  playlistId: string = '';


  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private imageHealingService: ImageHealingService
  ) {
    this.route.params.subscribe((params) => {
      this.tracks = history.state.tracks;
      this.playlistId = history.state.playlistId || '';
      this.loadArtistDetails(params['id']);
    });
  }



  ngOnInit() {
  }

  ngOnDestroy() {
  }

  loadArtistDetails(id: string) {
    const userId = this.authService.getUserId() || 'anonymous';
    if (this.playlistId) {
      const storageKey = `${userId}_${this.playlistId}`;
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        const found = parsed.find((a: any) => a.id === id);
        if (found) {
          console.log(this.authService.isBackupActive() ? "[ArtistDetails] Loading artist details from Supabase Cloud Backup (Local Cache)" : "[ArtistDetails] Loading artist details from Local Storage Cache (Cloud Backup disabled)");
          this.artist = found;
          // Heal missing image silently; wraps the single artist in an array
          // and passes the storageKey so the cache is updated if a real image is found
          this.imageHealingService.healArtistImages([this.artist], storageKey);
          return;
        }
      }
    }

    console.log("[ArtistDetails] Cache missing. Loading artist details from Spotify API...");
    this.spotifyDataService.getSingleArtist(id).subscribe((artist: any) => {
      this.artist = artist;
    });
  }

  openTrackClick(url: string) {
    window.location.href = url;
  }

  openArtistClick() {
    window.location.href = this.artist.external_urls?.spotify;
  }

  goBack() {
    if (this.playlistId) {
      this.router.navigate(['/songs', this.playlistId]);
    } else {
      this.router.navigate(['/playlists']);
    }
  }


}
