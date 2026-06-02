import {Component, OnDestroy, OnInit} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {ActivatedRoute, Router} from "@angular/router";

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
  profilePicUrl: string | null = null;

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    private authService: SpotifyAuthService
  ) {
    this.route.params.subscribe((params) => {
      this.loadArtistDetails(params['id']);
      this.tracks = history.state.tracks;
      this.playlistId = history.state.playlistId || '';
      console.log(this.tracks)
      this.loadUserProfile();
    });
  }

  loadUserProfile() {
    const cached = sessionStorage.getItem('spotify_profile_pic');
    if (cached !== null) {
      this.profilePicUrl = cached || null;
    } else {
      this.spotifyDataService.getCurrentUser().subscribe({
        next: (user: any) => {
          const pic = user.images && user.images[0] ? user.images[0].url : '';
          sessionStorage.setItem('spotify_profile_pic', pic);
          this.profilePicUrl = pic || null;
        },
        error: (err) => console.error('Failed to load user profile:', err)
      });
    }
  }

  ngOnInit() {
    document.body.classList.add('no-scroll');
  }

  ngOnDestroy() {
    document.body.classList.remove('no-scroll');
  }

  loadArtistDetails(id: string) {
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
      this.router.navigate(['/artists', this.playlistId]);
    } else {
      this.router.navigate(['/playlists']);
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
