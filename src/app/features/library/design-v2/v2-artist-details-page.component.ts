import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Optional} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {V2ButtonDirective, V2CardComponent, V2ListRowComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent} from '@shared/ui-v2';
import {ArtistDetailsController} from '../artist-details/artist-details.controller';

@Component({
  selector: 'app-v2-artist-details-page', standalone: true,
  imports: [RouterLink, V2ButtonDirective, V2CardComponent, V2ListRowComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent],
  template: `
    <v2-page eyebrow="Library" [title]="artist.name || 'Artist details'" description="See this artist and their songs from the selected playlist.">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink"><i class="pi pi-arrow-left"></i> Back</a>
      @if (isLoadingArtist) {
        <v2-state kind="loading" title="Loading artist details…" message="Checking the playlist cache and saved artist data first." />
      } @else if (artistLoadError) {
        <v2-state kind="error" icon="pi-exclamation-circle" title="Artist unavailable" [message]="artistLoadError" />
      } @else {
        <v2-card class="v2-artist-profile">
          <button type="button" class="v2-artist-photo" [disabled]="!getArtistSpotifyUrl()" (click)="openArtistClick()" [attr.aria-label]="'Open ' + (artist.name || 'artist') + ' on Spotify'">
            <img [src]="artist.images?.[0]?.url || 'assets/Analytify-384.webp'" width="150" height="150" alt="">
            <span><i class="pi pi-external-link"></i> Spotify</span>
          </button>
          <div><p class="v2-profile-eyebrow">Artist in this playlist</p><h2>{{ artist.name }}</h2><p>{{ tracks.length }} {{ tracks.length === 1 ? 'song' : 'songs' }}</p></div>
        </v2-card>
        <section aria-label="Songs in this playlist">
          <v2-section-header title="Songs in this playlist" [description]="tracks.length + ' matching songs'" />
          @if (!tracks.length) {
            <v2-state icon="pi-music" title="No songs found" message="No available songs by this artist were found in the selected playlist." />
          } @else {
            <div class="v2-artist-tracks">
              @for (track of tracks; track track.id || track.uri || $index) {
                <v2-list-row class="v2-artist-track">
                  <button type="button" class="v2-track-cover" [disabled]="!track.external_urls?.spotify" (click)="openTrackClick(track.external_urls?.spotify)" [attr.aria-label]="'Open ' + track.name + ' on Spotify'">
                    <img [src]="track.album?.images?.[0]?.url || 'assets/Analytify-96.webp'" width="56" height="56" alt="" loading="lazy">
                  </button>
                  <strong>{{ track.name }}</strong>
                  @if (track.explicit) { <span class="v2-explicit">Explicit</span> }
                  <i class="pi pi-external-link" aria-hidden="true"></i>
                </v2-list-row>
              }
            </div>
          }
        </section>
      }
    </v2-page>
  `,
  styleUrl: './v2-artist-details-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ArtistDetailsPageComponent extends ArtistDetailsController {
  readonly backLink = history.state?.playlistId ? this.navigation.commands('songs', {id: history.state.playlistId}) : this.navigation.commands('playlists');
  constructor(route: ActivatedRoute, spotifyData: SpotifyDataService, router: Router, auth: SpotifyAuthService,
    storage: StorageService, supabase: SupabaseService, @Optional() readonly navigation: DesignNavigationService, changeDetector: ChangeDetectorRef) {
    super(route, spotifyData, router, auth, storage, supabase, navigation, changeDetector);
  }
}
